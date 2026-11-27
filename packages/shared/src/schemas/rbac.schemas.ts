import * as z from 'zod';

export const TrainerRoleSchema = z.enum(['VISITOR', 'TRAINER', 'MODERATOR', 'ADMIN']);
export type TrainerRole = z.infer<typeof TrainerRoleSchema>;

export const PermissionScopeSchema = z.enum([
  'pokedex:read',
  'pokedex:write',
  'account:read',
  'account:manage',
  'lab:run',
  'character:read',
  'character:write',
  'ops:audit',
]);
export type PermissionScope = z.infer<typeof PermissionScopeSchema>;

export const ROLE_DEFAULT_SCOPES: Readonly<Record<TrainerRole, readonly PermissionScope[]>> = {
  VISITOR: ['pokedex:read'],
  TRAINER: [
    'pokedex:read',
    'pokedex:write',
    'account:read',
    'account:manage',
    'lab:run',
    'character:read',
    'character:write',
  ],
  MODERATOR: [
    'pokedex:read',
    'pokedex:write',
    'account:read',
    'account:manage',
    'lab:run',
    'character:read',
    'character:write',
    'ops:audit',
  ],
  ADMIN: [
    'pokedex:read',
    'pokedex:write',
    'account:read',
    'account:manage',
    'lab:run',
    'character:read',
    'character:write',
    'ops:audit',
  ],
};

export function hasRequiredRole(
  currentRole: TrainerRole,
  requiredRoles: readonly TrainerRole[],
): boolean {
  if (requiredRoles.length === 0) {
    return true;
  }
  return requiredRoles.includes(currentRole);
}

export function hasRequiredScopes(
  currentScopes: readonly PermissionScope[],
  requiredScopes: readonly PermissionScope[],
): boolean {
  if (requiredScopes.length === 0) {
    return true;
  }
  return requiredScopes.every((scope) => currentScopes.includes(scope));
}
