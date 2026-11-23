import { SetMetadata } from '@nestjs/common';
import type { PermissionScope, TrainerRole } from '@pokeverse/shared';

export const ROLES_KEY = 'pokeverse:roles';
export const SCOPES_KEY = 'pokeverse:scopes';

export const Roles = (...roles: TrainerRole[]) => SetMetadata(ROLES_KEY, roles);

export const Scopes = (...scopes: PermissionScope[]) =>
  SetMetadata(SCOPES_KEY, scopes);
