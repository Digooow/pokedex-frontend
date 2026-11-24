import { createPublicKey, createVerify, type JsonWebKey } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { RedisService } from '../../infra/redis.service';

const GOOGLE_JWKS_CACHE_KEY = 'google:oidc:jwks:v3';
const GOOGLE_JWKS_CACHE_TTL_SEC = 3600;

export const GoogleJwkKeySchema = z.object({
  kid: z.string().min(1),
  kty: z.literal('RSA'),
  alg: z.string().optional(),
  n: z.string().min(1),
  e: z.string().min(1),
});

export const GoogleJwksResponseSchema = z.object({
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

function decodeGoogleIdTokenParts(idToken: string): {
  readonly headerB64: string;
  readonly payloadB64: string;
  readonly sigB64: string;
  readonly rawHeader: unknown;
  readonly rawClaims: unknown;
} {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new UnauthorizedException('Token OIDC do Google malformado.');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) {
    throw new UnauthorizedException('Segmentos ausentes no ID token.');
  }
  try {
    return {
      headerB64,
      payloadB64,
      sigB64,
      rawHeader: JSON.parse(
        Buffer.from(headerB64, 'base64url').toString('utf8'),
      ),
      rawClaims: JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8'),
      ),
    };
  } catch {
    throw new UnauthorizedException('Falha ao decodificar ID token OIDC.');
  }
}

function validateDecodedGoogleClaims(params: {
  readonly rawClaims: unknown;
  readonly expectedAudience: string;
  readonly expectedNonce: string;
  readonly nowSec?: number;
}): VerifiedGoogleClaims {
  const claimsParsed = GoogleIdTokenClaimsSchema.safeParse(params.rawClaims);
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

export function verifyGoogleIdTokenSignature(params: {
  readonly idToken: string;
  readonly keys: readonly GoogleJwkEntry[];
  readonly expectedAudience: string;
  readonly expectedNonce: string;
  readonly nowSec?: number;
}): VerifiedGoogleClaims {
  const { headerB64, payloadB64, sigB64, rawHeader, rawClaims } =
    decodeGoogleIdTokenParts(params.idToken);

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

  if (!verifier.verify(publicKey, Buffer.from(sigB64, 'base64url'))) {
    throw new UnauthorizedException('Assinatura OIDC do Google inválida.');
  }

  return validateDecodedGoogleClaims({
    rawClaims,
    expectedAudience: params.expectedAudience,
    expectedNonce: params.expectedNonce,
    nowSec: params.nowSec,
  });
}

@Injectable()
export class GoogleOidcVerifier {
  constructor(private readonly redis: RedisService) {}

  async verifyTokenWithJwksCache(params: {
    readonly idToken: string;
    readonly expectedAudience: string;
    readonly expectedNonce: string;
    readonly fetchJwks: () => Promise<GoogleJwkEntry[]>;
  }): Promise<VerifiedGoogleClaims> {
    const cachedKeys = await this.loadCachedJwks(false, params.fetchJwks);
    try {
      return verifyGoogleIdTokenSignature({
        idToken: params.idToken,
        keys: cachedKeys,
        expectedAudience: params.expectedAudience,
        expectedNonce: params.expectedNonce,
      });
    } catch {
      const freshKeys = await this.loadCachedJwks(true, params.fetchJwks);
      return verifyGoogleIdTokenSignature({
        idToken: params.idToken,
        keys: freshKeys,
        expectedAudience: params.expectedAudience,
        expectedNonce: params.expectedNonce,
      });
    }
  }

  private async loadCachedJwks(
    forceRefresh: boolean,
    fetchJwks: () => Promise<GoogleJwkEntry[]>,
  ): Promise<GoogleJwkEntry[]> {
    if (!forceRefresh) {
      const cached = await this.redis.getJson<unknown>(GOOGLE_JWKS_CACHE_KEY);
      const parsedCached = GoogleJwksResponseSchema.safeParse(cached);
      if (parsedCached.success) {
        return parsedCached.data.keys;
      }
    }

    const keys = await fetchJwks();
    await this.redis.setJsonEx(
      GOOGLE_JWKS_CACHE_KEY,
      GOOGLE_JWKS_CACHE_TTL_SEC,
      { keys },
    );
    return keys;
  }
}
