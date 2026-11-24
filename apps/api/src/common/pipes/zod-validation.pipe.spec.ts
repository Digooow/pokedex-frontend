import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const strictSchema = z
    .object({
      slotIndex: z.coerce.number().int().min(0).max(9),
      nested: z.object({
        name: z.string().trim().min(2),
      }),
    })
    .strict();

  it('transforms and returns validated data when input satisfies the Zod schema', () => {
    const pipe = new ZodValidationPipe(strictSchema);
    expect(
      pipe.transform({
        slotIndex: '4',
        nested: { name: '  Pikachu  ' },
      }),
    ).toEqual({
      slotIndex: 4,
      nested: { name: 'Pikachu' },
    });
  });

  it('throws BadRequestException with formatted nested paths and rejects unknown keys', () => {
    const pipe = new ZodValidationPipe(strictSchema);

    let nestedError: unknown;
    try {
      pipe.transform({ slotIndex: 12, nested: { name: 'A' } });
    } catch (err) {
      nestedError = err;
    }
    expect(nestedError).toBeInstanceOf(BadRequestException);
    expect((nestedError as BadRequestException).message).toContain('slotIndex');
    expect((nestedError as BadRequestException).message).toContain(
      'nested.name',
    );

    expect(() =>
      pipe.transform({
        slotIndex: 1,
        nested: { name: 'Pikachu' },
        extra: true,
      }),
    ).toThrow(BadRequestException);

    const rootPipe = new ZodValidationPipe(z.string().min(3));
    expect(() => rootPipe.transform('a')).toThrow(BadRequestException);
  });
});
