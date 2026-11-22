import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  ForgotPasswordInput,
  ResendEmailOtpInput,
  ResetPasswordOtpInput,
  VerifyEmailOtpInput,
} from '@pokeverse/shared';
import * as argon2 from 'argon2';
import { AuthOutboxPublisher } from './auth-outbox-publisher.service';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';
import { TrainerAccountRepository } from './trainer-account.repository';

@Injectable()
export class AccountRecoveryService {
  constructor(
    private readonly trainerAccountRepository: TrainerAccountRepository,
    private readonly sessionService: SessionService,
    private readonly otpService: OtpService,
    private readonly outboxPublisher: AuthOutboxPublisher,
  ) {}

  async verifyEmailOtp(
    input: VerifyEmailOtpInput,
    traceId: string | null,
  ): Promise<{ readonly message: string }> {
    const valid = await this.otpService.verifyAndConsumeOtp(
      'verify',
      input.email,
      input.code,
    );
    if (!valid) {
      throw new BadRequestException(
        'Código de verificação inválido, expirado ou tentativas esgotadas.',
      );
    }

    const trainer =
      await this.trainerAccountRepository.findVerificationIdentityByEmail(
        input.email,
      );

    if (trainer?.emailVerifiedAt === null) {
      const outboxEvent = this.outboxPublisher.buildEncryptedEmailEvent({
        aggregateId: trainer.id,
        template: 'welcome',
        toEmail: trainer.email,
        username: trainer.username,
        subject: 'PokéVerse OS — Conta de treinador verificada!',
        traceId,
      });
      await this.trainerAccountRepository.markEmailVerifiedWithOutbox(
        trainer.id,
        outboxEvent,
      );
    }

    return { message: 'E-mail verificado com sucesso.' };
  }

  async resendVerificationOtp(
    input: ResendEmailOtpInput,
    traceId: string | null,
  ): Promise<{ readonly message: string }> {
    const trainer =
      await this.trainerAccountRepository.findVerificationIdentityByEmail(
        input.email,
      );

    if (trainer?.emailVerifiedAt === null) {
      const { code: otpCode } = await this.otpService.issueOtp(
        'verify',
        trainer.email,
      );
      const outboxEvent = this.outboxPublisher.buildEncryptedEmailEvent({
        aggregateId: trainer.id,
        template: 'email_verification_otp',
        toEmail: trainer.email,
        username: trainer.username,
        subject: 'PokéVerse OS — Novo código de verificação',
        otpCode,
        traceId,
      });
      await this.trainerAccountRepository.enqueueOutboxEvent(outboxEvent);
    }

    return {
      message:
        'Se o e-mail existir e ainda não estiver verificado, enviaremos um código de 6 dígitos.',
    };
  }

  async forgotPassword(
    input: ForgotPasswordInput,
    traceId: string | null,
  ): Promise<{ readonly message: string }> {
    const trainer =
      await this.trainerAccountRepository.findBasicIdentityByEmail(input.email);

    if (trainer) {
      const { code: otpCode } = await this.otpService.issueOtp(
        'reset',
        trainer.email,
      );
      const outboxEvent = this.outboxPublisher.buildEncryptedEmailEvent({
        aggregateId: trainer.id,
        template: 'password_reset_otp',
        toEmail: trainer.email,
        username: trainer.username,
        subject: 'PokéVerse OS — Código de recuperação de senha',
        otpCode,
        traceId,
      });
      await this.trainerAccountRepository.enqueueOutboxEvent(outboxEvent);
    }

    return {
      message:
        'Se o e-mail estiver cadastrado, enviaremos um código de 6 dígitos válido por 10 minutos.',
    };
  }

  async resetPasswordWithOtp(
    input: ResetPasswordOtpInput,
    traceId: string | null,
  ): Promise<{ readonly message: string }> {
    const valid = await this.otpService.verifyAndConsumeOtp(
      'reset',
      input.email,
      input.code,
    );
    if (!valid) {
      throw new BadRequestException(
        'Código de recuperação inválido, expirado ou tentativas esgotadas.',
      );
    }

    const trainer =
      await this.trainerAccountRepository.findBasicIdentityByEmail(input.email);

    if (!trainer) {
      throw new BadRequestException('Solicitação de recuperação inválida.');
    }

    const newHash = await argon2.hash(input.newPassword, {
      type: argon2.argon2id,
    });
    const outboxEvent = this.outboxPublisher.buildEncryptedEmailEvent({
      aggregateId: trainer.id,
      template: 'security_alert',
      toEmail: trainer.email,
      username: trainer.username,
      subject: 'PokéVerse OS — Senha alterada com sucesso',
      detail:
        'Sua senha foi redefinida com sucesso e todas as sessões ativas foram encerradas.',
      traceId,
    });

    await this.trainerAccountRepository.resetPasswordAndRevokeTokensWithOutbox(
      trainer.id,
      newHash,
      outboxEvent,
    );

    await this.sessionService.revokeAllForTrainer(trainer.id);

    return {
      message: 'Senha redefinida com sucesso. Faça login com a nova senha.',
    };
  }
}
