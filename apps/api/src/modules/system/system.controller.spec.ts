import { Test } from '@nestjs/testing';
import { SystemController } from './system.controller';

describe('SystemController', () => {
  it('returns phase-2a platform modules catalog', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SystemController],
    }).compile();

    const controller = moduleRef.get(SystemController);
    const data = controller.getBootstrap();

    expect(data.phase).toBe('phase-2b');
    expect(data.modules).toHaveLength(5);
    expect(
      data.modules.find((mod) => mod.id === 'pokedex')?.requiresTrainer,
    ).toBe(false);
    expect(
      data.modules.find((mod) => mod.id === 'character')?.requiresTrainer,
    ).toBe(false);
    expect(
      data.modules.find((mod) => mod.id === 'arcade')?.requiresTrainer,
    ).toBe(true);
    await moduleRef.close();
  });
});
