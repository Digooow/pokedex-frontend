import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  type TrainerDataExport,
  TrainerDataExportSchema,
} from '@pokeverse/shared';
import { CryptoService } from '../../common/security/crypto.service';
import { RedisService } from '../../infra/redis.service';
import { SessionService } from './session.service';
import { TrainerAccountRepository } from './trainer-account.repository';

@Injectable()
export class TrainerGdprService {
  constructor(
    private readonly trainerAccountRepository: TrainerAccountRepository,
    private readonly redis: RedisService,
    private readonly crypto: CryptoService,
    private readonly sessionService: SessionService,
  ) {}

  async exportTrainerData(trainerId: string): Promise<TrainerDataExport> {
    const trainer =
      await this.trainerAccountRepository.findExportSnapshotById(trainerId);

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
    const deleted =
      await this.trainerAccountRepository.deleteTrainerById(trainerId);
    if (!deleted) {
      throw new UnauthorizedException('Treinador não encontrado.');
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
