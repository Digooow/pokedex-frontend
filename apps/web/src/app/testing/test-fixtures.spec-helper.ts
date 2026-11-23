import type { HttpTestingController } from '@angular/common/http/testing';
import type { CachedPokemonResponse, TrainerProfile } from '@pokeverse/shared';

export function flushInitialRequests(httpMock: HttpTestingController): void {
  httpMock
    .match('/health/ready')
    .forEach((req) => req.flush(null, { status: 503, statusText: 'Down' }));
  httpMock
    .match('/api/v1/system/bootstrap')
    .forEach((req) => req.flush(null, { status: 503, statusText: 'Down' }));
  httpMock
    .match('/api/v1/auth/providers')
    .forEach((req) => req.flush({ googleEnabled: false, webauthnEnabled: true }));
  httpMock
    .match('/api/v1/auth/session')
    .forEach((req) => req.flush({ authenticated: false, canRefresh: false }));
}

export function createTrainerFixture(overrides?: Partial<TrainerProfile>): TrainerProfile {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    username: 'Red_Kanto',
    email: 'red@pokeverse.dev',
    emailVerifiedAt: null,
    mfaEnabled: false,
    hasPassword: true,
    role: 'TRAINER',
    badgesCount: 0,
    eloRating: 1000,
    lastMapId: 'pokeverse-town',
    lastX: 400,
    lastY: 320,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createCachedPokemonFixture(params: {
  readonly id: number;
  readonly name: string;
  readonly typeName: string;
  readonly typeId?: number;
  readonly height?: number;
  readonly weight?: number;
}): CachedPokemonResponse {
  return {
    cache: 'hit',
    pokemon: {
      id: params.id,
      name: params.name,
      height: params.height ?? 4,
      weight: params.weight ?? 60,
      types: [
        {
          slot: 1,
          type: {
            name: params.typeName,
            url: `https://pokeapi.co/api/v2/type/${params.typeId ?? 13}/`,
          },
        },
      ],
      abilities: [],
      stats: [],
      sprites: {
        front_default: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${params.id}.png`,
      },
    },
  };
}
