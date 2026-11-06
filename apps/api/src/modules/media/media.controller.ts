import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'fs';
import type { Response } from 'express';
import { MediaService } from './media.service';
import { MediaStorageService, safeDownloadName } from './media-storage.service';
import { mediaUploadOptions } from './media-upload.options';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CreateExternalMediaDto } from './dto/create-external-media.dto';

function workspaceOf(user: any): string {
  if (!user?.workspaceId) {
    throw new BadRequestException(
      'Usuário sem workspace associado. Faça login novamente para selecionar um workspace.',
    );
  }
  return user.workspaceId;
}

function parseTags(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const tags = raw
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0)
    .slice(0, 20)
    .map((item) => item.slice(0, 50));
  return tags.length ? tags : undefined;
}

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly storage: MediaStorageService,
  ) {}

  @Get()
  async list(@Query() query: any, @CurrentUser() user: any) {
    const result = await this.mediaService.list(workspaceOf(user), query);
    return {
      data: result.items,
      meta: { total: result.total, page: result.page, limit: result.limit },
    };
  }

  /**
   * Arquivo local acessado por URL assinada e temporária. É público na rota
   * (sem JWT) porque redes sociais precisam baixar a mídia, mas o token HMAC
   * limita o acesso e expira.
   */
  @Get('files/:id')
  @Public()
  async serveFile(
    @Param('id') id: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() response: Response,
  ) {
    const expiresAt = Number(exp);
    if (!Number.isFinite(expiresAt) || !sig) {
      throw new BadRequestException('Link de mídia inválido ou expirado.');
    }
    const file = await this.mediaService.getPublicFile(id, expiresAt, sig);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.sizeBytes));
    response.setHeader('Cache-Control', 'private, max-age=300');
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${safeDownloadName(file.originalName)}"`,
    );
    createReadStream(file.path).pipe(response);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const media = await this.mediaService.findOne(id, workspaceOf(user));
    return { data: media };
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', mediaUploadOptions()))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
    @CurrentUser() user: any,
  ) {
    if (!file) {
      throw new BadRequestException('Selecione um arquivo para enviar.');
    }
    const media = await this.mediaService.createUpload(
      workspaceOf(user),
      user.sub,
      file,
      {
        folder: typeof body?.folder === 'string' ? body.folder.slice(0, 80) : undefined,
        tags: parseTags(body?.tags),
      },
    );
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
}
