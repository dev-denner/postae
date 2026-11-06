import {
  hasValidSignature,
  isSafeStorageKey,
  signMediaAccess,
  validateUploadMetadata,
  verifyMediaAccess,
} from './media-storage.util';

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MP4_HEADER = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34]);
const WEBM_HEADER = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02]);

describe('media-storage.util', () => {
  const originalImageLimit = process.env.MAX_IMAGE_UPLOAD_MB;
  const originalVideoLimit = process.env.MAX_VIDEO_UPLOAD_MB;

  beforeEach(() => {
    delete process.env.MAX_IMAGE_UPLOAD_MB;
    delete process.env.MAX_VIDEO_UPLOAD_MB;
  });

  afterAll(() => {
    if (originalImageLimit === undefined) delete process.env.MAX_IMAGE_UPLOAD_MB;
    else process.env.MAX_IMAGE_UPLOAD_MB = originalImageLimit;
    if (originalVideoLimit === undefined) delete process.env.MAX_VIDEO_UPLOAD_MB;
    else process.env.MAX_VIDEO_UPLOAD_MB = originalVideoLimit;
  });

  describe('validateUploadMetadata', () => {
    it('aceita imagem JPEG válida', () => {
      expect(
        validateUploadMetadata({
          originalname: 'foto.JPG',
          mimetype: 'image/jpeg',
          size: 1024,
        }),
      ).toEqual({ kind: 'IMAGE', mimeType: 'image/jpeg', extension: '.jpg' });
    });

    it('aceita vídeo MP4 válido', () => {
      expect(
        validateUploadMetadata({
          originalname: 'video.mp4',
          mimetype: 'video/mp4',
          size: 1024,
        }),
      ).toEqual({ kind: 'VIDEO', mimeType: 'video/mp4', extension: '.mp4' });
    });

    it('rejeita MIME não suportado', () => {
      expect(() =>
        validateUploadMetadata({
          originalname: 'script.exe',
          mimetype: 'application/x-msdownload',
          size: 10,
        }),
      ).toThrow(/Formato não suportado/);
    });

    it('rejeita extensão que não corresponde ao MIME', () => {
      expect(() =>
        validateUploadMetadata({
          originalname: 'foto.png',
          mimetype: 'image/jpeg',
          size: 10,
        }),
      ).toThrow(/não corresponde/);
    });

    it('rejeita arquivo vazio', () => {
      expect(() =>
        validateUploadMetadata({
          originalname: 'foto.jpg',
          mimetype: 'image/jpeg',
          size: 0,
        }),
      ).toThrow(/vazio/);
    });

    it('respeita o limite de imagem configurado', () => {
      process.env.MAX_IMAGE_UPLOAD_MB = '1';
      expect(() =>
        validateUploadMetadata({
          originalname: 'foto.jpg',
          mimetype: 'image/jpeg',
          size: 2 * 1024 * 1024,
        }),
      ).toThrow(/Limite: 1 MB/);
    });

    it('respeita o limite de vídeo configurado', () => {
      process.env.MAX_VIDEO_UPLOAD_MB = '1';
      expect(() =>
        validateUploadMetadata({
          originalname: 'video.mp4',
          mimetype: 'video/mp4',
          size: 2 * 1024 * 1024,
        }),
      ).toThrow(/Limite: 1 MB/);
    });
  });

  describe('hasValidSignature', () => {
    it('reconhece cabeçalhos válidos', () => {
      expect(hasValidSignature('image/jpeg', JPEG_HEADER)).toBe(true);
      expect(hasValidSignature('image/png', PNG_HEADER)).toBe(true);
      expect(hasValidSignature('video/mp4', MP4_HEADER)).toBe(true);
      expect(hasValidSignature('video/webm', WEBM_HEADER)).toBe(true);
    });

    it('rejeita conteúdo que não corresponde ao formato', () => {
      expect(hasValidSignature('image/jpeg', PNG_HEADER)).toBe(false);
      expect(hasValidSignature('video/mp4', JPEG_HEADER)).toBe(false);
      expect(hasValidSignature('image/png', Buffer.from('GIF89a'))).toBe(false);
    });
  });

  describe('assinatura de acesso', () => {
    const mediaId = 'cmteste123';

    it('valida assinatura correta e ainda vigente', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 60;
      const signature = signMediaAccess(mediaId, expiresAt);
      expect(verifyMediaAccess(mediaId, expiresAt, signature)).toBe(true);
    });

    it('rejeita assinatura adulterada', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 60;
      const signature = signMediaAccess(mediaId, expiresAt);
      expect(verifyMediaAccess(mediaId, expiresAt, `${signature}x`)).toBe(false);
      expect(verifyMediaAccess('outro-id', expiresAt, signature)).toBe(false);
    });

    it('rejeita assinatura expirada', () => {
      const expiresAt = Math.floor(Date.now() / 1000) - 1;
      const signature = signMediaAccess(mediaId, expiresAt);
      expect(verifyMediaAccess(mediaId, expiresAt, signature)).toBe(false);
    });

    it('rejeita assinatura vazia', () => {
      const expiresAt = Math.floor(Date.now() / 1000) + 60;
      expect(verifyMediaAccess(mediaId, expiresAt, '')).toBe(false);
    });
  });

  describe('isSafeStorageKey', () => {
    it('aceita caminhos relativos comuns', () => {
      expect(isSafeStorageKey('workspace/2026-11/arquivo.jpg')).toBe(true);
    });

    it('rejeita path traversal e caminhos absolutos', () => {
      expect(isSafeStorageKey('../etc/passwd')).toBe(false);
      expect(isSafeStorageKey('workspace/../../etc/passwd')).toBe(false);
      expect(isSafeStorageKey('/etc/passwd')).toBe(false);
      expect(isSafeStorageKey('..\\windows\\system32')).toBe(false);
      expect(isSafeStorageKey('workspace/\0arquivo')).toBe(false);
      expect(isSafeStorageKey('')).toBe(false);
    });
  });
});
