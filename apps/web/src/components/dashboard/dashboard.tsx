import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  FileText,
  Plug2,
  Plus,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, getApiError } from '@/lib/api';
import {
  POST_STATUS_META,
  postTitle,
  providerLabel,
  type PostRecord,
  type SocialAccount,
} from '@/lib/social';
import { formatDateTimeBR } from '@/lib/utils';

export function Dashboard() {
  const navigate = useNavigate();
  const postsQuery = useQuery({
    queryKey: ['posts', 'dashboard'],
    queryFn: async () => {
      const response = await api.get('/posts', { params: { limit: 100 } });
      return (response.data?.data ?? response.data) as PostRecord[];
    },
  });
  const accountsQuery = useQuery({
    queryKey: ['social', 'accounts'],
    queryFn: async () => {
      const response = await api.get('/social/accounts');
      return (response.data?.data ?? response.data) as SocialAccount[];
    },
  });

  const posts = postsQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];
  const now = new Date();
  const monthLabel = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const todayLabel = now.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const stats = useMemo(() => {
    const inCurrentMonth = (date?: string | null) => {
      if (!date) return false;
      const value = new Date(date);
      return value.getFullYear() === now.getFullYear() && value.getMonth() === now.getMonth();
    };
    return [
      {
        label: 'Agendadas',
        value: posts.filter((post) => post.status === 'SCHEDULED').length,
        icon: Clock,
        tone: 'text-sky-500',
        hint: 'aguardando horário',
      },
      {
        label: 'Publicadas no mês',
        value: posts.filter(
          (post) => post.status === 'PUBLISHED' && inCurrentMonth(post.publishedAt),
        ).length,
        icon: CheckCircle2,
        tone: 'text-emerald-500',
        hint: monthLabel,
      },
      {
        label: 'Falhas no mês',
        value: posts.filter(
          (post) => post.status === 'FAILED' && inCurrentMonth(post.publishAt || post.createdAt),
        ).length,
        icon: XCircle,
        tone: 'text-red-500',
        hint: 'reprocessáveis na lista',
      },
      {
        label: 'Rascunhos',
        value: posts.filter((post) => post.status === 'DRAFT').length,
        icon: FileText,
        tone: 'text-violet-500',
        hint: 'não publicados',
      },
    ];
  }, [monthLabel, now, posts]);

  const upcoming = useMemo(
    () =>
      posts
        .filter((post) => post.status === 'SCHEDULED' && post.publishAt)
        .sort(
          (a, b) => new Date(a.publishAt!).getTime() - new Date(b.publishAt!).getTime(),
        )
        .slice(0, 5),
    [posts],
  );

  const chart = useMemo(() => {
    const days = Array.from({ length: 14 }).map((_, index) => {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (13 - index));
      return {
        date,
        count: posts.filter((post) => {
          if (post.status !== 'PUBLISHED' || !post.publishedAt) return false;
          const published = new Date(post.publishedAt);
          return published.toDateString() === date.toDateString();
        }).length,
      };
    });
    const max = Math.max(1, ...days.map((day) => day.count));
    return { days, max };
  }, [now, posts]);

  const loading = postsQuery.isLoading || accountsQuery.isLoading;
  const queryError = postsQuery.error || accountsQuery.error;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm capitalize text-muted-foreground">{todayLabel}</p>
        </div>
        <Button onClick={() => navigate('/posts/new')}>
          <Plus className="h-4 w-4" /> Criar Publicação
        </Button>
      </div>

      {queryError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {getApiError(queryError, 'Não foi possível carregar o dashboard.')}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <Icon className={`h-4 w-4 ${stat.tone}`} />
                </div>
                <p className="mt-2 text-2xl font-bold">
                  {loading ? <span className="text-muted-foreground">—</span> : stat.value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Publicações concluídas — últimos 14 dias</CardTitle>
          </CardHeader>
          <CardContent>
            {chart.days.every((day) => day.count === 0) ? (
              <div className="flex h-56 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-8 w-8" />
                Nenhuma publicação concluída nos últimos 14 dias.
              </div>
            ) : (
              <div className="flex h-56 items-end gap-2">
                {chart.days.map((day) => (
                  <div
                    key={day.date.toISOString()}
                    className="flex flex-1 flex-col items-center gap-2"
                    title={`${day.count} publicação(ões) em ${day.date.toLocaleDateString('pt-BR')}`}
                  >
                    <div className="flex h-full w-full items-end">
                      <div
                        className="w-full rounded-t bg-gradient-to-t from-violet-600 to-fuchsia-400"
                        style={{ height: `${Math.max(2, (day.count / chart.max) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {day.date.getDate()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximas publicações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcoming.length === 0 && (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Nenhuma publicação agendada.
              </p>
            )}
            {upcoming.map((post) => (
              <button
                key={post.id}
                type="button"
                onClick={() => navigate(`/posts/${post.id}/edit`)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{postTitle(post)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTimeBR(post.publishAt ?? post.createdAt)}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={POST_STATUS_META[post.status]?.className}
                >
                  {POST_STATUS_META[post.status]?.label || post.status}
                </Badge>
              </button>
            ))}
            <Button
              variant="outline"
              className="w-full"
              size="sm"
              onClick={() => navigate('/calendar')}
            >
              <CalendarDays className="h-4 w-4" /> Ver calendário
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Contas conectadas</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate('/settings?tab=accounts')}>
            Gerenciar
          </Button>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              <Plug2 className="h-8 w-8" />
              <p>Nenhuma conta social conectada.</p>
              <Button size="sm" onClick={() => navigate('/settings?tab=accounts')}>
                Conectar conta
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {accounts.slice(0, 6).map((account) => (
                <div
                  key={account.id}
                  className="flex items-center gap-3 rounded-lg border p-4"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Plug2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{account.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {providerLabel(account.provider)}
                      {account.username ? ` · ${account.username}` : ''}
                    </p>
                  </div>
                  <Badge
                    className="ml-auto shrink-0"
                    variant="outline"
                    title={account.connectionState}
                  >
                    {account.canPublish ? 'Ativa' : 'Reconectar'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
