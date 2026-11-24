import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ApiEnvConfig } from '../../config/env.schema';
import { EMAIL_TRANSPORT } from './email-transport.port';
import { MailService } from './mail.service';
import { ResendEmailTransport } from './resend-email.transport';
import { SmtpEmailTransport } from './smtp-email.transport';

@Module({
  providers: [
    SmtpEmailTransport,
    ResendEmailTransport,
    {
      provide: EMAIL_TRANSPORT,
      inject: [ConfigService, SmtpEmailTransport, ResendEmailTransport],
      useFactory: (
        config: ConfigService<ApiEnvConfig, true>,
        smtp: SmtpEmailTransport,
        resend: ResendEmailTransport,
      ) =>
        config.get('MAIL_TRANSPORT', { infer: true }) === 'resend'
          ? resend
          : smtp,
    },
    MailService,
  ],
  exports: [MailService, EMAIL_TRANSPORT],
})
export class NotificationsModule {}
