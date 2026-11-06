import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from './roles.decorator';

export const CurrentUser = createParamDecorator(
  (
    data: keyof AuthenticatedUser | undefined,
    ctx: ExecutionContext,
  ): AuthenticatedUser | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const user = request?.user as AuthenticatedUser | undefined;
    if (!user) return undefined;
    if (data) {
      const value = (user as unknown as Record<string, unknown>)[data];
      return value as AuthenticatedUser | undefined;
    }
    return user;
  },
);
