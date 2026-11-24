import { type DeepMockProxy, mockDeep } from 'jest-mock-extended';
import type { PrismaService } from '../infra/prisma.service';

export type DeepPrismaMock = DeepMockProxy<PrismaService>;

export function createDeepPrismaMock(): DeepPrismaMock {
  return mockDeep<PrismaService>();
}
