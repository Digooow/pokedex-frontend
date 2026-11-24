import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { assertSafeOutboundUrl } from '../../common/http/safe-outbound-http';
import type { ApiEnvConfig } from '../../config/env.schema';
import type {
  EmailTransport,
  OutboundEmailMessage,
} from './email-transport.port';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const RESEND_TIMEOUT_MS = 8000;

@Injectable()
export class ResendEmailTransport implements EmailTransport {
  readonly mode = 'resend' as const;
  private readonly resendApiKey: string;

  constructor(config: ConfigService<ApiEnvConfig, true>) {
    this.resendApiKey = config.get('RESEND_API_KEY', { infer: true }).trim();
  }

  async send(message: OutboundEmailMessage): Promise<void> {
    const safeUrl = await assertSafeOutboundUrl(RESEND_ENDPOINT, [
      'api.resend.com',
    ]);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);

    try {
      const response = await fetch(safeUrl.toString(), {
        method: 'POST',
        signal: controller.signal,
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: message.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });

      if (!response.ok) {
        throw new ServiceUnavailableException(
          `Resend API retornou HTTP ${response.status}.`,
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
