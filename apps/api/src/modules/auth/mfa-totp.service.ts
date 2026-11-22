import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  type AuthSessionResponse,
  type DisableTotpInput,
  type MfaChallengeVerifyInput,
  type TotpEnableResponse,
  TotpEnableResponseSchema,
  type TotpSetupResponse,
  TotpSetupResponseSchema,
} from '@pokeverse/shared';
import * as argon2 from 'argon2';
import QRCode from 'qrcode';
import { CryptoService } from '../../common/security/crypto.service';
import { RedisService } from '../../infra/redis.service';
import { AuthOutboxPublisher } from './auth-outbox-publisher.service';
import {
  MfaTotpRepository,
  type TotpDisableTrainerRecord,
} from './mfa-totp.repository';
import {
  buildTotpOtpauthUri,
  computeTotpAtCounter,
  decodeBase32,
  encodeBase32,
  findMatchingTotpStep,
  generateBackupCodes,
  generateTotpSecretBase32,
  normalizeBackupCode,
} from './totp-crypto.util';
import { TrainerSessionIssuer } from './trainer-session-issuer.service';

export { computeTotpAtCounter, decodeBase32, encodeBase32 };

const SETUP_TTL_SEC = 600;
const MFA_MAX_FAILURES = 5;
const MFA_LOCK_WINDOW_SEC = 300;
const TOTP_REPLAY_TTL_SEC = 90;

@Injectable()
export class MfaTotpService {
  constructor(
    private readonly totpRepository: MfaTotpRepository,
    private readonly redis: RedisService,
    private readonly crypto: CryptoService,
    private readonly outboxPublisher: AuthOutboxPublisher,
    private readonly sessionIssuer: TrainerSessionIssuer,
  ) {}

  async initiateSetup(trainerId: string): Promise<TotpSetupResponse> {
    const trainer = await this.totpRepository.findTotpSetupState(trainerId);
    if (!trainer) {
      throw new UnauthorizedException('Treinador não encontrado.');
    }
    if (trainer.mfaEnabled && trainer.totpSecretEncrypted) {
      throw new BadRequestException(
        'O Authenticator (TOTP) já está ativo na sua conta.',
      );
    }

    const secretBase32 = generateTotpSecretBase32();
    const otpauthUri = buildTotpOtpauthUri(trainer.email, secretBase32);
    const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
      width: 220,
      margin: 1,
    });

    await this.redis.setStringEx(
      this.setupKey(trainerId),
      SETUP_TTL_SEC,
      this.crypto.encryptString(secretBase32),
    );

    return TotpSetupResponseSchema.parse({
      secretBase32,
      otpauthUri,
      qrDataUrl,
    });
  }

  async confirmEnable(
    trainerId: string,
    code: string,
    traceId: string | null,
  ): Promise<TotpEnableResponse> {
    const encryptedPending = await this.redis.getString(
      this.setupKey(trainerId),
    );
    if (!encryptedPending) {
      throw new BadRequestException(
        'Configuração TOTP expirada ou não iniciada. Gere um novo QR Code.',
      );
    }

    const secretBase32 = this.crypto.decryptString(encryptedPending);
    const matchedStep = await this.verifyTotpWithReplayGuard(
      trainerId,
      secretBase32,
      code,
    );
    if (matchedStep === null) {
      throw new BadRequestException('Código TOTP de 6 dígitos inválido.');
    }

    const trainer = await this.totpRepository.findTrainerContact(trainerId);
    if (!trainer) {
      throw new UnauthorizedException('Treinador não encontrado.');
    }

    const backupCodes = generateBackupCodes();
    const outboxEvent = this.outboxPublisher.buildEncryptedEmailEvent({
      aggregateId: trainerId,
      template: 'security_alert',
      toEmail: trainer.email,
      username: trainer.username,
      subject: 'PokéVerse OS — Autenticação em 2 etapas (TOTP) ativada',
      detail:
        'Um Authenticator App (2FA TOTP) e 8 códigos de backup foram vinculados à sua conta.',
      traceId,
    });

    await this.totpRepository.enableTotpWithBackupCodesAndOutbox({
      trainerId,
      secretEncrypted: this.crypto.encryptString(secretBase32),
      codeHashes: backupCodes.map((plain) =>
        this.hashBackupCode(trainerId, plain),
      ),
      outboxEvent,
    });

    await this.redis.delKeys(this.setupKey(trainerId));

    return TotpEnableResponseSchema.parse({
      message:
        'Autenticação em 2 etapas (TOTP) ativada. Guarde seus 8 códigos de backup em local seguro.',
      backupCodes,
    });
  }

  async verifyChallengeAndPromote(
    rawSid: string | undefined,
    trainerId: string,
    input: MfaChallengeVerifyInput,
  ): Promise<{
    readonly session: AuthSessionResponse;
    readonly refreshToken: string;
  }> {
    if (!rawSid) {
      throw new UnauthorizedException('Sessão pendente ausente.');
    }

    const failKey = `mfa_fail:${trainerId}`;
    const failCount = Number((await this.redis.getString(failKey)) ?? '0');
    if (failCount >= MFA_MAX_FAILURES) {
      throw new HttpException(
        'Muitas tentativas de 2FA falharam. Aguarde 5 minutos antes de tentar novamente.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const trainer = await this.totpRepository.findForMfaChallenge(trainerId);
    if (!trainer?.mfaEnabled || !trainer.totpSecretEncrypted) {
      throw new UnauthorizedException('Desafio 2FA não configurado.');
    }

    const verified =
      input.method === 'totp'
        ? (await this.verifyTotpWithReplayGuard(
            trainer.id,
            this.crypto.decryptString(trainer.totpSecretEncrypted),
            input.code,
          )) !== null
        : await this.consumeBackupCode(trainer.id, input.code);

    if (!verified) {
      await this.recordMfaFailure(failKey, failCount);
      throw new UnauthorizedException(
        'Código 2FA ou código de backup inválido.',
      );
    }

    await this.redis.delKeys(failKey);
    return this.sessionIssuer.promoteMfaPendingSession(rawSid, trainer);
  }

  async disableTotp(
    trainerId: string,
    input: DisableTotpInput,
    traceId: string | null,
  ): Promise<{ readonly message: string }> {
    const trainer = await this.totpRepository.findForTotpDisable(trainerId);
    if (!trainer?.totpSecretEncrypted) {
      throw new BadRequestException('O Authenticator TOTP não está ativado.');
    }

    const authorized = await this.isDisableAuthorized(
      trainer,
      trainer.totpSecretEncrypted,
      input,
    );
    if (!authorized) {
      throw new UnauthorizedException(
        'Credencial ou código TOTP/backup inválido para desativar 2FA.',
      );
    }

    const outboxEvent = this.outboxPublisher.buildEncryptedEmailEvent({
      aggregateId: trainerId,
      template: 'security_alert',
      toEmail: trainer.email,
      username: trainer.username,
      subject: 'PokéVerse OS — 2FA TOTP desativado',
      detail: 'A proteção via Authenticator App foi removida da sua conta.',
      traceId,
    });

    await this.totpRepository.disableTotpAndOutbox({ trainerId, outboxEvent });

    return { message: '2FA TOTP desativado com sucesso.' };
  }

  private async isDisableAuthorized(
    trainer: TotpDisableTrainerRecord,
    totpSecretEncrypted: string,
    input: DisableTotpInput,
  ): Promise<boolean> {
    if (
      input.currentPassword &&
      trainer.passwordHash &&
      (await argon2.verify(trainer.passwordHash, input.currentPassword))
    ) {
      return true;
    }

    if (!input.code) {
      return false;
    }

    const cleaned = input.code.trim();
    if (!/^\d{6}$/.test(cleaned)) {
      return this.consumeBackupCode(trainer.id, cleaned);
    }

    const secretBase32 = this.crypto.decryptString(totpSecretEncrypted);
    const step = await this.verifyTotpWithReplayGuard(
      trainer.id,
      secretBase32,
      cleaned,
    );
    return step !== null;
  }

  private async recordMfaFailure(
    failKey: string,
    failCount: number,
  ): Promise<void> {
    if (typeof this.redis.incrementCounterWithTtl === 'function') {
      await this.redis.incrementCounterWithTtl(failKey, MFA_LOCK_WINDOW_SEC);
      return;
    }
    await this.redis.setStringEx(
      failKey,
      MFA_LOCK_WINDOW_SEC,
      String(failCount + 1),
    );
  }

  private async verifyTotpWithReplayGuard(
    trainerId: string,
    secretBase32: string,
    candidateCode: string,
  ): Promise<number | null> {
    const matchedStep = findMatchingTotpStep({
      secretBase32,
      candidateCode,
      safeEqualHex: (a, b) => this.crypto.safeEqualHex(a, b),
    });
    if (matchedStep === null) {
      return null;
    }

    const freshStep = await this.redis.setStringNxEx(
      `totp_used:${trainerId}:${matchedStep}`,
      TOTP_REPLAY_TTL_SEC,
      '1',
    );
    return freshStep ? matchedStep : null;
  }

  private consumeBackupCode(
    trainerId: string,
    rawCode: string,
  ): Promise<boolean> {
    const codeHash = this.hashBackupCode(trainerId, rawCode);
    return this.totpRepository.consumeUnusedBackupCode(trainerId, codeHash);
  }

  private hashBackupCode(trainerId: string, rawCode: string): string {
    return this.crypto.hmacSha256Hex(
      `backup:${trainerId}`,
      normalizeBackupCode(rawCode),
    );
  }

  private setupKey(trainerId: string): string {
    return `totp_setup:${trainerId}`;
  }
}
