import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  AtSign,
  CalendarClock,
  Check,
  Facebook,
  Image as ImageIcon,
  Instagram,
  Link2,
  Loader2,
  Music2,
  Plus,
  Send,
  Trash2,
  Twitter,
  Video,
  Youtube,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { api, getApiError } from '@/lib/api';
import {
  accountHandle,
  PROVIDER_ORDER,
  providerLabel,
  type PostMedia,
  type PostRecord,
  type SocialAccount,
} from '@/lib/social';

const CTAS = ['LINK', 'WHATSAPP', 'MESSENGER', 'WEBSITE', 'CALL', 'SHOP'];

const PROVIDER_ICONS: Record<string, LucideIcon> = {
  INSTAGRAM: Instagram,
  FACEBOOK: Facebook,
  THREADS: AtSign,
  TWITTER: Twitter,
  TIKTOK: Music2,
  YOUTUBE: Youtube,
};

const MEDIA_REQUIRED = new Set(['INSTAGRAM', 'TIKTOK', 'YOUTUBE']);
const VIDEO_REQUIRED = new Set(['TIKTOK', 'YOUTUBE']);
const READ_ONLY_STATUSES = new Set(['PUBLISHED', 'PARTIAL', 'PROCESSING']);

type LocalMedia = PostMedia['media'];
type SaveTarget = 'draft' | 'schedule' | 'now';

function toLocalDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function parseHashtags(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((tag) => tag.trim().replace(/^#+/, ''))
    .filter(Boolean);
}

export function CreatePost() {
  const { id } = useParams<{ id: string }>();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [cta, setCta] = useState('LINK');
  const [link, setLink] = useState('');
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [media, setMedia] = useState<LocalMedia[]>([]);
  const [publishAt, setPublishAt] = useState('');
  const [newMediaUrl, setNewMediaUrl] = useState('');
  const [newMediaKind, setNewMediaKind] = useState<'IMAGE' | 'VIDEO'>('IMAGE');
  const [postStatus, setPostStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState<SaveTarget | null>(null);
  const [addingMedia, setAddingMedia] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useRef<string | null>(null);

  const accountsQuery = useQuery({
    queryKey: ['social', 'accounts'],
    queryFn: async () => {
      const response = await api.get('/social/accounts');
      return (response.data?.data ?? response.data) as SocialAccount[];
    },
  });

  const postQuery = useQuery({
    queryKey: ['posts', id],
    enabled: editing,
    queryFn: async () => {
      const response = await api.get(`/posts/${id}`);
      return (response.data?.data ?? response.data) as PostRecord;
    },
  });

  useEffect(() => {
    const post = postQuery.data;
    if (!post || hydrated.current === post.id) return;
    hydrated.current = post.id;
    const content = post.content || {};
    setTitle(content.title || '');
    setText(content.text || content.caption || '');
    setHashtags((content.hashtags || []).map((tag) => `#${tag.replace(/^#+/, '')}`).join(' '));
    setCta(content.cta || 'LINK');
    setLink(content.link || '');
    setPublishAt(post.publishAt ? toLocalDateTime(post.publishAt) : '');
    setAccountIds(
      (post.destinations || [])
        .map((destination) => destination.socialAccountId)
        .filter((value): value is string => Boolean(value)),
    );
    setMedia((post.media || []).map((entry) => entry.media));
    setPostStatus(post.status);
  }, [postQuery.data]);

  const accounts = accountsQuery.data ?? [];
  const selectedAccounts = useMemo(
    () => accounts.filter((account) => accountIds.includes(account.id)),
    [accounts, accountIds],
  );
  const selectedProviders = useMemo(
    () => [...new Set(selectedAccounts.map((account) => account.provider))],
    [selectedAccounts],
  );
  const hasVideo = media.some((item) => item.kind === 'VIDEO');
  const hasImage = media.some((item) => item.kind === 'IMAGE');
  const missingMedia = selectedProviders.filter((provider) => MEDIA_REQUIRED.has(provider));
  const missingVideo = selectedProviders.filter((provider) => VIDEO_REQUIRED.has(provider));
  const readOnly = Boolean(postStatus && READ_ONLY_STATUSES.has(postStatus));
  const previewProvider = selectedProviders[0];
  const previewAccount = selectedAccounts[0];

  const groupedAccounts = useMemo(() => {
    return PROVIDER_ORDER.map((provider) => ({
      provider,
      accounts: accounts.filter((account) => account.provider === provider),
    })).filter((group) => group.accounts.length > 0);
  }, [accounts]);

  const adaptedPreview = useMemo(() => {
    const tagText = parseHashtags(hashtags)
      .map((tag) => `#${tag}`)
      .join(' ');
    return [text, tagText, link].filter(Boolean).join('\n');
  }, [text, hashtags, link]);

  function toggleAccount(account: SocialAccount) {
    setAccountIds((previous) =>
      previous.includes(account.id)
        ? previous.filter((value) => value !== account.id)
        : [...previous, account.id],
    );
  }

  async function addMedia() {
    if (!newMediaUrl.trim()) {
      setError('Informe a URL pública da mídia.');
      return;
    }
    setAddingMedia(true);
    setError(null);
    try {
      const response = await api.post('/media/external-url', {
        url: newMediaUrl.trim(),
        kind: newMediaKind,
        mimeType: newMediaKind === 'VIDEO' ? 'video/mp4' : 'image/jpeg',
      });
      const created = (response.data?.data ?? response.data) as LocalMedia;
      setMedia((previous) => [...previous, created]);
      setNewMediaUrl('');
    } catch (err) {
      setError(getApiError(err, 'Não foi possível cadastrar a mídia.'));
    } finally {
      setAddingMedia(false);
    }
  }

  function validateForPublish(): string | null {
    if (!accountIds.length) return 'Selecione pelo menos uma conta conectada.';
    if (selectedAccounts.length !== accountIds.length) {
      return 'Uma das contas selecionadas não está disponível. Atualize a página.';
    }
    const unavailable = selectedAccounts.filter((account) => !account.canPublish);
    if (unavailable.length) {
      return `Reconecte antes de publicar: ${unavailable
        .map((account) => account.displayName)
        .join(', ')}.`;
    }
    if (!text.trim()) return 'Escreva o texto ou a legenda da publicação.';
    if (missingMedia.length && !media.length) {
      return `${missingMedia.map(providerLabel).join(', ')} exige mídia. Adicione uma imagem ou vídeo por URL pública.`;
    }
    if (missingVideo.length && !hasVideo) {
      return `${missingVideo.map(providerLabel).join(', ')} exige vídeo. Adicione uma mídia do tipo vídeo.`;
    }
    if (selectedProviders.includes('TWITTER') && hasVideo) {
      return 'O X não aceita vídeo nesta versão. Remova o vídeo ou desmarque a conta do X.';
    }
    if (selectedProviders.includes('INSTAGRAM') && !hasImage && !hasVideo) {
      return 'O Instagram exige uma imagem ou vídeo.';
    }
    return null;
  }

  async function save(target: SaveTarget) {
    setError(null);
    if (readOnly) {
      setError('Este post não pode ser editado porque já foi publicado ou está processando.');
      return;
    }
    if (target !== 'draft') {
      const validation = validateForPublish();
      if (validation) {
        setError(validation);
        return;
      }
    }
    if (target === 'schedule' && !publishAt) {
      setError('Escolha a data e hora do agendamento.');
      return;
    }
    if (target === 'schedule') {
      const runAt = new Date(publishAt);
      if (Number.isNaN(runAt.getTime()) || runAt.getTime() <= Date.now()) {
        setError('A data de agendamento precisa estar no futuro.');
        return;
      }
    }

    setSaving(target);
    try {
      const parsedTags = parseHashtags(hashtags);
      const payload = {
        title: title.trim() || undefined,
        text: text.trim() || undefined,
        caption: text.trim() || undefined,
        hashtags: parsedTags,
        link: link.trim() || undefined,
        cta,
        socialAccountIds: accountIds,
        mediaIds: media.map((item) => item.id),
        status: target === 'schedule' ? 'SCHEDULED' : 'DRAFT',
        publishAt:
          target === 'schedule' && publishAt
            ? new Date(publishAt).toISOString()
            : undefined,
      };

      let postId = id;
      if (editing && id) {
        await api.put(`/posts/${id}`, payload);
      } else {
        const response = await api.post('/posts', payload);
        const created = (response.data?.data ?? response.data) as PostRecord;
        postId = created.id;
      }

      if (target === 'now' && postId) {
        await api.post(`/posts/${postId}/schedule-now`);
      }

      await queryClient.invalidateQueries({ queryKey: ['posts'] });
      navigate('/posts');
    } catch (err) {
      setError(getApiError(err, 'Não foi possível salvar a publicação.'));
    } finally {
      setSaving(null);
    }
  }

  if (editing && postQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando publicação...
      </div>
    );
  }

  if (editing && postQuery.error) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {getApiError(postQuery.error, 'Não foi possível carregar a publicação.')}
        </div>
        <Button variant="outline" onClick={() => navigate('/posts')}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {editing ? 'Editar Publicação' : 'Criar Publicação'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Escolha contas específicas e publique em todas de uma vez.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => save('draft')} disabled={Boolean(saving) || readOnly}>
            {saving === 'draft' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salvar rascunho
          </Button>
          <Button variant="outline" onClick={() => save('schedule')} disabled={Boolean(saving) || readOnly}>
            {saving === 'schedule' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CalendarClock className="h-4 w-4" />
            )}
            Agendar
          </Button>
          <Button onClick={() => save('now')} disabled={Boolean(saving) || readOnly}>
            {saving === 'now' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Publicar agora
          </Button>
        </div>
      </div>

      {readOnly && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
          Este post está {postStatus === 'PROCESSING' ? 'em processamento' : 'já publicado'} e não pode
          ser editado. Para republicar apenas as contas com falha, use a lista de publicações.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Contas de destino</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {accountsQuery.isLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando contas...
                </div>
              )}
              {!accountsQuery.isLoading && !accounts.length && (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  <p>Nenhuma conta conectada.</p>
                  <Button
                    variant="outline"
                    className="mt-3"
                    onClick={() => navigate('/settings?tab=accounts')}
                  >
                    Conectar uma conta
                  </Button>
                </div>
              )}
              {groupedAccounts.map((group) => {
                const Icon = PROVIDER_ICONS[group.provider] || Link2;
                return (
                  <div key={group.provider} className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                      <Icon className="h-4 w-4" /> {providerLabel(group.provider)}
                    </div>
                    {group.accounts.map((account) => {
                      const checked = accountIds.includes(account.id);
                      const selectable = account.canPublish;
                      return (
                        <label
                          key={account.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                            checked ? 'border-violet-500/50 bg-violet-500/10' : 'hover:bg-muted/40'
                          } ${!selectable && !checked ? 'cursor-not-allowed opacity-60' : ''}`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-violet-500"
                            checked={checked}
                            disabled={!selectable && !checked}
                            onChange={() => toggleAccount(account)}
                          />
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {account.displayName}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {accountHandle(account)}
                              {account.username ? ' · ' : ''}
                              {providerLabel(account.provider)}
                            </span>
                          </span>
                          {!selectable && (
                            <Badge variant="outline" className="border-amber-500/30 text-amber-400">
                              Reconectar
                            </Badge>
                          )}
                          {checked && <Check className="h-4 w-4 text-violet-400" />}
                        </label>
                      );
                    })}
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">
                Você pode selecionar várias contas da mesma rede. Cada destino terá um resultado
                individual.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-5 p-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Título (opcional)</label>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Usado principalmente no YouTube"
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Conteúdo</label>
                  <span className="text-xs text-muted-foreground">{text.length} caracteres</span>
                </div>
                <Textarea
                  placeholder="Escreva a legenda..."
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  className="min-h-[150px]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Hashtags</label>
                <Input
                  placeholder="#aurora #lancamento"
                  value={hashtags}
                  onChange={(event) => setHashtags(event.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Call To Action</label>
                  <select
                    value={cta}
                    onChange={(event) => setCta(event.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  >
                    {CTAS.map((option) => (
                      <option key={option} value={option} className="bg-background">
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Link</label>
                  <Input
                    placeholder="https://..."
                    value={link}
                    onChange={(event) => setLink(event.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Agendamento</label>
                <Input
                  type="datetime-local"
                  value={publishAt}
                  onChange={(event) => setPublishAt(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Obrigatório para “Agendar”. Para publicar agora, não é necessário.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Mídia</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {media.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {media.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-lg border p-2">
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-md bg-muted">
                        {item.kind === 'IMAGE' ? (
                          <img
                            src={item.url}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(event) => {
                              event.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <Video className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{item.mimeType}</p>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-[11px] text-muted-foreground hover:underline"
                        >
                          {item.url}
                        </a>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setMedia((previous) => previous.filter((entry) => entry.id !== item.id))
                        }
                        title="Remover mídia do post"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Adicionar mídia por URL pública</label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="min-w-[220px] flex-1"
                    placeholder="https://cdn.exemplo.com/video.mp4"
                    value={newMediaUrl}
                    onChange={(event) => setNewMediaUrl(event.target.value)}
                  />
                  <select
                    value={newMediaKind}
                    onChange={(event) => setNewMediaKind(event.target.value as 'IMAGE' | 'VIDEO')}
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    <option value="IMAGE" className="bg-background">Imagem</option>
                    <option value="VIDEO" className="bg-background">Vídeo</option>
                  </select>
                  <Button variant="outline" onClick={addMedia} disabled={addingMedia}>
                    {addingMedia ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Adicionar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Upload direto ainda não está implementado. A URL precisa ser pública e acessível
                  pelas plataformas. Endereços locais ou de rede interna são bloqueados.
                </p>
              </div>

              {missingMedia.length > 0 && (
                <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {missingMedia.map(providerLabel).join(', ')} exige mídia
                    {missingVideo.length ? ' (vídeo para TikTok/YouTube)' : ''}.
                  </span>
                </div>
              )}
              {selectedProviders.includes('TWITTER') && hasVideo && (
                <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>O X não aceita vídeo nesta versão; remova o vídeo ou desmarque a conta.</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Preview{' '}
              {previewProvider ? `— ${providerLabel(previewProvider)}` : '— selecione uma conta'}
            </h2>
            {previewAccount && <Badge>{previewAccount.displayName}</Badge>}
          </div>
          {previewProvider ? (
            <motion.div
              key={previewProvider + previewAccount?.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto max-w-sm"
            >
              <div className="rounded-[2rem] border bg-gradient-to-br from-zinc-900 to-zinc-800 p-2 shadow-2xl">
                <div className="overflow-hidden rounded-[1.5rem] bg-white">
                  {hasImage ? (
                    <img
                      src={media.find((item) => item.kind === 'IMAGE')?.url}
                      alt=""
                      className="aspect-[4/5] w-full object-cover"
                    />
                  ) : hasVideo ? (
                    <div className="flex aspect-[4/5] items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950">
                      <Video className="h-12 w-12 text-white/60" />
                    </div>
                  ) : (
                    <div className="flex aspect-[4/5] items-center justify-center bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400">
                      <ImageIcon className="h-12 w-12 text-white/60" />
                    </div>
                  )}
                  <div className="space-y-2 p-4">
                    {title ? <p className="text-sm font-semibold text-black/90">{title}</p> : null}
                    <p className="line-clamp-8 whitespace-pre-line text-sm text-black/80">
                      {adaptedPreview || 'Sua legenda aparecerá aqui...'}
                    </p>
                    {hashtags ? (
                      <p className="text-xs text-blue-600">{parseHashtags(hashtags).map((tag) => `#${tag}`).join(' ')}</p>
                    ) : null}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              Marque uma ou mais contas para ver o preview e definir os destinos.
            </div>
          )}

          <Card>
            <CardContent className="space-y-2 p-4 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Regras aplicadas por conta</p>
              <p>• O texto é adaptado/truncado conforme o limite de cada rede.</p>
              <p>• O resultado é registrado individualmente; uma falha não esconde os demais.</p>
              <p>• TikTok e YouTube exigem vídeo; Instagram exige imagem ou vídeo.</p>
              <p>• Facebook publica somente em Páginas, não em perfis pessoais.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
