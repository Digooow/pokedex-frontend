export const EMAIL_TRANSPORT = Symbol('EMAIL_TRANSPORT');

export interface OutboundEmailMessage {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export interface EmailTransport {
  readonly mode: 'smtp' | 'resend';
  send(message: OutboundEmailMessage): Promise<void>;
}
