import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api, getApiError } from '@/lib/api';
import {
  POST_STATUS_META,
  canEditPost,
  postTitle,
  providerLabel,
  type PostRecord,
} from '@/lib/social';
import { formatDateTimeBR } from '@/lib/utils';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function CalendarView() {
  const navigate = useNavigate();
  const today = new Date();
  const [monthCursor, setMonthCursor] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );

  const postsQuery = useQuery({
    queryKey: ['posts', 'calendar'],
    queryFn: async () => {
      const response = await api.get('/posts', { params: { limit: 100 } });
      return (response.data?.data ?? response.data) as PostRecord[];
    },
  });

  const posts = postsQuery.data ?? [];
  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();

  const cells = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const result: Array<Date | null> = [];
    for (let i = 0; i < firstDay; i += 1) result.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      result.push(new Date(year, month, day));
    }
    return result;
  }, [month, year]);

  const postsByDay = useMemo(() => {
    const map = new Map<string, PostRecord[]>();
    for (const post of posts) {
      if (!post.publishAt) continue;
      const date = new Date(post.publishAt);
      if (Number.isNaN(date.getTime())) continue;
      const key = dateKey(date);
      const bucket = map.get(key) ?? [];
      bucket.push(post);
      map.set(key, bucket);
    }
    return map;
  }, [posts]);

  const upcoming = useMemo(
    () =>
      posts
        .filter(
          (post) =>
            post.status === 'SCHEDULED' &&
            post.publishAt &&
            new Date(post.publishAt).getTime() >= Date.now(),
        )
        .sort(
          (a, b) => new Date(a.publishAt!).getTime() - new Date(b.publishAt!).getTime(),
        )
        .slice(0, 10),
    [posts],
  );

  function changeMonth(offset: number) {
    setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function openPost(post: PostRecord) {
    if (canEditPost(post)) navigate(`/posts/${post.id}/edit`);
    else navigate('/posts');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calendário Editorial</h1>
          <p className="text-sm capitalize text-muted-foreground">
            {monthCursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => changeMonth(-1)} aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setMonthCursor(new Date(today.getFullYear(), today.getMonth(), 1))
            }
          >
            Hoje
          </Button>
          <Button variant="outline" size="icon" onClick={() => changeMonth(1)} aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => navigate('/posts/new')}>
            <Plus className="h-4 w-4" /> Agendar
          </Button>
        </div>
      </div>

      {postsQuery.error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {getApiError(postsQuery.error, 'Não foi possível carregar o calendário.')}
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="mb-4 grid grid-cols-7 gap-2">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="px-2 py-1 text-center text-xs font-semibold text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {cells.map((date, index) => {
              if (!date) {
                return <div key={`empty-${index}`} className="min-h-[110px] rounded-lg bg-muted/40" />;
              }
              const key = dateKey(date);
              const dayPosts = postsByDay.get(key) ?? [];
              const isToday = date.toDateString() === today.toDateString();
              return (
                <div
                  key={key}
                  className={`min-h-[110px] rounded-lg border p-2 transition-colors hover:border-primary/50 ${
                    isToday ? 'border-primary' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-semibold ${isToday ? 'text-primary' : ''}`}
                    >
                      {date.getDate()}
                    </span>
                    {dayPosts.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {dayPosts.length}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 space-y-1">
                    {dayPosts.slice(0, 2).map((post) => (
                      <button
                        key={post.id}
                        type="button"
                        onClick={() => openPost(post)}
                        className={`w-full rounded px-1.5 py-0.5 text-left text-[10px] font-medium ${
                          POST_STATUS_META[post.status]?.className || 'bg-muted'
                        }`}
                        title={postTitle(post)}
                      >
                        <span className="block truncate">{postTitle(post)}</span>
                        <span className="block truncate opacity-75">
                          {post.destinations.length
                            ? `${providerLabel(post.destinations[0]?.provider)}${
                                post.destinations.length > 1
                                  ? ` +${post.destinations.length - 1}`
                                  : ''
                              }`
                            : 'Sem destino'}
                        </span>
                      </button>
                    ))}
                    {dayPosts.length > 2 && (
                      <div className="px-1.5 text-[10px] text-muted-foreground">
                        +{dayPosts.length - 2} mais
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <CalendarDays className="h-4 w-4" /> Próximas publicações agendadas
          </h3>
          {postsQuery.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          )}
          {!postsQuery.isLoading && upcoming.length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Nenhuma publicação agendada. Crie uma publicação para ver os horários aqui.
            </p>
          )}
          <div className="space-y-3">
            {upcoming.map((post) => (
              <button
                key={post.id}
                type="button"
                onClick={() => openPost(post)}
                className="flex w-full flex-wrap items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40"
              >
                <Badge variant="outline" className={POST_STATUS_META[post.status]?.className}>
                  {POST_STATUS_META[post.status]?.label || post.status}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{postTitle(post)}</p>
                  <p className="text-xs text-muted-foreground">
                    {post.destinations.length
                      ? [...new Set(post.destinations.map((item) => item.provider))]
                          .map(providerLabel)
                          .join(', ')
                      : 'Sem destinos'}
                  </p>
                </div>
                <span className="text-sm text-muted-foreground">
                  {formatDateTimeBR(post.publishAt!)}
                </span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
