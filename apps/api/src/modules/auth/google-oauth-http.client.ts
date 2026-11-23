import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { z } from 'zod';
import { assertSafeOutboundUrl } from '../../common/http/safe-outbound-http';
import {
  type GoogleJwkEntry,
  GoogleJwksResponseSchema,
} from './google-oidc.verifier';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ALLOWED_HOSTS = ['oauth2.googleapis.com', 'www.googleapis.com'];
const GOOGLE_HTTP_TIMEOUT_MS = 8000;

const GoogleTokenResponseSchema = z.object({
  id_token: z.string().min(10),
  token_type: z.string().optional(),
});

@Injectable()
export class GoogleOAuthHttpClient {
  async exchangeAuthorizationCode(params: {
    readonly code: string;
    readonly codeVerifier: string;
    readonly clientId: string;
    readonly clientSecret: string;
    readonly redirectUri: string;
  }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GOOGLE_HTTP_TIMEOUT_MS);
    try {
      const form = new URLSearchParams({
        code: params.code,
        client_id: params.clientId,
        client_secret: params.clientSecret,
        redirect_uri: params.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: params.codeVerifier,
      });

      const safeUrl = await assertSafeOutboundUrl(
        GOOGLE_TOKEN_ENDPOINT,
        GOOGLE_ALLOWED_HOSTS,
      );
      const res = await fetch(safeUrl.toString(), {
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

  async fetchJwks(): Promise<GoogleJwkEntry[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GOOGLE_HTTP_TIMEOUT_MS);
    try {
      const safeUrl = await assertSafeOutboundUrl(
        GOOGLE_JWKS_ENDPOINT,
        GOOGLE_ALLOWED_HOSTS,
      );
      const res = await fetch(safeUrl.toString(), {
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
      return parsed.data.keys;
    } finally {
      clearTimeout(timer);
    }
  }
}
