import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MediaStorageService } from './media-storage.service';

const JPEG_BYTES = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
  Buffer.from('conteudo-de-teste'),
]);

function fakeUpload(path: string, size: number): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'foto.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size,
    destination: '',
    filename: 'foto.jpg',
    path,
    buffer: Buffer.alloc(0),
    stream: null as any,
  };
}

describe('MediaStorageService', () => {
  let root: string;
  let service: MediaStorageService;
  const originalUploadDir = process.env.UPLOAD_DIR;
  const originalPublicBase = process.env.MEDIA_PUBLIC_BASE_URL;

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'postae-storage-'));
    process.env.UPLOAD_DIR = join(root, 'uploads');
    delete process.env.MEDIA_PUBLIC_BASE_URL;
    service = new MediaStorageService();
    service.ensureDirectories();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    if (originalUploadDir === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = originalUploadDir;
    if (originalPublicBase === undefined) delete process.env.MEDIA_PUBLIC_BASE_URL;
    else process.env.MEDIA_PUBLIC_BASE_URL = originalPublicBase;
  });

  it('salva upload válido, move para o storage e permite leitura/remoção', async () => {
    const temporary = join(service.temporaryDir, 'upload-temp.jpg');
    await fs.writeFile(temporary, JPEG_BYTES);

    const stored = await service.saveUpload(fakeUpload(temporary, JPEG_BYTES.length), 'ws_teste');

    expect(stored.kind).toBe('IMAGE');
    expect(stored.mimeType).toBe('image/jpeg');
    expect(stored.sizeBytes).toBe(JPEG_BYTES.length);
    expect(stored.storageKey).toMatch(/^ws_teste\/\d{4}-\d{2}\/.+\.jpg$/);
    expect(stored.checksum).toHaveLength(64);

    const path = service.localPath(stored.storageKey);
    await expect(fs.readFile(path)).resolves.toEqual(JPEG_BYTES);
    await expect(fs.access(temporary)).rejects.toBeTruthy();

    await expect(service.readLocal(stored.storageKey)).resolves.toEqual(JPEG_BYTES);

    await service.removeLocal(stored.storageKey);
    await expect(fs.access(path)).rejects.toBeTruthy();
  });

  it('rejeita e apaga arquivo cujo conteúdo não bate com o MIME', async () => {
    const temporary = join(service.temporaryDir, 'upload-falso.jpg');
    const fakeBytes = Buffer.from('isto-nao-e-um-jpeg');
    await fs.writeFile(temporary, fakeBytes);

    await expect(
      service.saveUpload(fakeUpload(temporary, fakeBytes.length), 'ws_teste'),
    ).rejects.toThrow(/não corresponde ao formato/);

    await expect(fs.access(temporary)).rejects.toBeTruthy();
  });

  it('rejeita path traversal em chave do storage', () => {
    expect(() => service.localPath('../../etc/passwd')).toThrow(/inválido/);
    expect(() => service.localPath('/etc/passwd')).toThrow(/inválido/);
  });

  it('gera URL assinada relativa no dev e absoluta quando há base pública', () => {
    const relative = service.signedUrl('media-1');
    expect(relative).toMatch(/^\/api\/media\/files\/media-1\?exp=\d+&sig=.+$/);

    process.env.MEDIA_PUBLIC_BASE_URL = 'https://midia.exemplo.com/';
    const absolute = service.signedUrl('media-1');
    expect(absolute).toMatch(/^https:\/\/midia\.exemplo\.com\/api\/media\/files\/media-1\?/);
  });

  it('valida o token da URL pública gerada', async () => {
    const storageKey = 'ws_teste/2026-11/foto.jpg';
    const filePath = service.localPath(storageKey);
    await fs.mkdir(join(root, 'uploads', 'ws_teste', '2026-11'), { recursive: true });
    await fs.writeFile(filePath, JPEG_BYTES);

    const url = new URL(service.signedUrl('media-1'), 'http://localhost');
    const expiresAt = Number(url.searchParams.get('exp'));
    const signature = url.searchParams.get('sig') || '';

    const file = service.resolvePublicFile(
      {
        id: 'media-1',
        mimeType: 'image/jpeg',
        sizeBytes: JPEG_BYTES.length,
        originalName: 'foto.jpg',
        storageDriver: 'LOCAL',
        storageKey,
      },
      expiresAt,
      signature,
    );
    expect(file.mimeType).toBe('image/jpeg');
    expect(() =>
      service.resolvePublicFile(
        {
          id: 'media-1',
          mimeType: 'image/jpeg',
          sizeBytes: JPEG_BYTES.length,
          storageDriver: 'LOCAL',
          storageKey,
        },
        expiresAt,
        `${signature}x`,
      ),
    ).toThrow(/inválido ou expirado/);
  });

  it('exige base pública para URL de plataforma em mídia local', () => {
    expect(() =>
      service.platformUrl({
        id: 'media-1',
        url: '/api/media/files/media-1',
        mimeType: 'image/jpeg',
        storageDriver: 'LOCAL',
        storageKey: 'ws_teste/foto.jpg',
      }),
    ).toThrow(/MEDIA_PUBLIC_BASE_URL/);

    process.env.MEDIA_PUBLIC_BASE_URL = 'https://midia.exemplo.com';
    expect(
      service.platformUrl({
        id: 'media-1',
        url: '/api/media/files/media-1',
        mimeType: 'image/jpeg',
        storageDriver: 'LOCAL',
        storageKey: 'ws_teste/foto.jpg',
      }),
    ).toMatch(/^https:\/\/midia\.exemplo\.com\/api\/media\/files\/media-1\?/);
  });
});
