import {
  createHash,
  createPublicKey,
  createVerify,
  type JsonWebKey,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  type AuthSessionResponse,
  KAFKA_TOPICS,
  type MfaMethod,
  WorldTickerEventSchema,
} from '@pokeverse/shared';
import { z } from 'zod';
import { CryptoService } from '../../common/security/crypto.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { SessionService } from './session.service';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/certs';
const OAUTH_STATE_TTL_SEC = 300;
const GOOGLE_JWKS_CACHE_TTL_SEC = 3600;

interface StoredOAuthState {
  readonly codeVerifier: string;
  readonly nonce: string;
  readonly bindHash: string;
  readonly linkTrainerId: string | null;
}

const GoogleTokenResponseSchema = z.object({
  id_token: z.string().min(10),
  token_type: z.string().optional(),
});

const GoogleJwkKeySchema = z.object({
  kid: z.string().min(1),
  kty: z.literal('RSA'),
  alg: z.string().optional(),
  n: z.string().min(1),
  e: z.string().min(1),
});

const GoogleJwksResponseSchema = z.object({
  keys: z.array(GoogleJwkKeySchema),
});

const GoogleIdTokenHeaderSchema = z.object({
  alg: z.literal('RS256'),
  kid: z.string().min(1),
});

const GoogleIdTokenClaimsSchema = z.object({
  iss: z.enum(['https://accounts.google.com', 'accounts.google.com']),
  aud: z.string().min(1),
  sub: z.string().min(1),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  email_verified: z.boolean(),
  nonce: z.string().min(1),
  exp: z.number().int().positive(),
  name: z.string().optional(),
});

export type VerifiedGoogleClaims = z.infer<typeof GoogleIdTokenClaimsSchema>;
export type GoogleJwkEntry = z.infer<typeof GoogleJwkKeySchema>;

export function verifyGoogleIdTokenSignature(params: {
  readonly idToken: string;
  readonly keys: readonly GoogleJwkEntry[];
  readonly expectedAudience: string;
  readonly expectedNonce: string;
  readonly nowSec?: number;
}): VerifiedGoogleClaims {
  const parts = params.idToken.split('.');
  if (parts.length !== 3) {
    throw new UnauthorizedException('Token OIDC do Google malformado.');
  }

  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) {
    throw new UnauthorizedException('Segmentos ausentes no ID token.');
  }

  let rawHeader: unknown;
  let rawClaims: unknown;
  try {
    rawHeader = JSON.parse(
      Buffer.from(headerB64, 'base64url').toString('utf8'),
    );
    rawClaims = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    );
  } catch {
    throw new UnauthorizedException('Falha ao decodificar ID token OIDC.');
  }

  const headerParsed = GoogleIdTokenHeaderSchema.safeParse(rawHeader);
  if (!headerParsed.success) {
    throw new UnauthorizedException('Cabeçalho OIDC inválido ou não-RS256.');
  }

  const matchingKey = params.keys.find(
    (item) => item.kid === headerParsed.data.kid,
  );
  if (!matchingKey) {
    throw new UnauthorizedException(
      'Chave pública JWK do Google não encontrada.',
    );
  }

  const publicKey = createPublicKey({
    key: matchingKey as unknown as JsonWebKey,
    format: 'jwk',
  });
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();

  const signatureValid = verifier.verify(
    publicKey,
    Buffer.from(sigB64, 'base64url'),
  );
  if (!signatureValid) {
    throw new UnauthorizedException('Assinatura OIDC do Google inválida.');
  }

  const claimsParsed = GoogleIdTokenClaimsSchema.safeParse(rawClaims);
  if (!claimsParsed.success) {
    throw new UnauthorizedException('Claims obrigatórias do Google ausentes.');
  }

  const claims = claimsParsed.data;
  const now = params.nowSec ?? Math.floor(Date.now() / 1000);

  if (claims.aud !== params.expectedAudience) {
    throw new UnauthorizedException('Audience OIDC inválida.');
  }
  if (claims.exp <= now - 30) {
    throw new UnauthorizedException('ID token do Google expirado.');
  }
  if (claims.nonce !== params.expectedNonce) {
    throw new UnauthorizedException('Nonce OIDC divergente.');
  }
  if (!claims.email_verified) {
    throw new UnauthorizedException(
      'O e-mail da conta Google precisa estar verificado.',
    );
  }

  return claims;
}

@Injectable()
export class GoogleOAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly crypto: CryptoService,
    private readonly sessionService: SessionService,
    private readonly config: ConfigService<ApiEnvConfig, true>,
  ) {}

  isConfigured(): boolean {
    const clientId = this.config
      .get('GOOGLE_CLIENT_ID', { infer: true })
      .trim();
    const clientSecret = this.config
      .get('GOOGLE_CLIENT_SECRET', { infer: true })
      .trim();
    return Boolean(clientId && clientSecret);
  }

  getFrontendRedirectBase(): string {
    return this.config.get('WEBAUTHN_ORIGIN', { infer: true }).trim();
  }

  async createAuthorizationRequest(linkTrainerId: string | null): Promise<{
    readonly authorizeUrl: string;
    readonly bindCookieValue: string;
  }> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Login com Google ainda não configurado (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).',
      );
    }

    const state = randomBytes(24).toString('base64url');
    const nonce = randomBytes(24).toString('base64url');
    const codeVerifier = randomBytes(48).toString('base64url');
    const bindCookieValue = randomBytes(24).toString('base64url');

    const stored: StoredOAuthState = {
      codeVerifier,
      nonce,
      bindHash: this.crypto.sha256Hex(bindCookieValue),
      linkTrainerId,
    };

    await this.redis.setJsonEx(
      this.stateKey(state),
      OAUTH_STATE_TTL_SEC,
      stored,
    );

    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    const url = new URL(GOOGLE_AUTH_ENDPOINT);
    url.searchParams.set(
      'client_id',
      this.config.get('GOOGLE_CLIENT_ID', { infer: true }).trim(),
    );
    url.searchParams.set(
      'redirect_uri',
      this.config.get('GOOGLE_REDIRECT_URI', { infer: true }).trim(),
    );
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('prompt', 'select_account');

    return { authorizeUrl: url.toString(), bindCookieValue };
  }

  async handleCallback(params: {
    readonly code: string;
    readonly state: string;
    readonly bindCookieValue: string | undefined;
    readonly traceId: string | null;
  }): Promise<{
    readonly redirectUrl: string;
    readonly sessionSid?: string;
    readonly refreshToken?: string | null;
    readonly session?: AuthSessionResponse;
  }> {
    const baseRedirect = this.getFrontendRedirectBase();
    const stateRedisKey = this.stateKey(params.state);
    const stored = await this.redis.getJson<StoredOAuthState>(stateRedisKey);
    await this.redis.delKeys(stateRedisKey);

    if (
      !stored ||
      !params.bindCookieValue ||
      !this.crypto.safeEqualHex(
        this.crypto.sha256Hex(params.bindCookieValue),
        stored.bindHash,
      )
    ) {
      return { redirectUrl: `${baseRedirect}/?authError=oauth_state_invalid` };
    }

    const clientId = this.config
      .get('GOOGLE_CLIENT_ID', { infer: true })
      .trim();
    const clientSecret = this.config
      .get('GOOGLE_CLIENT_SECRET', { infer: true })
      .trim();
    const redirectUri = this.config
      .get('GOOGLE_REDIRECT_URI', { infer: true })
      .trim();

    const tokenPayload = await this.exchangeAuthorizationCode({
      code: params.code,
      codeVerifier: stored.codeVerifier,
      clientId,
      clientSecret,
      redirectUri,
    });

    const claims = await this.verifyGoogleTokenWithCache({
      idToken: tokenPayload.id_token,
      expectedAudience: clientId,
      expectedNonce: stored.nonce,
    });

    return this.resolveTrainerAccount(
      claims,
      stored.linkTrainerId,
      params.traceId,
    );
  }

  async resolveTrainerAccount(
    claims: VerifiedGoogleClaims,
    linkTrainerId: string | null,
    traceId: string | null,
  ): Promise<{
    readonly redirectUrl: string;
    readonly sessionSid?: string;
    readonly refreshToken?: string | null;
    readonly session?: AuthSessionResponse;
  }> {
    const baseRedirect = this.getFrontendRedirectBase();

    if (linkTrainerId) {
      const existingOAuth = await this.prisma.trainerOAuthAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: 'google',
            providerAccountId: claims.sub,
          },
        },
        select: { trainerId: true },
      });

      if (existingOAuth && existingOAuth.trainerId !== linkTrainerId) {
        return {
          redirectUrl: `${baseRedirect}/?authError=google_already_linked`,
        };
      }

      if (!existingOAuth) {
        await this.prisma.trainerOAuthAccount.create({
          data: {
            trainerId: linkTrainerId,
            provider: 'google',
            providerAccountId: claims.sub,
            email: claims.email,
          },
        });
      }

      return { redirectUrl: `${baseRedirect}/?googleLinked=1` };
    }

    const linkedOAuth = await this.prisma.trainerOAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: claims.sub,
        },
      },
      select: {
        trainer: {
          select: {
            id: true,
            username: true,
            email: true,
            emailVerifiedAt: true,
            mfaEnabled: true,
            totpSecretEncrypted: true,
            passwordHash: true,
            badgesCount: true,
            eloRating: true,
            lastMapId: true,
            lastX: true,
            lastY: true,
            createdAt: true,
            passkeys: { select: { id: true }, take: 1 },
          },
        },
      },
    });

    if (linkedOAuth) {
      return this.issueTrainerSession(linkedOAuth.trainer, baseRedirect);
    }

    const trainerByEmail = await this.prisma.trainer.findUnique({
      where: { email: claims.email },
      select: {
        id: true,
        username: true,
        email: true,
        emailVerifiedAt: true,
        mfaEnabled: true,
        totpSecretEncrypted: true,
        passwordHash: true,
        badgesCount: true,
        eloRating: true,
        lastMapId: true,
        lastX: true,
        lastY: true,
        createdAt: true,
        passkeys: { select: { id: true }, take: 1 },
      },
    });

    if (trainerByEmail) {
      if (trainerByEmail.emailVerifiedAt === null) {
        return {
          redirectUrl: `${baseRedirect}/?authError=verify_email_before_google_link`,
        };
      }

      await this.prisma.trainerOAuthAccount.create({
        data: {
          trainerId: trainerByEmail.id,
          provider: 'google',
          providerAccountId: claims.sub,
          email: claims.email,
        },
      });
      return this.issueTrainerSession(trainerByEmail, baseRedirect);
    }

    const createdTrainer = await this.createNewGoogleTrainer(claims, traceId);
    return this.issueTrainerSession(
      {
        ...createdTrainer,
        totpSecretEncrypted: null,
        passwordHash: null,
        passkeys: [],
      },
      baseRedirect,
    );
  }

  async unlinkGoogle(trainerId: string): Promise<void> {
    const trainer = await this.prisma.trainer.findUnique({
      where: { id: trainerId },
      select: {
        passwordHash: true,
        passkeys: { select: { id: true } },
        oauthAccounts: { select: { id: true, provider: true } },
      },
    });

    if (!trainer) {
      throw new UnauthorizedException('Treinador não encontrado.');
    }

    const hasOtherAuth =
      trainer.passwordHash !== null ||
      trainer.passkeys.length > 0 ||
      trainer.oauthAccounts.some((acc) => acc.provider !== 'google');

    if (!hasOtherAuth) {
      throw new BadRequestException(
        'Defina uma senha ou cadastre uma Passkey antes de desvincular sua conta Google.',
      );
    }

    await this.prisma.trainerOAuthAccount.deleteMany({
      where: { trainerId, provider: 'google' },
    });
  }

  private async issueTrainerSession(
    trainer: {
      readonly id: string;
      readonly username: string;
      readonly email: string;
      readonly emailVerifiedAt: Date | null;
      readonly mfaEnabled: boolean;
      readonly totpSecretEncrypted: string | null;
      readonly passwordHash: string | null;
      readonly badgesCount: number;
      readonly eloRating: number;
      readonly lastMapId: string;
      readonly lastX: number;
      readonly lastY: number;
      readonly createdAt: Date;
      readonly passkeys: readonly { readonly id: string }[];
    },
    baseRedirect: string,
  ) {
    const mfaMethods: MfaMethod[] = [];
    if (trainer.mfaEnabled && trainer.totpSecretEncrypted) {
      mfaMethods.push('totp', 'backup_code');
    }
    if (trainer.mfaEnabled && trainer.passkeys.length > 0) {
      mfaMethods.push('passkey');
    }

    const requiresMfa = trainer.mfaEnabled && mfaMethods.length > 0;
    const familyId = randomUUID();
    let rawRefresh: string | null = null;

    if (!requiresMfa) {
      rawRefresh = randomBytes(48).toString('hex');
      const refreshDays = this.config.get('REFRESH_TTL_DAYS', { infer: true });
      await this.prisma.refreshToken.create({
        data: {
          trainerId: trainer.id,
          tokenHash: this.crypto.sha256Hex(rawRefresh),
          familyId,
          expiresAt: new Date(Date.now() + refreshDays * 86_400_000),
        },
      });
    }

    const { rawSid, session } = await this.sessionService.createSession({
      trainerId: trainer.id,
      username: trainer.username,
      familyId,
      state: requiresMfa ? 'MFA_PENDING' : 'AUTHENTICATED',
      mfaMethods,
    });

    const parsedSession = this.sessionService.buildAuthSessionResponse(
      trainer,
      session.state,
      session.mfaMethods,
    );

    return {
      redirectUrl: requiresMfa
        ? `${baseRedirect}/?mfaPending=1`
        : `${baseRedirect}/`,
      sessionSid: rawSid,
      refreshToken: rawRefresh,
      session: parsedSession,
    };
  }

  private createNewGoogleTrainer(
    claims: VerifiedGoogleClaims,
    traceId: string | null,
  ) {
    const baseName = (claims.name ?? claims.email.split('@')[0] ?? 'Trainer')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 18);
    const prefix = baseName.length >= 3 ? baseName : 'Trainer';
    return this.createTrainerWithUniqueUsername(claims, prefix, traceId, 0);
  }

  private async createTrainerWithUniqueUsername(
    claims: VerifiedGoogleClaims,
    prefix: string,
    traceId: string | null,
    attempt: number,
  ): Promise<
    ReturnType<GoogleOAuthService['tryCreateGoogleTrainerTransaction']>
  > {
    if (attempt >= 4) {
      throw new ConflictException(
        'Não foi possível reservar nome de treinador único para conta Google.',
      );
    }

    const candidateUsername =
      attempt === 0 ? prefix : `${prefix}_${randomBytes(2).toString('hex')}`;

    try {
      return await this.tryCreateGoogleTrainerTransaction(
        claims,
        candidateUsername,
        traceId,
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.createTrainerWithUniqueUsername(
          claims,
          prefix,
          traceId,
          attempt + 1,
        );
      }
      throw error;
    }
  }

  private tryCreateGoogleTrainerTransaction(
    claims: VerifiedGoogleClaims,
    candidateUsername: string,
    traceId: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const trainer = await tx.trainer.create({
        data: {
          username: candidateUsername.slice(0, 24),
          email: claims.email,
          passwordHash: null,
          emailVerifiedAt: new Date(),
        },
        select: {
          id: true,
          username: true,
          email: true,
          emailVerifiedAt: true,
          mfaEnabled: true,
          badgesCount: true,
          eloRating: true,
          lastMapId: true,
          lastX: true,
          lastY: true,
          createdAt: true,
        },
      });

      await tx.trainerOAuthAccount.create({
        data: {
          trainerId: trainer.id,
          provider: 'google',
          providerAccountId: claims.sub,
          email: claims.email,
        },
      });

      const eventId = randomUUID();
      await tx.outboxEvent.create({
        data: {
          id: eventId,
          aggregateType: 'Trainer',
          aggregateId: trainer.id,
          eventType: KAFKA_TOPICS.WORLD_EVENTS,
          payload: WorldTickerEventSchema.parse({
            eventId,
            eventType: 'trainer.registered',
            trainerId: trainer.id,
            username: trainer.username,
            summary: `${trainer.username} iniciou sua jornada em PokéVerse.`,
            occurredAt: new Date().toISOString(),
            traceId,
          }),
          status: 'PENDING',
        },
      });

      return trainer;
    });
  }

  private async exchangeAuthorizationCode(params: {
    readonly code: string;
    readonly codeVerifier: string;
    readonly clientId: string;
    readonly clientSecret: string;
    readonly redirectUri: string;
  }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const form = new URLSearchParams({
        code: params.code,
        client_id: params.clientId,
        client_secret: params.clientSecret,
        redirect_uri: params.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: params.codeVerifier,
      });

      const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        signal: controller.signal,
        redirect: 'error',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });

      if (!res.ok) {
        throw new UnauthorizedException(
          'Falha ao trocar código OAuth no Google.',
        );
      }

      const raw: unknown = await res.json();
      const parsed = GoogleTokenResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new UnauthorizedException('Resposta OAuth do Google incompleta.');
      }
      return parsed.data;
    } finally {
      clearTimeout(timer);
    }
  }

  private async verifyGoogleTokenWithCache(params: {
    readonly idToken: string;
    readonly expectedAudience: string;
    readonly expectedNonce: string;
  }): Promise<VerifiedGoogleClaims> {
    const cachedKeys = await this.loadGoogleJwks(false);
    try {
      return verifyGoogleIdTokenSignature({
        idToken: params.idToken,
        keys: cachedKeys,
        expectedAudience: params.expectedAudience,
        expectedNonce: params.expectedNonce,
      });
    } catch {
      const freshKeys = await this.loadGoogleJwks(true);
      return verifyGoogleIdTokenSignature({
        idToken: params.idToken,
        keys: freshKeys,
        expectedAudience: params.expectedAudience,
        expectedNonce: params.expectedNonce,
      });
    }
  }

  private async loadGoogleJwks(
    forceRefresh: boolean,
  ): Promise<GoogleJwkEntry[]> {
    const cacheKey = 'google:oidc:jwks:v3';
    if (!forceRefresh) {
      const cached = await this.redis.getJson<unknown>(cacheKey);
      const parsedCached = GoogleJwksResponseSchema.safeParse(cached);
      if (parsedCached.success) {
        return parsedCached.data.keys;
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(GOOGLE_JWKS_ENDPOINT, {
        signal: controller.signal,
        redirect: 'error',
        headers: { accept: 'application/json' },
      });
      if (!res.ok) {
        throw new ServiceUnavailableException(
          'Falha ao consultar chaves públicas OIDC do Google.',
        );
      }
      const raw: unknown = await res.json();
      const parsed = GoogleJwksResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ServiceUnavailableException('JWKS do Google inválido.');
      }
      await this.redis.setJsonEx(
        cacheKey,
        GOOGLE_JWKS_CACHE_TTL_SEC,
        parsed.data,
      );
      return parsed.data.keys;
    } finally {
      clearTimeout(timer);
    }
  }

  private stateKey(state: string): string {
    return `oauth_google_state:${this.crypto.sha256Hex(state)}`;
  }
}
