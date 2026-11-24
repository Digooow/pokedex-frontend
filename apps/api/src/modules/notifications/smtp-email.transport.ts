import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { ApiEnvConfig } from '../../config/env.schema';
import type {
  EmailTransport,
  OutboundEmailMessage,
} from './email-transport.port';

@Injectable()
export class SmtpEmailTransport implements EmailTransport, OnModuleDestroy {
  readonly mode = 'smtp' as const;
  private readonly transporter: Transporter | null = null;

  constructor(config: ConfigService<ApiEnvConfig, true>) {
    if (config.get('MAIL_TRANSPORT', { infer: true }) === 'smtp') {
      const user = config.get('SMTP_USER', { infer: true }).trim();
      const pass = config.get('SMTP_PASS', { infer: true });
      this.transporter = nodemailer.createTransport({
        host: config.get('SMTP_HOST', { infer: true }),
        port: config.get('SMTP_PORT', { infer: true }),
        secure: config.get('SMTP_SECURE', { infer: true }),
        ...(user ? { auth: { user, pass } } : {}),
      });
    }
  }

  async send(message: OutboundEmailMessage): Promise<void> {
    if (!this.transporter) {
      throw new ServiceUnavailableException(
        'Transporte SMTP não inicializado.',
      );
    }

    await this.transporter.sendMail({
      from: message.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }

  onModuleDestroy(): void {
    this.transporter?.close();
  }
}
