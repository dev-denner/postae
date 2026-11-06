import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { CreatePostDto, UpdatePostDto } from './dto/create-post.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/decorators/roles.decorator';

function workspaceOf(user: AuthenticatedUser): string {
  if (!user.workspaceId) {
    throw new BadRequestException(
      'Usuário sem workspace associado. Faça login novamente para selecionar um workspace.',
    );
  }
  return user.workspaceId;
}

@Controller('posts')
@UseGuards(JwtAuthGuard)
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  async create(@Body() dto: CreatePostDto, @CurrentUser() user: AuthenticatedUser) {
    const post = await this.postsService.create(workspaceOf(user), dto);
    return { data: post };
  }

  @Get()
  async findAll(@Query() query: any, @CurrentUser() user: AuthenticatedUser) {
    const result = await this.postsService.findAll(workspaceOf(user), query);
    return {
      data: result.items,
      meta: { total: result.total, page: result.page, limit: result.limit },
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const post = await this.postsService.findOne(id, workspaceOf(user));
    return { data: post };
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const post = await this.postsService.update(id, workspaceOf(user), dto);
    return { data: post };
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.postsService.remove(id, workspaceOf(user));
    return { data: { deleted: true } };
  }

  @Post(':id/duplicate')
  async duplicate(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const post = await this.postsService.duplicate(id, workspaceOf(user));
    return { data: post };
  }

  @Post(':id/schedule-now')
  async scheduleNow(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const post = await this.postsService.scheduleNow(id, workspaceOf(user));
    return { data: post };
  }

  @Post(':id/retry')
  async retry(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const post = await this.postsService.retry(id, workspaceOf(user));
    return { data: post };
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const post = await this.postsService.cancel(id, workspaceOf(user));
    return { data: post };
  }
}
