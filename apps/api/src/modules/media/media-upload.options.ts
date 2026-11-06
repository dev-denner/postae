import { diskStorage } from 'multer';
import { randomBytes } from 'crypto';
import { mkdirSync } from 'fs';
import { extname, join, resolve } from 'path';
import { maxUploadBytes } from './media-storage.util';

function uploadDir(): string {
  return resolve(process.env.UPLOAD_DIR || join(process.cwd(), 'uploads'));
}

/**
 * Opções multipart do upload de mídia.
 *
 * O limite é resolvido por getter no momento da requisição, depois que o
 * ConfigModule carregou o .env. A validação fina (imagem x vídeo, extensão,
 * magic bytes) fica no MediaStorageService.
 */
export function mediaUploadOptions() {
  return {
    storage: diskStorage({
      destination: (_req, _file, callback) => {
        const directory = join(uploadDir(), '.tmp');
        mkdirSync(directory, { recursive: true });
        callback(null, directory);
      },
      filename: (_req, file, callback) => {
        const extension = extname(file.originalname || '')
          .toLowerCase()
          .replace(/[^.a-z0-9]/g, '');
        callback(null, `${Date.now()}-${randomBytes(10).toString('hex')}${extension}`);
      },
    }),
    limits: {
      get fileSize(): number {
        return maxUploadBytes();
      },
      files: 1,
    },
  };
}
