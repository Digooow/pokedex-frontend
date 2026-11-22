import { createHmac, randomBytes, randomInt } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import type { ApiEnvConfig } from '../../config/env.schema';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { AuthOutboxPublisher } from './auth-outbox-publisher.service';
import { SessionService } from './session.service';
import {
  TRAINER_SESSION_SELECT,
  TrainerSessionIssuer,
} from './trainer-session-issuer.service';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BACKUP_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const TOTP_STEP_SEC = 30;
const TOTP_DIGITS = 6;
const SETUP_TTL_SEC = 600;
const MFA_MAX_FAILURES = 5;
const MFA_LOCK_WINDOW_SEC = 300;

export function encodeBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function decodeBase32(raw: string): Buffer {
  const cleaned = raw.trim().toUpperCase().replaceAll('=', '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];

  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error('Invalid Base32 TOTP secret');
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(out);
}

export function computeTotpAtCounter(
  secretBytes: Buffer,
  counter: number,
): string {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secretBytes).update(counterBuf).digest();
  const offset = (hmac.at(-1) ?? 0) & 0x0f;
  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

@Injectable()
export class MfaTotpService {
  private readonly outboxPublisher: AuthOutboxPublisher;
  private readonly sessionIssuer: TrainerSessionIssuer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly crypto: CryptoService,
    sessionService: SessionService,
    config: ConfigService<ApiEnvConfig, true>,
    @Optional() outboxPublisher?: AuthOutboxPublisher,
    @Optional() sessionIssuer?: TrainerSessionIssuer,
  ) {
    this.outboxPublisher = outboxPublisher ?? new AuthOutboxPublisher(crypto);
    this.sessionIssuer =
      sessionIssuer ??
      new TrainerSessionIssuer(prisma, crypto, sessionService, config);
  }

  async initiateSetup(trainerId: string): Promise<TotpSetupResponse> {
    const trainer = await this.prisma.trainer.findUnique({
      where: { id: trainerId },
      select: { email: true, mfaEnabled: true, totpSecretEncrypted: true },
    });

    if (!trainer) {
      throw new UnauthorizedException('Treinador não encontrado.');
    }
    if (trainer.mfaEnabled && trainer.totpSecretEncrypted) {
      throw new BadRequestException(
        'O Authenticator (TOTP) já está ativo na sua conta.',
      );
    }

    const secretBase32 = encodeBase32(randomBytes(20));
    const label = encodeURIComponent(`PokéVerse OS:${trainer.email}`);
    const issuer = encodeURIComponent('PokéVerse OS');
    const otpauthUri = `otpauth://totp/${label}?secret=${secretBase32}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
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

    const trainer = await this.prisma.trainer.findUnique({
      where: { id: trainerId },
      select: { email: true, username: true },
    });
    if (!trainer) {
      throw new UnauthorizedException('Treinador não encontrado.');
    }

    const backupCodes = this.generateBackupCodes();
    const secretEncrypted = this.crypto.encryptString(secretBase32);

    await this.prisma.$transaction(async (tx) => {
      await tx.trainer.update({
        where: { id: trainerId },
        data: {
          mfaEnabled: true,
          totpSecretEncrypted: secretEncrypted,
        },
      });

      await tx.mfaBackupCode.deleteMany({ where: { trainerId } });
      await tx.mfaBackupCode.createMany({
        data: backupCodes.map((plain) => ({
          trainerId,
          codeHash: this.hashBackupCode(trainerId, plain),
        })),
      });

      await this.outboxPublisher.enqueueEncryptedEmail(tx, {
        aggregateId: trainerId,
        template: 'security_alert',
        toEmail: trainer.email,
        username: trainer.username,
        subject: 'PokéVerse OS — Autenticação em 2 etapas (TOTP) ativada',
        detail:
          'Um Authenticator App (2FA TOTP) e 8 códigos de backup foram vinculados à sua conta.',
        traceId,
      });
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

    const trainer = await this.prisma.trainer.findUnique({
      where: { id: trainerId },
      select: {
        ...TRAINER_SESSION_SELECT,
        totpSecretEncrypted: true,
      },
    });

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
    const trainer = await this.prisma.trainer.findUnique({
      where: { id: trainerId },
      select: {
        id: true,
        username: true,
        email: true,
        passwordHash: true,
        mfaEnabled: true,
        totpSecretEncrypted: true,
      },
    });

    if (!trainer?.totpSecretEncrypted) {
      throw new BadRequestException('O Authenticator TOTP não está ativado.');
    }

    let authorized = false;
    if (input.currentPassword && trainer.passwordHash) {
      authorized = await argon2.verify(
        trainer.passwordHash,
        input.currentPassword,
      );
    }
    if (!authorized && input.code) {
      const cleaned = input.code.trim();
      if (/^\d{6}$/.test(cleaned)) {
        const secretBase32 = this.crypto.decryptString(
          trainer.totpSecretEncrypted,
        );
        authorized =
          (await this.verifyTotpWithReplayGuard(
            trainer.id,
            secretBase32,
            cleaned,
          )) !== null;
      } else {
        authorized = await this.consumeBackupCode(trainer.id, cleaned);
      }
    }

    if (!authorized) {
      throw new UnauthorizedException(
        'Credencial ou código TOTP/backup inválido para desativar 2FA.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.mfaBackupCode.deleteMany({ where: { trainerId } });
      await tx.trainer.update({
        where: { id: trainerId },
        data: {
          mfaEnabled: false,
          totpSecretEncrypted: null,
        },
      });

      await this.outboxPublisher.enqueueEncryptedEmail(tx, {
        aggregateId: trainerId,
        template: 'security_alert',
        toEmail: trainer.email,
        username: trainer.username,
        subject: 'PokéVerse OS — 2FA TOTP desativado',
        detail: 'A proteção via Authenticator App foi removida da sua conta.',
        traceId,
      });
    });

    return { message: '2FA TOTP desativado com sucesso.' };
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
    const secretBytes = decodeBase32(secretBase32);
    const currentStep = Math.floor(Date.now() / 1000 / TOTP_STEP_SEC);
    const candidateHex = Buffer.from(candidateCode, 'utf8').toString('hex');

    for (const delta of [-1, 0, 1]) {
      const step = currentStep + delta;
      const expected = computeTotpAtCounter(secretBytes, step);
      const expectedHex = Buffer.from(expected, 'utf8').toString('hex');
      if (this.crypto.safeEqualHex(candidateHex, expectedHex)) {
        const freshStep = await this.redis.setStringNxEx(
          `totp_used:${trainerId}:${step}`,
          90,
          '1',
        );
        return freshStep ? step : null;
      }
    }

    return null;
  }

  private async consumeBackupCode(
    trainerId: string,
    rawCode: string,
  ): Promise<boolean> {
    const codeHash = this.hashBackupCode(trainerId, rawCode);
    const match = await this.prisma.mfaBackupCode.findFirst({
      where: { trainerId, codeHash, usedAt: null },
      select: { id: true },
    });

    if (!match) {
      return false;
    }

    const updated = await this.prisma.mfaBackupCode.updateMany({
      where: { id: match.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return updated.count === 1;
  }

  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      let chunk = '';
      for (let c = 0; c < 8; c += 1) {
        chunk +=
          BACKUP_CODE_ALPHABET[randomInt(0, BACKUP_CODE_ALPHABET.length)];
      }
      codes.push(`${chunk.slice(0, 4)}-${chunk.slice(4)}`);
    }
    return codes;
  }

  private hashBackupCode(trainerId: string, rawCode: string): string {
    const normalized = rawCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    return this.crypto.hmacSha256Hex(`backup:${trainerId}`, normalized);
  }

  private setupKey(trainerId: string): string {
    return `totp_setup:${trainerId}`;
  }
}
