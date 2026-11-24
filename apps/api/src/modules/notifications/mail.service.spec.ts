import type { ConfigService } from '@nestjs/config';
import type { EmailNotificationEvent } from '@pokeverse/shared';
import { StructuredLoggerService } from '../../common/telemetry/structured-logger.service';
import type { ApiEnvConfig } from '../../config/env.schema';
import type {
  EmailTransport,
  OutboundEmailMessage,
} from '../notifications/email-transport.port';
import { MailService } from '../notifications/mail.service';

describe('MailService (templates & HTML XSS escaping)', () => {
  function createMailHarness() {
    const sent: OutboundEmailMessage[] = [];
    const transport: EmailTransport = {
      mode: 'smtp',
      send: (msg) => {
        sent.push(msg);
        return Promise.resolve();
      },
    };
    const config = {
      get: jest.fn(() => 'PokéVerse OS <no-reply@pokeverse.local>'),
    } as unknown as ConfigService<ApiEnvConfig, true>;
    const logger = new StructuredLoggerService();
    const emitSpy = jest.spyOn(logger, 'emitEvent');
    const service = new MailService(config, logger, transport);
    return { service, sent, emitSpy };
  }

  it('renders all 4 email templates and escapes HTML injection payloads', async () => {
    const { service, sent, emitSpy } = createMailHarness();
    const baseEvent = {
      eventId: '550e8400-e29b-41d4-a716-446655440000',
      toEmail: 'ash@pokeverse.local',
      username: '<script>"Ash"&\'Kanto\'</script>',
      requestedAt: '2026-11-24T10:00:00.000Z',
      traceId: 'a'.repeat(32),
    };

    const events: readonly EmailNotificationEvent[] = [
      {
        ...baseEvent,
        template: 'email_verification_otp',
        subject: 'Verifique seu e-mail',
        otpCode: '123456',
      },
      {
        ...baseEvent,
        template: 'password_reset_otp',
        subject: 'Redefinir senha',
        otpCode: '654321',
      },
      {
        ...baseEvent,
        template: 'security_alert',
        subject: 'Alerta de segurança',
        detail: '<b>Senha</b> alterada',
      },
      {
        ...baseEvent,
        template: 'welcome',
        subject: 'Bem-vindo',
      },
    ];

    for (const event of events) {
      await service.sendNotification(event);
    }

    expect(sent).toHaveLength(4);
    for (const msg of sent) {
      expect(msg.from).toBe('PokéVerse OS <no-reply@pokeverse.local>');
      expect(msg.html).not.toContain('<script>');
      expect(msg.html).toContain(
        '&lt;script&gt;&quot;Ash&quot;&amp;&#39;Kanto&#39;&lt;/script&gt;',
      );
    }
    expect(sent[0]?.html).toContain('123456');
    expect(sent[1]?.html).toContain('654321');
    expect(sent[2]?.html).toContain('&lt;b&gt;Senha&lt;/b&gt; alterada');
    expect(sent[3]?.text).toContain('Bem-vindo ao PokéVerse OS');
    expect(emitSpy).toHaveBeenCalledTimes(4);
  });

  it('uses safe fallback placeholders when optional otpCode or detail are omitted', async () => {
    const { service, sent } = createMailHarness();

    await service.sendNotification({
      eventId: '550e8400-e29b-41d4-a716-446655440001',
      template: 'security_alert',
      toEmail: 'misty@pokeverse.local',
      username: 'Misty',
      subject: 'Alerta',
      traceId: null,
      requestedAt: '2026-11-24T10:00:00.000Z',
    });

    expect(sent[0]?.html).toContain(
      'Uma alteração crítica de credenciais ou sessão foi realizada na sua conta.',
    );
  });
});
