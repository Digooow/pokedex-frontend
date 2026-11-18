import { Test } from '@nestjs/testing';
import { SystemController } from './system.controller';

describe('SystemController', () => {
  it('returns phase-1 platform modules catalog', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SystemController],
    }).compile();

    const controller = moduleRef.get(SystemController);
    const data = controller.getBootstrap();

    expect(data.phase).toBe('phase-1');
    expect(data.modules).toHaveLength(5);
    expect(
      data.modules.find((mod) => mod.id === 'pokedex')?.requiresTrainer,
    ).toBe(false);
    expect(
      data.modules.find((mod) => mod.id === 'arcade')?.requiresTrainer,
    ).toBe(true);
    await moduleRef.close();
  });
});
