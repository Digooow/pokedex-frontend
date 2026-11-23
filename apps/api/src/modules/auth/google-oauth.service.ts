import { createHash, randomBytes } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from '../../common/security/crypto.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import { RedisService } from '../../infra/redis.service';
import {
  GoogleAccountLinker,
  type GoogleAccountResolutionResult,
} from './google-account-linker.service';
import { GoogleOAuthHttpClient } from './google-oauth-http.client';
import {
  GoogleOidcVerifier,
  type VerifiedGoogleClaims,
} from './google-oidc.verifier';

export {
  type GoogleJwkEntry,
  type VerifiedGoogleClaims,
  verifyGoogleIdTokenSignature,
} from './google-oidc.verifier';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_STATE_TTL_SEC = 300;

interface StoredOAuthState {
  readonly codeVerifier: string;
  readonly nonce: string;
  readonly bindHash: string;
  readonly linkTrainerId: string | null;
}

@Injectable()
export class GoogleOAuthService {
  constructor(
    private readonly redis: RedisService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService<ApiEnvConfig, true>,
    private readonly httpClient: GoogleOAuthHttpClient,
    private readonly oidcVerifier: GoogleOidcVerifier,
    private readonly accountLinker: GoogleAccountLinker,
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
  }): Promise<GoogleAccountResolutionResult> {
    const baseRedirect = this.getFrontendRedirectBase();
    const stateRedisKey = this.stateKey(params.state);
    const stored =
      await this.redis.consumeJson<StoredOAuthState>(stateRedisKey);

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

    const tokenPayload = await this.httpClient.exchangeAuthorizationCode({
      code: params.code,
      codeVerifier: stored.codeVerifier,
      clientId,
      clientSecret,
      redirectUri,
    });

    const claims = await this.oidcVerifier.verifyTokenWithJwksCache({
      idToken: tokenPayload.id_token,
      expectedAudience: clientId,
      expectedNonce: stored.nonce,
      fetchJwks: () => this.httpClient.fetchJwks(),
    });

    return this.resolveTrainerAccount(
      claims,
      stored.linkTrainerId,
      params.traceId,
    );
  }

  resolveTrainerAccount(
    claims: VerifiedGoogleClaims,
    linkTrainerId: string | null,
    traceId: string | null,
  ): Promise<GoogleAccountResolutionResult> {
    return this.accountLinker.resolveTrainerAccount(
      claims,
      linkTrainerId,
      traceId,
      this.getFrontendRedirectBase(),
    );
  }

  unlinkGoogle(trainerId: string): Promise<void> {
    return this.accountLinker.unlinkGoogle(trainerId);
  }

  private stateKey(state: string): string {
    return `oauth_google_state:${this.crypto.sha256Hex(state)}`;
  }
}
