import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ERROR_CODES } from '../../common/constants/app.constants';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async validateUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        createdAt: true,
        workspaces: {
          select: {
            role: true,
            workspace: { select: { id: true, name: true, slug: true, industry: true } },
          },
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Usuário não encontrado.',
        code: ERROR_CODES.UNAUTHORIZED,
      });
    }
    return user;
  }

  async login(input: { email: string; password: string }) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { workspaces: { take: 1, orderBy: { workspaceId: 'asc' } } },
    });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }
    const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordOk) throw new UnauthorizedException('E-mail ou senha inválidos.');

    const workspaceId = user.workspaces[0]?.workspaceId;
    const accessToken = await this.signAccessToken(user, workspaceId);
    const refreshToken = await this.issueRefreshToken(user.id);
    return { tokens: { accessToken, refreshToken, expiresIn: 900 }, user: this.sanitize(user) };
  }

  async register(input: { email: string; password: string; name?: string }) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('Este e-mail já está cadastrado.');
    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name || input.email.split('@')[0],
      },
    });

    const name = input.name || input.email.split('@')[0];
    const workspace = await this.prisma.workspace.create({
      data: {
        name: `${name} — Workspace`,
        slug: `workspace-${crypto.randomBytes(6).toString('hex')}`,
      },
    });
    await this.prisma.workspaceMember.create({
      data: { workspaceId: workspace.id, userId: user.id, role: 'OWNER' },
    });

    return { user: this.sanitize(user) };
  }

  async refresh(refreshToken: string) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
    });
    if (!stored || stored.revoked || stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Sessão expirada. Faça login novamente.',
        code: ERROR_CODES.SOCIAL_TOKEN_EXPIRED,
      });
    }
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });
    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
      include: { workspaces: { take: 1, orderBy: { workspaceId: 'asc' } } },
    });
    if (!user) {
      throw new UnauthorizedException('Usuário da sessão não existe mais. Faça login novamente.');
    }
    const accessToken = await this.signAccessToken(user, user.workspaces[0]?.workspaceId);
    const newRefreshToken = await this.issueRefreshToken(user.id);
    return {
      tokens: { accessToken, refreshToken: newRefreshToken, expiresIn: 900 },
      user: this.sanitize(user),
    };
  }

  async logout(refreshToken: string) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revoked: false },
      data: { revoked: true },
    });
  }

  async issueRefreshToken(userId: string) {
    const random = crypto.randomBytes(48).toString('hex');
    const token = `${random}`;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });
    return token;
  }

  private async signAccessToken(
    user: { id: string; email: string; role: string },
    workspaceId?: string,
  ) {
    const payload = { sub: user.id, email: user.email, role: user.role, workspaceId };
    const accessToken = await this.jwtService.signAsync(payload);
    return accessToken;
  }

  private sanitize(user: { id: string; email: string; name: string | null; role: string }) {
    const { id, email, name, role } = user;
    return { id, email, name, role };
  }
}
