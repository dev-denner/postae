import { adaptContent, validateMediaForPlatform } from './social-content.adapter';
import { PLATFORM_CAPABILITIES } from './social.constants';

const image = (mimeType = 'image/jpeg') => ({ kind: 'IMAGE', mimeType });
const video = (mimeType = 'video/mp4') => ({ kind: 'VIDEO', mimeType });

describe('SocialContentAdapter', () => {
  it('mantém a legenda dentro do limite do Instagram', () => {
    const adapted = adaptContent('INSTAGRAM', { text: 'a'.repeat(3000) });
    expect(adapted.caption.length).toBeLessThanOrEqual(
      PLATFORM_CAPABILITIES.INSTAGRAM.maxCaptionLength,
    );
  });

  it('adiciona hashtags à legenda', () => {
    const adapted = adaptContent('INSTAGRAM', { text: 'Olá mundo', hashtags: ['aurora', 'lancamento'] });
    expect(adapted.caption).toContain('#aurora');
    expect(adapted.caption).toContain('#lancamento');
  });

  it('respeita o limite de caracteres do X (Twitter)', () => {
    const adapted = adaptContent('TWITTER', { text: 'a'.repeat(400) });
    expect(adapted.caption.length).toBeLessThanOrEqual(PLATFORM_CAPABILITIES.TWITTER.maxCaptionLength);
  });
});

describe('validateMediaForPlatform', () => {
  it('exige mídia no Instagram', () => {
    const result = validateMediaForPlatform('INSTAGRAM', []);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/exige ao menos uma imagem ou vídeo/);
  });

  it('limita o carrossel do Instagram a 10 mídias', () => {
    const result = validateMediaForPlatform('INSTAGRAM', Array.from({ length: 11 }, () => image()));
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/máximo 10/);
  });

  it('exige vídeo no TikTok e no YouTube', () => {
    expect(validateMediaForPlatform('TIKTOK', [image()]).ok).toBe(false);
    expect(validateMediaForPlatform('YOUTUBE', []).ok).toBe(false);
    expect(validateMediaForPlatform('TIKTOK', [video()]).ok).toBe(true);
    expect(validateMediaForPlatform('YOUTUBE', [video()]).ok).toBe(true);
  });

  it('rejeita vídeo e mais de 4 imagens no X', () => {
    expect(validateMediaForPlatform('TWITTER', [video()]).ok).toBe(false);
    const result = validateMediaForPlatform(
      'TWITTER',
      Array.from({ length: 5 }, () => image()),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/máximo 4 imagens/);
  });

  it('limita o Threads a uma mídia', () => {
    const result = validateMediaForPlatform('THREADS', [image(), image()]);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/apenas uma mídia/);
  });

  it('rejeita formato de vídeo incompatível', () => {
    const result = validateMediaForPlatform('INSTAGRAM', [video('video/avi')]);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/Formato de vídeo não suportado/);
  });

  it('não aceita imagens junto de vídeo no TikTok/YouTube', () => {
    expect(validateMediaForPlatform('TIKTOK', [video(), image()]).ok).toBe(false);
    expect(validateMediaForPlatform('YOUTUBE', [video(), image()]).ok).toBe(false);
  });

  it('não aceita vídeo e imagens juntos no Facebook', () => {
    const result = validateMediaForPlatform('FACEBOOK', [video(), image()]);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/vídeo ou imagens/);
  });
});
