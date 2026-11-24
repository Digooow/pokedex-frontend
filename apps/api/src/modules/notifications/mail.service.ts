import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmailNotificationEvent } from '@pokeverse/shared';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import { EMAIL_TRANSPORT, type EmailTransport } from './email-transport.port';

interface RenderedEmail {
  readonly html: string;
  readonly text: string;
}

interface EmailRenderContext {
  readonly event: EmailNotificationEvent;
  readonly safeUser: string;
  readonly safeOtp: string | null;
  readonly safeDetail: string | null;
}

type EmailTemplateRenderer = (ctx: EmailRenderContext) => RenderedEmail;

function escapeHtml(raw: string): string {
  return raw
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const EMAIL_TEMPLATE_RENDERERS: Readonly<
  Record<EmailNotificationEvent['template'], EmailTemplateRenderer>
> = {
  email_verification_otp: ({ event, safeUser, safeOtp }) => ({
    text: `Olá ${event.username}! Seu código de verificação PokéVerse OS é: ${event.otpCode ?? ''}. Ele expira em 10 minutos (máximo 3 tentativas).`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0f172a;color:#f8fafc;border-radius:12px;">
      <h2 style="margin-top:0;color:#fbbf24;">PokéVerse OS — Verificação de Conta</h2>
      <p>Olá, <strong>${safeUser}</strong>! Use o código OTP de 6 dígitos abaixo para confirmar seu e-mail:</p>
      <p style="font-size:32px;font-weight:800;letter-spacing:6px;padding:12px 16px;background:#1e293b;border-radius:8px;text-align:center;color:#38bdf8;">${safeOtp ?? '------'}</p>
      <p style="color:#94a3b8;font-size:14px;">Válido por 10 minutos (uso único, até 3 tentativas). Se você não solicitou este cadastro, ignore este e-mail.</p>
    </div>`,
  }),
  password_reset_otp: ({ event, safeUser, safeOtp }) => ({
    text: `Olá ${event.username}. Código para redefinir sua senha no PokéVerse OS: ${event.otpCode ?? ''}. Válido por 10 minutos (máximo 3 tentativas).`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0f172a;color:#f8fafc;border-radius:12px;">
      <h2 style="margin-top:0;color:#f87171;">PokéVerse OS — Recuperação de Senha</h2>
      <p>Olá, <strong>${safeUser}</strong>. Recebemos um pedido de redefinição de senha:</p>
      <p style="font-size:32px;font-weight:800;letter-spacing:6px;padding:12px 16px;background:#1e293b;border-radius:8px;text-align:center;color:#fbbf24;">${safeOtp ?? '------'}</p>
      <p style="color:#94a3b8;font-size:14px;">Válido por 10 minutos (até 3 tentativas). Se não foi você, recomendamos revisar sua segurança.</p>
    </div>`,
  }),
  security_alert: ({ event, safeUser, safeDetail }) => ({
    text: `Alerta de segurança PokéVerse OS para ${event.username}: ${event.detail ?? 'Alteração realizada em sua conta.'}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0f172a;color:#f8fafc;border-radius:12px;">
      <h2 style="margin-top:0;color:#38bdf8;">PokéVerse OS — Alerta de Segurança</h2>
      <p>Olá, <strong>${safeUser}</strong>.</p>
      <p>${safeDetail ?? 'Uma alteração crítica de credenciais ou sessão foi realizada na sua conta.'}</p>
      <p style="color:#94a3b8;font-size:14px;">Todas as sessões anteriores foram revogadas preventivamente.</p>
    </div>`,
  }),
  welcome: ({ event, safeUser }) => ({
    text: `Bem-vindo ao PokéVerse OS, ${event.username}! Sua conta de treinador está verificada.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0f172a;color:#f8fafc;border-radius:12px;">
      <h2 style="margin-top:0;color:#34d399;">PokéVerse OS — Conta Verificada</h2>
      <p>Bem-vindo, <strong>${safeUser}</strong>! Sua conta foi verificada com sucesso.</p>
    </div>`,
  }),
};

@Injectable()
export class MailService {
  private readonly mailFrom: string;

  constructor(
    config: ConfigService<ApiEnvConfig, true>,
    private readonly logger: StructuredLoggerService,
    @Inject(EMAIL_TRANSPORT)
    private readonly transport: EmailTransport,
  ) {
    this.mailFrom = config.get('MAIL_FROM', { infer: true });
  }

  async sendNotification(event: EmailNotificationEvent): Promise<void> {
    const rendered = this.renderEmail(event);

    await this.transport.send({
      from: this.mailFrom,
      to: event.toEmail,
      subject: event.subject,
      text: rendered.text,
      html: rendered.html,
    });

    this.logger.emitEvent(
      'info',
      `Notification email dispatched (${event.template})`,
      {
        context: MailService.name,
        traceId: event.traceId,
      },
    );
  }

  private renderEmail(event: EmailNotificationEvent): RenderedEmail {
    const renderer =
      EMAIL_TEMPLATE_RENDERERS[event.template] ??
      EMAIL_TEMPLATE_RENDERERS.welcome;
    return renderer({
      event,
      safeUser: escapeHtml(event.username),
      safeOtp: event.otpCode ? escapeHtml(event.otpCode) : null,
      safeDetail: event.detail ? escapeHtml(event.detail) : null,
    });
  }
}
