import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { AuthenticatedUser, ROLES_KEY } from '../../../common/decorators/roles.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const authenticated = (await super.canActivate(context)) as boolean;
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required?.length && !required.includes(user?.role || '')) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Permissão insuficiente',
        code: 'AUTH_002',
      });
    }
    return authenticated;
  }

  handleRequest<TUser = AuthenticatedUser>(err: any, user: any): TUser {
    if (err || !user?.sub) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Token não informado ou inválido',
        code: 'AUTH_001',
      });
    }
    return user as TUser;
  }
}
