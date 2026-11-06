import { adaptContent } from './social-content.adapter';
import { PLATFORM_CAPABILITIES } from './social.constants';

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
