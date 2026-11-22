import { createSign, generateKeyPairSync } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from '../../common/security/crypto.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import type { PrismaService } from '../../infra/prisma.service';
import type { RedisService } from '../../infra/redis.service';
import { AuthOutboxPublisher } from './auth-outbox-publisher.service';
import { AuthTokenRepository } from './auth-token.repository';
import { GoogleAccountLinker } from './google-account-linker.service';
import { GoogleOAuthHttpClient } from './google-oauth-http.client';
import {
  type GoogleJwkEntry,
  GoogleOAuthService,
  verifyGoogleIdTokenSignature,
} from './google-oauth.service';
import { GoogleOidcVerifier } from './google-oidc.verifier';
import { SessionService } from './session.service';
import { TrainerAccountRepository } from './trainer-account.repository';
import { TrainerOAuthRepository } from './trainer-oauth.repository';
import { TrainerSessionIssuer } from './trainer-session-issuer.service';

function signRs256Jwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKeyPem: string,
): string {
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signer = createSign('RSA-SHA256');
  signer.update(`${h}.${p}`);
  signer.end();
  const sig = signer.sign(privateKeyPem).toString('base64url');
  return `${h}.${p}.${sig}`;
}

describe('GoogleOAuthService (OIDC RS256 verification & safe account linking)', () => {
  it('verifies RS256 Google ID tokens via JWKS and rejects nonce/aud/unverified claims', () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const jwk = publicKey.export({ format: 'jwk' }) as {
      kty: 'RSA';
      n: string;
      e: string;
    };
    const keys: GoogleJwkEntry[] = [
      { kid: 'test-key-1', kty: 'RSA', alg: 'RS256', n: jwk.n, e: jwk.e },
    ];
    const nowSec = Math.floor(Date.now() / 1000);

    const validJwt = signRs256Jwt(
      { alg: 'RS256', kid: 'test-key-1' },
      {
        iss: 'https://accounts.google.com',
        aud: 'google-client-123',
        sub: 'google-sub-999',
        email: 'Red@Example.COM',
        email_verified: true,
        nonce: 'nonce-abc',
        exp: nowSec + 300,
        name: 'Red Kanto',
      },
      privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    );

    const verified = verifyGoogleIdTokenSignature({
      idToken: validJwt,
      keys,
      expectedAudience: 'google-client-123',
      expectedNonce: 'nonce-abc',
      nowSec,
    });
    expect(verified.email).toBe('red@example.com');
    expect(verified.sub).toBe('google-sub-999');

    expect(() =>
      verifyGoogleIdTokenSignature({
        idToken: validJwt,
        keys,
        expectedAudience: 'google-client-123',
        expectedNonce: 'wrong-nonce',
        nowSec,
      }),
    ).toThrow(UnauthorizedException);

    const unverifiedJwt = signRs256Jwt(
      { alg: 'RS256', kid: 'test-key-1' },
      {
        iss: 'https://accounts.google.com',
        aud: 'google-client-123',
        sub: 'google-sub-999',
        email: 'red@example.com',
        email_verified: false,
        nonce: 'nonce-abc',
        exp: nowSec + 300,
      },
      privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    );

    expect(() =>
      verifyGoogleIdTokenSignature({
        idToken: unverifiedJwt,
        keys,
        expectedAudience: 'google-client-123',
        expectedNonce: 'nonce-abc',
        nowSec,
      }),
    ).toThrow(UnauthorizedException);
  });

  it('refuses auto-linking Google account to an unverified local account (ATO protection)', async () => {
    const configMock = {
      get: jest.fn((key: keyof ApiEnvConfig) => {
        switch (key) {
          case 'APP_ENCRYPTION_KEY':
            return '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
          case 'WEBAUTHN_ORIGIN':
            return 'http://127.0.0.1:4200';
          default:
            return '';
        }
      }),
    } as unknown as ConfigService<ApiEnvConfig, true>;

    const oauthCreate = jest.fn();
    const prismaMock = {
      trainerOAuthAccount: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: oauthCreate,
      },
      trainer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'trainer-1',
          username: 'UnverifiedUser',
          email: 'victim@example.com',
          emailVerifiedAt: null,
          mfaEnabled: false,
          totpSecretEncrypted: null,
          passwordHash: 'hash',
          badgesCount: 0,
          eloRating: 1000,
          lastMapId: 'pokeverse-town',
          lastX: 400,
          lastY: 320,
          createdAt: new Date(),
          passkeys: [],
        }),
      },
    } as unknown as PrismaService;

    const crypto = new CryptoService(configMock);
    const redisMock = {} as unknown as RedisService;
    const sessionService = new SessionService(redisMock, crypto, configMock);
    const service = new GoogleOAuthService(
      redisMock,
      crypto,
      configMock,
      new GoogleOAuthHttpClient(),
      new GoogleOidcVerifier(redisMock),
      new GoogleAccountLinker(
        new TrainerAccountRepository(prismaMock),
        new TrainerOAuthRepository(prismaMock),
        new TrainerSessionIssuer(
          new AuthTokenRepository(prismaMock),
          crypto,
          sessionService,
          configMock,
        ),
        new AuthOutboxPublisher(crypto),
      ),
    );

    const outcome = await service.resolveTrainerAccount(
      {
        iss: 'https://accounts.google.com',
        aud: 'cid',
        sub: 'google-sub-1',
        email: 'victim@example.com',
        email_verified: true,
        nonce: 'n',
        exp: Math.floor(Date.now() / 1000) + 120,
      },
      null,
      null,
    );

    expect(outcome.redirectUrl).toContain(
      'authError=verify_email_before_google_link',
    );
    expect(outcome.sessionSid).toBeUndefined();
    expect(oauthCreate).not.toHaveBeenCalled();
  });
});
