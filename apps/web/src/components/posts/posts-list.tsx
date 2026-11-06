import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  AtSign,
  Ban,
  CalendarClock,
  CheckCircle2,
  Clock,
  Copy,
  Facebook,
  Instagram,
  Loader2,
  Music2,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  Twitter,
  Youtube,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { api, getApiError } from '@/lib/api';
import {
  DESTINATION_STATUS_META,
  POST_STATUS_META,
  canEditPost,
  postTitle,
  providerLabel,
  type PostRecord,
} from '@/lib/social';
import { formatDateTimeBR } from '@/lib/utils';

const PROVIDER_ICONS: Record<string, LucideIcon> = {
  INSTAGRAM: Instagram,
  FACEBOOK: Facebook,
  THREADS: AtSign,
  TWITTER: Twitter,
  TIKTOK: Music2,
  YOUTUBE: Youtube,
};

const FILTERS = [
  { key: 'ALL', label: 'Todos' },
  { key: 'DRAFT', label: 'Rascunhos' },
  { key: 'SCHEDULED', label: 'Agendados' },
  { key: 'PROCESSING', label: 'Processando' },
  { key: 'PUBLISHED', label: 'Publicados' },
  { key: 'PARTIAL', label: 'Parciais' },
  { key: 'FAILED', label: 'Falharam' },
  { key: 'CANCELLED', label: 'Cancelados' },
];

type Action = 'now' | 'retry' | 'cancel' | 'duplicate' | 'delete';

interface ActionResult {
  action: Action;
  post?: PostRecord;
}

function ProviderIcon({ provider, className }: { provider: string; className?: string }) {
  const Icon = PROVIDER_ICONS[provider] || Send;
  return <Icon className={className || 'h-4 w-4'} />;
}

function StatusBadge({ status }: { status: string }) {
  const meta = POST_STATUS_META[status] || POST_STATUS_META.DRAFT;
  return (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
    </Badge>
  );
}

function DestinationStatus({ status }: { status: string }) {
  const meta = DESTINATION_STATUS_META[status] || DESTINATION_STATUS_META.PENDING;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${meta.className}`}>
      {status === 'PUBLISHED' ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : status === 'FAILED' ? (
        <AlertTriangle className="h-3 w-3" />
      ) : status === 'PROCESSING' ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Clock className="h-3 w-3" />
      )}
      {meta.label}
    </span>
  );
}

export function PostsList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('ALL');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const postsQuery = useQuery({
    queryKey: ['posts', 'list'],
    queryFn: async () => {
      const response = await api.get('/posts', { params: { limit: 100 } });
      return (response.data?.data ?? response.data) as PostRecord[];
    },
    refetchInterval: (query) => {
      const posts = query.state.data as PostRecord[] | undefined;
      return posts?.some((post) => post.status === 'PROCESSING') ? 4000 : false;
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: Action }): Promise<ActionResult> => {
      if (action === 'now') {
        await api.post(`/posts/${id}/schedule-now`);
        return { action };
      }
      if (action === 'retry') {
        await api.post(`/posts/${id}/retry`);
        return { action };
      }
      if (action === 'cancel') {
        await api.post(`/posts/${id}/cancel`);
        return { action };
      }
      if (action === 'duplicate') {
        const response = await api.post(`/posts/${id}/duplicate`);
        return {
          action,
          post: (response.data?.data ?? response.data) as PostRecord,
        };
      }
      await api.delete(`/posts/${id}`);
      return { action };
    },
    onSuccess: async (result) => {
      if (result.action === 'duplicate' && result.post) {
        await queryClient.invalidateQueries({ queryKey: ['posts'] });
        navigate(`/posts/${result.post.id}/edit`);
        return;
      }
      const messages: Record<Action, string> = {
        now: 'Publicação iniciada. O resultado aparecerá individualmente por conta.',
        retry: 'Reprocessando somente as contas com falha.',
        cancel: 'Publicação cancelada. O histórico foi preservado.',
        duplicate: 'Publicação duplicada como rascunho.',
        delete: 'Publicação excluída.',
      };
      setNotice({ type: 'success', message: messages[result.action] });
      await queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
    onError: (error) => {
      setNotice({
        type: 'error',
        message: getApiError(error, 'Não foi possível concluir a ação.'),
      });
    },
  });

  const posts = postsQuery.data ?? [];
  const filtered = useMemo(
    () => (filter === 'ALL' ? posts : posts.filter((post) => post.status === filter)),
    [filter, posts],
  );

  function run(post: PostRecord, action: Action) {
    if (action === 'delete') {
      const confirmed = window.confirm('Excluir esta publicação? Esta ação não pode ser desfeita.');
      if (!confirmed) return;
    }
    if (action === 'cancel') {
      const confirmed = window.confirm(
        'Cancelar esta publicação? Os destinos ainda não publicados serão ignorados.',
      );
      if (!confirmed) return;
    }
    actionMutation.mutate({ id: post.id, action });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Publicações</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe o resultado individual por conta, inclusive em publicações parciais.
          </p>
        </div>
        <Button onClick={() => navigate('/posts/new')}>
          <Plus className="h-4 w-4" /> Nova publicação
        </Button>
      </div>

      {notice && (
        <div
          className={`rounded-xl border p-4 text-sm ${
            notice.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {notice.message}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Button
            key={item.key}
            size="sm"
            variant={filter === item.key ? 'default' : 'outline'}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
            {item.key !== 'ALL' && (
              <span className="ml-1 text-xs opacity-70">
                {posts.filter((post) => post.status === item.key).length}
              </span>
            )}
          </Button>
        ))}
      </div>

      {postsQuery.isLoading && (
        <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando publicações...
        </div>
      )}

      {postsQuery.error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {getApiError(postsQuery.error, 'Não foi possível carregar as publicações.')}
        </div>
      )}

      {!postsQuery.isLoading && !postsQuery.error && !posts.length && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <Send className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-semibold">Nenhuma publicação ainda</p>
              <p className="text-sm text-muted-foreground">
                Crie um post, selecione uma ou mais contas e acompanhe o resultado por destino.
              </p>
            </div>
            <Button onClick={() => navigate('/posts/new')}>Criar primeira publicação</Button>
          </CardContent>
        </Card>
      )}

      {!postsQuery.isLoading && !postsQuery.error && posts.length > 0 && !filtered.length && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhuma publicação com o filtro selecionado.
        </div>
      )}

      <div className="space-y-4">
        {filtered.map((post) => {
          const failedDestinations = post.destinations.filter(
            (destination) => destination.status === 'FAILED',
          );
          const pendingDestinations = post.destinations.filter(
            (destination) => destination.status === 'PENDING',
          );
          const busy = actionMutation.isPending;
          return (
            <Card key={post.id}>
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={post.status} />
                      {post.publishAt && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarClock className="h-3.5 w-3.5" />
                          {post.status === 'PUBLISHED' || post.status === 'PARTIAL'
                            ? `Publicado em ${formatDateTimeBR(post.publishedAt || post.publishAt)}`
                            : `Agendado para ${formatDateTimeBR(post.publishAt)}`}
                        </span>
                      )}
                      {!post.publishAt && (
                        <span className="text-xs text-muted-foreground">Sem agendamento</span>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-3 whitespace-pre-line font-medium">
                      {postTitle(post)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {post.destinations.map((destination) => (
                        <Badge
                          key={destination.id}
                          variant="secondary"
                          className="gap-1 font-normal"
                        >
                          <ProviderIcon provider={destination.provider} className="h-3 w-3" />
                          {destination.accountDisplayName}
                        </Badge>
                      ))}
                      {!post.destinations.length && (
                        <Badge variant="outline" className="text-muted-foreground">
                          Nenhum destino
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {canEditPost(post) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/posts/${post.id}/edit`)}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </Button>
                    )}
                    {failedDestinations.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => run(post, 'retry')}
                        disabled={busy}
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Reprocessar falhas
                      </Button>
                    )}
                    {['DRAFT', 'SCHEDULED', 'FAILED', 'CANCELLED'].includes(post.status) && (
                      <Button size="sm" onClick={() => run(post, 'now')} disabled={busy}>
                        <Send className="h-3.5 w-3.5" /> Publicar agora
                      </Button>
                    )}
                    {['DRAFT', 'SCHEDULED', 'FAILED'].includes(post.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => run(post, 'cancel')}
                        disabled={busy}
                      >
                        <Ban className="h-3.5 w-3.5" /> Cancelar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => run(post, 'duplicate')}
                      disabled={busy}
                    >
                      <Copy className="h-3.5 w-3.5" /> Duplicar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => run(post, 'delete')}
                      disabled={busy || post.status === 'PROCESSING'}
                      title="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  {post.destinations.map((destination) => {
                    const account = destination.socialAccount;
                    return (
                      <div
                        key={destination.id}
                        className="rounded-lg border bg-muted/20 p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <ProviderIcon provider={destination.provider} />
                          <span className="font-medium">
                            {destination.accountDisplayName || account?.displayName || 'Conta'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {providerLabel(destination.provider)}
                            {destination.accountUsername
                              ? ` · ${destination.accountUsername}`
                              : ''}
                          </span>
                          <span className="ml-auto">
                            <DestinationStatus status={destination.status} />
                          </span>
                        </div>
                        {destination.externalPostId && (
                          <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                            ID externo: {destination.externalPostId}
                          </p>
                        )}
                        {destination.error && (
                          <p className="mt-1 text-xs text-red-400">
                            <AlertTriangle className="mr-1 inline h-3 w-3" />
                            {destination.error}
                          </p>
                        )}
                        {destination.warning && (
                          <p className="mt-1 text-xs text-amber-400">
                            <AlertTriangle className="mr-1 inline h-3 w-3" />
                            {destination.warning}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {!post.destinations.length && post.failureReason && (
                    <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                      {post.failureReason}
                    </p>
                  )}
                  {post.failureReason && post.destinations.some((item) => item.status === 'FAILED') && (
                    <p className="text-xs text-muted-foreground">
                      Destinos com falha podem ser reprocessados sem republicar os que já tiveram
                      sucesso.
                    </p>
                  )}
                  {pendingDestinations.length > 0 && post.status === 'PROCESSING' && (
                    <p className="text-xs text-muted-foreground">
                      Aguardando processamento de {pendingDestinations.length} destino(s)...
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
