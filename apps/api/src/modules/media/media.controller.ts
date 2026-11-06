import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotImplementedException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateExternalMediaDto } from './dto/create-external-media.dto';

function workspaceOf(user: any): string {
  if (!user?.workspaceId) {
    throw new BadRequestException(
      'Usuário sem workspace associado. Faça login novamente para selecionar um workspace.',
    );
  }
  return user.workspaceId;
}

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  async list(@Query() query: any, @CurrentUser() user: any) {
    const result = await this.mediaService.list(workspaceOf(user), query);
    return {
      data: result.items,
      meta: { total: result.total, page: result.page, limit: result.limit },
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const media = await this.mediaService.findOne(id, workspaceOf(user));
    return { data: media };
  }

  @Post('external-url')
  async createExternal(
    @Body() dto: CreateExternalMediaDto,
    @CurrentUser() user: any,
  ) {
    const media = await this.mediaService.createExternal(workspaceOf(user), user.sub, dto);
    return { data: media };
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    await this.mediaService.remove(id, workspaceOf(user));
    return { data: { deleted: true } };
  }

  @Post('upload')
  async upload() {
    throw new NotImplementedException(
      'Upload direto para o storage ainda não está implementado. Cadastre uma URL pública de mídia ou use a biblioteca existente.',
    );
  }
}
