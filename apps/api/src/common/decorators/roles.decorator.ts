import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export interface AuthenticatedUser {
  sub: string;
  email: string;
  role: string;
  workspaceId?: string;
}
