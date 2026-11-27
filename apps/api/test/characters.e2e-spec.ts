import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  CHARACTER_INITIAL_PRESETS,
  type CharacterAttributes,
  ZERO_ATTRIBUTE_ALLOCATION,
} from '@pokeverse/shared';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApiApp } from '../src/app.setup';
import { InfraProbesService } from '../src/infra/infra-probes.service';
import { KafkaService } from '../src/infra/kafka.service';
import { PrismaService } from '../src/infra/prisma.service';
import { RedisService } from '../src/infra/redis.service';
import { SessionService } from '../src/modules/auth/session.service';

interface InMemoryCharacterRecord {
  id: string;
  accountId: string;
  name: string;
  normalizedName: string;
  originKey: string;
  appearance: unknown;
  level: number;
  totalSkillMilestones: bigint;
  availableAttributePoints: number;
  hpCurrent: number;
  staminaCurrent: number;
  manaCurrent: number;
  hungerCurrent: number;
  thirstCurrent: number;
  fatigueCurrent: number;
  hexQ: number;
  hexR: number;
  hexZ: number;
  presenceMode: 'ONLINE';
  createdAt: Date;
  updatedAt: Date;
  attributes: CharacterAttributes;
}

describe('Characters API (e2e)', () => {
  let app: INestApplication<App>;
  const sessionStore = new Map<string, string>();
  const characterStore = new Map<string, InMemoryCharacterRecord>();

  function createInMemoryPrismaStub() {
    const txClient = {
      character: {
        findMany: jest.fn(
          (args: {
            where: { accountId: string };
            take: number;
            skip: number;
          }) => {
            const filtered = Array.from(characterStore.values()).filter(
              (item) => item.accountId === args.where.accountId,
            );
            return Promise.resolve(
              filtered.slice(args.skip, args.skip + args.take),
            );
          },
        ),
        count: jest.fn((args: { where: { accountId: string } }) => {
          const count = Array.from(characterStore.values()).filter(
            (item) => item.accountId === args.where.accountId,
          ).length;
          return Promise.resolve(count);
        }),
        findFirst: jest.fn(
          (args: { where: { id: string; accountId: string } }) => {
            const found = characterStore.get(args.where.id);
            if (found?.accountId !== args.where.accountId) {
              return Promise.resolve(null);
            }
            return Promise.resolve(found);
          },
        ),
        create: jest.fn((args: { data: Record<string, unknown> }) => {
          const normalized = String(args.data['normalizedName']);
          const duplicate = Array.from(characterStore.values()).some(
            (item) => item.normalizedName === normalized,
          );
          if (duplicate) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Duplicate character name',
              {
                code: 'P2002',
                clientVersion: '6.19.3',
              },
            );
          }
          const now = new Date();
          const attrsWrap = args.data['attributes'] as {
            create: CharacterAttributes;
          };
          const id = randomUUID();
          const record: InMemoryCharacterRecord = {
            id,
            accountId: String(args.data['accountId']),
            name: String(args.data['name']),
            normalizedName: normalized,
            originKey: String(args.data['originKey']),
            appearance: args.data['appearance'],
            level: 1,
            totalSkillMilestones: BigInt(0),
            availableAttributePoints: 0,
            hpCurrent: Number(args.data['hpCurrent']),
            staminaCurrent: Number(args.data['staminaCurrent']),
            manaCurrent: Number(args.data['manaCurrent']),
            hungerCurrent: 100,
            thirstCurrent: 100,
            fatigueCurrent: 0,
            hexQ: Number(args.data['hexQ']),
            hexR: Number(args.data['hexR']),
            hexZ: Number(args.data['hexZ']),
            presenceMode: 'ONLINE',
            createdAt: now,
            updatedAt: now,
            attributes: { ...attrsWrap.create },
          };
          characterStore.set(id, record);
          return Promise.resolve(record);
        }),
        updateMany: jest.fn(
          (args: {
            where: {
              id: string;
              accountId: string;
              availableAttributePoints: { gte: number };
            };
            data: { availableAttributePoints: { decrement: number } };
          }) => {
            const record = characterStore.get(args.where.id);
            const needed = args.where.availableAttributePoints.gte;
            if (record?.accountId !== args.where.accountId) {
              return Promise.resolve({ count: 0 });
            }
            if (record.availableAttributePoints < needed) {
              return Promise.resolve({ count: 0 });
            }
            record.availableAttributePoints -=
              args.data.availableAttributePoints.decrement;
            return Promise.resolve({ count: 1 });
          },
        ),
        findUniqueOrThrow: jest.fn((args: { where: { id: string } }) => {
          const record = characterStore.get(args.where.id);
          if (!record) {
            throw new Error('Missing record');
          }
          return Promise.resolve(record);
        }),
        update: jest.fn(
          (args: {
            where: { id: string };
            data: {
              hpCurrent: number;
              staminaCurrent: number;
              manaCurrent: number;
            };
          }) => {
            const record = characterStore.get(args.where.id);
            if (!record) {
              throw new Error('Missing record');
            }
            record.hpCurrent = args.data.hpCurrent;
            record.staminaCurrent = args.data.staminaCurrent;
            record.manaCurrent = args.data.manaCurrent;
            record.updatedAt = new Date();
            return Promise.resolve(record);
          },
        ),
      },
      characterAttribute: {
        update: jest.fn(
          (args: {
            where: { characterId: string };
            data: Record<keyof CharacterAttributes, { increment: number }>;
          }) => {
            const record = characterStore.get(args.where.characterId);
            if (!record) {
              throw new Error('Missing character');
            }
            for (const key of Object.keys(
              record.attributes,
            ) as (keyof CharacterAttributes)[]) {
              record.attributes[key] += args.data[key].increment;
            }
            return Promise.resolve({ ...record.attributes });
          },
        ),
      },
    };

    return {
      $connect: jest.fn(),
      $disconnect: jest.fn(),
      character: txClient.character,
      characterAttribute: txClient.characterAttribute,
      $transaction: jest.fn((arg: unknown) => {
        if (typeof arg === 'function') {
          return Promise.resolve(
            (arg as (tx: typeof txClient) => unknown)(txClient),
          );
        }
        if (Array.isArray(arg)) {
          return Promise.all(arg);
        }
        return Promise.resolve(arg);
      }),
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createInMemoryPrismaStub())
      .overrideProvider(RedisService)
      .useValue({
        ping: jest.fn().mockResolvedValue('PONG'),
        getString: jest.fn((key: string) =>
          Promise.resolve(sessionStore.get(key) ?? null),
        ),
        setStringEx: jest.fn((key: string, _ttl: number, value: string) => {
          sessionStore.set(key, value);
          return Promise.resolve();
        }),
        setStringNxEx: jest.fn().mockResolvedValue(true),
        delKeys: jest.fn().mockResolvedValue(1),
        consumeString: jest.fn().mockResolvedValue(null),
        consumeJson: jest.fn().mockResolvedValue(null),
        addToSetWithTtl: jest.fn().mockResolvedValue(undefined),
        getSetMembers: jest.fn().mockResolvedValue([]),
        getJson: jest.fn().mockResolvedValue(null),
        setJsonEx: jest.fn().mockResolvedValue(undefined),
        acquireIdempotencyLock: jest.fn().mockResolvedValue(true),
        incrementThrottle: jest.fn().mockResolvedValue({
          totalHits: 1,
          timeToExpire: 60,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
        onModuleDestroy: jest.fn(),
      })
      .overrideProvider(KafkaService)
      .useValue({
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
        describeCluster: jest.fn().mockResolvedValue(1),
        publish: jest.fn(),
        publishDlq: jest.fn(),
      })
      .overrideProvider(InfraProbesService)
      .useValue({
        checkAll: jest.fn().mockResolvedValue({
          postgres: { status: 'up', latencyMs: 1 },
          redis: { status: 'up', latencyMs: 1 },
          kafka: { status: 'up', latencyMs: 1 },
          s3: { status: 'up', latencyMs: 1 },
        }),
        onModuleDestroy: jest.fn(),
      })
      .compile();

    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApiApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('blocks visitor (401), MFA_PENDING (403), and cross-site CSRF (403) on /api/v1/characters', async () => {
    await request(app.getHttpServer()).get('/api/v1/characters').expect(401);

    const sessionService = app.get(SessionService);
    const pending = await sessionService.createSession({
      trainerId: '550e8400-e29b-41d4-a716-446655440010',
      username: 'PendingUser',
      familyId: '550e8400-e29b-41d4-a716-446655440011',
      state: 'MFA_PENDING',
      mfaMethods: ['totp'],
    });
    await request(app.getHttpServer())
      .get('/api/v1/characters')
      .set('Cookie', `pokeverse_session=${pending.rawSid}`)
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/characters')
      .set('Origin', 'https://evil.example')
      .send({})
      .expect(403);
  });

  it('validates Zod edge, creates character, enforces uniqueness & IDOR isolation, and prevents concurrent double allocation', async () => {
    const preset = CHARACTER_INITIAL_PRESETS[0];
    if (!preset) {
      throw new Error('Missing preset.');
    }

    const sessionService = app.get(SessionService);
    const userOne = await sessionService.createSession({
      trainerId: '550e8400-e29b-41d4-a716-446655440001',
      username: 'ExplorerOne',
      familyId: '550e8400-e29b-41d4-a716-446655440021',
      state: 'AUTHENTICATED',
      mfaMethods: [],
    });
    const userTwo = await sessionService.createSession({
      trainerId: '550e8400-e29b-41d4-a716-446655440002',
      username: 'ExplorerTwo',
      familyId: '550e8400-e29b-41d4-a716-446655440022',
      state: 'AUTHENTICATED',
      mfaMethods: [],
    });

    const validBody = {
      name: 'Kael Vance',
      originKey: 'harbor',
      appearance: {
        skinTone: 'bronze',
        hairStyle: 'curly',
        hairColor: 'chestnut',
        outfitStyle: 'vest',
        outfitColor: 'cobalt',
      },
      initialAttributes: preset.allocation,
    };

    await request(app.getHttpServer())
      .post('/api/v1/characters')
      .set('Origin', 'http://localhost:4200')
      .set('Cookie', `pokeverse_session=${userOne.rawSid}`)
      .send({
        ...validBody,
        initialAttributes: { ...ZERO_ATTRIBUTE_ALLOCATION, physique: 9 },
      })
      .expect(400);

    const createdRes = await request(app.getHttpServer())
      .post('/api/v1/characters')
      .set('Origin', 'http://localhost:4200')
      .set('Cookie', `pokeverse_session=${userOne.rawSid}`)
      .send(validBody)
      .expect(201);

    const createdId = (createdRes.body as { id: string }).id;
    expect(createdRes.body).toMatchObject({
      name: 'Kael Vance',
      originKey: 'harbor',
      classlessMode: true,
      level: 1,
    });

    await request(app.getHttpServer())
      .post('/api/v1/characters')
      .set('Origin', 'http://localhost:4200')
      .set('Cookie', `pokeverse_session=${userTwo.rawSid}`)
      .send({ ...validBody, name: 'kael vance' })
      .expect(409);

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/characters?limit=10&offset=0')
      .set('Cookie', `pokeverse_session=${userOne.rawSid}`)
      .expect(200);
    expect((listRes.body as { total: number }).total).toBe(1);

    await request(app.getHttpServer())
      .get(`/api/v1/characters/${createdId}`)
      .set('Cookie', `pokeverse_session=${userTwo.rawSid}`)
      .expect(404);

    const stored = characterStore.get(createdId);
    if (!stored) {
      throw new Error('Expected stored character.');
    }
    stored.availableAttributePoints = 1;

    const [allocA, allocB] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/characters/${createdId}/attributes/allocate`)
        .set('Origin', 'http://localhost:4200')
        .set('Cookie', `pokeverse_session=${userOne.rawSid}`)
        .send({ allocations: { ...ZERO_ATTRIBUTE_ALLOCATION, perception: 1 } }),
      request(app.getHttpServer())
        .post(`/api/v1/characters/${createdId}/attributes/allocate`)
        .set('Origin', 'http://localhost:4200')
        .set('Cookie', `pokeverse_session=${userOne.rawSid}`)
        .send({ allocations: { ...ZERO_ATTRIBUTE_ALLOCATION, magic: 1 } }),
    ]);

    const statuses = [allocA.status, allocB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);
    expect(stored.availableAttributePoints).toBe(0);
  });
});
