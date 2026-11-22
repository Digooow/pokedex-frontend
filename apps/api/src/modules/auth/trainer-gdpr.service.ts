import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type TrainerDataExport,
  TrainerDataExportSchema,
} from '@pokeverse/shared';
import { CryptoService } from '../../common/security/crypto.service';
import { PrismaService } from '../../infra/prisma.service';
import { RedisService } from '../../infra/redis.service';
import { SessionService } from './session.service';
import { TRAINER_SESSION_SELECT } from './trainer-session-issuer.service';

@Injectable()
export class TrainerGdprService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly crypto: CryptoService,
    private readonly sessionService: SessionService,
  ) {}

  async exportTrainerData(trainerId: string): Promise<TrainerDataExport> {
    const trainer = await this.prisma.trainer.findUnique({
      where: { id: trainerId },
      select: {
        ...TRAINER_SESSION_SELECT,
        oauthAccounts: {
          orderBy: { createdAt: 'asc' },
          select: {
            provider: true,
            email: true,
            createdAt: true,
          },
        },
        passkeys: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            label: true,
            deviceType: true,
            backedUp: true,
            createdAt: true,
            lastUsedAt: true,
          },
        },
        pokedexSlots: {
          orderBy: { slotIndex: 'asc' },
          select: {
            slotIndex: true,
            pokemonId: true,
            pokemonName: true,
            nickname: true,
            spriteUrl: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!trainer) {
      throw new UnauthorizedException('Treinador não encontrado.');
    }

    return TrainerDataExportSchema.parse({
      exportedAt: new Date().toISOString(),
      trainer: this.sessionService.toTrainerProfile(trainer),
      oauthProviders: trainer.oauthAccounts.map((acc) => ({
        provider: acc.provider,
        email: acc.email,
        linkedAt: acc.createdAt.toISOString(),
      })),
      passkeys: trainer.passkeys.map((pk) => ({
        id: pk.id,
        label: pk.label,
        deviceType: pk.deviceType,
        backedUp: pk.backedUp,
        createdAt: pk.createdAt.toISOString(),
        lastUsedAt: pk.lastUsedAt?.toISOString() ?? null,
      })),
      pokedexSlots: trainer.pokedexSlots.map((slot) => ({
        slotIndex: slot.slotIndex,
        pokemonId: slot.pokemonId,
        pokemonName: slot.pokemonName,
        nickname: slot.nickname,
        spriteUrl: slot.spriteUrl,
        updatedAt: slot.updatedAt.toISOString(),
      })),
    });
  }

  async deleteTrainerAccount(
    trainerId: string,
    rawSid?: string,
    rawRefreshToken?: string,
  ): Promise<{ readonly message: string }> {
    try {
      await this.prisma.trainer.delete({ where: { id: trainerId } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new UnauthorizedException('Treinador não encontrado.');
      }
      throw error;
    }

    if (rawRefreshToken) {
      const tokenHash = this.crypto.sha256Hex(rawRefreshToken);
      await this.redis.delKeys(`refresh_grace:${tokenHash}`);
    }
    await this.sessionService.revokeByRawSid(rawSid);
    await this.sessionService.revokeAllForTrainer(trainerId);

    return {
      message:
        'Conta de treinador e dados pessoais eliminados permanentemente (LGPD).',
    };
  }
}
