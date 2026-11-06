import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  async me(@CurrentUser() user: any) {
    const profile = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return { data: profile };
  }

  @Get()
  async list(@CurrentUser() user: any) {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId: user.sub },
      include: { workspace: true },
    });
    const workspaces = memberships.map((m) => ({
      id: m.workspaceId,
      name: m.workspace.name,
      slug: m.workspace.slug,
      role: m.role,
    }));
    return { data: workspaces };
  }
}
