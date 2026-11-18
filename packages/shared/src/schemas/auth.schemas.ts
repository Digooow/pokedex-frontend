import { z } from 'zod';

export const RegisterTrainerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, 'Nome de treinador deve ter ao menos 3 caracteres.')
      .max(24, 'Nome de treinador deve ter no máximo 24 caracteres.')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Use apenas letras, números, "_" ou "-".'),
    email: z.string().trim().toLowerCase().pipe(z.email('E-mail inválido.')),
    password: z
      .string()
      .min(8, 'A senha deve ter no mínimo 8 caracteres.')
      .max(128, 'A senha deve ter no máximo 128 caracteres.'),
  })
  .strict();

export type RegisterTrainerInput = z.infer<typeof RegisterTrainerSchema>;

export const LoginTrainerSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email('E-mail inválido.')),
    password: z.string().min(1, 'Informe a senha.').max(128),
  })
  .strict();

export type LoginTrainerInput = z.infer<typeof LoginTrainerSchema>;

export const TrainerProfileSchema = z.object({
  id: z.uuid(),
  username: z.string().min(3).max(32),
  email: z.email(),
  badgesCount: z.number().int().nonnegative(),
  eloRating: z.number().int().nonnegative(),
  lastMapId: z.string().min(1),
  lastX: z.number().int(),
  lastY: z.number().int(),
  createdAt: z.iso.datetime(),
});

export type TrainerProfile = z.infer<typeof TrainerProfileSchema>;

export const AuthSessionResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresInSec: z.number().int().positive(),
  trainer: TrainerProfileSchema,
});

export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;
