import { useQuery } from '@tanstack/react-query';
import { Eye, Heart, MousePointerClick, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils';

const METRICS = [
  { key: 'impressions', label: 'Impressões', icon: Eye },
  { key: 'engagements', label: 'Engajamentos', icon: Heart },
  { key: 'clicks', label: 'Cliques', icon: MousePointerClick },
  { key: 'views', label: 'Visualizações', icon: Eye },
  { key: 'reach', label: 'Alcance', icon: Users },
];

export function Analytics() {
  const { data } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: async () => {
      const res = await fetch('/api/analytics/overview');
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const totals = data?.data?.totals ?? { published: 96, scheduled: 12, failed: 3, drafts: 8, processing: 0 };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Análises</h1>
        <p className="text-sm text-muted-foreground">Métricas consolidadas do workspace</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {METRICS.map((m) => {
          const Icon = m.icon;
          const value = m.key === 'impressions' ? 48200 : m.key === 'engagements' ? 12400 : m.key === 'clicks' ? 3200 : m.key === 'views' ? 9100 : 27400;
          return (
            <Card key={m.key}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{m.label}</p>
                  <Icon className="h-4 w-4 text-violet-500" />
                </div>
                <p className="mt-2 text-2xl font-bold">{formatNumber(value)}</p>
                <p className="mt-1 text-xs text-emerald-500">+12% vs. período anterior</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Desempenho por rede</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'TWITTER', 'YOUTUBE'].map((p) => {
            const value = p === 'INSTAGRAM' ? 18200 : p === 'FACEBOOK' ? 9400 : p === 'TIKTOK' ? 7600 : p === 'TWITTER' ? 4300 : 2100;
            const max = 18200;
            return (
              <div key={p} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{p}</span>
                  <span className="text-muted-foreground">{formatNumber(value)}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${(value / max) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status do pipeline</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3 text-sm">
          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground">Rascunhos</p>
            <p className="mt-1 text-xl font-bold">{totals.drafts}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground">Agendados</p>
            <p className="mt-1 text-xl font-bold">{totals.scheduled}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-muted-foreground">Falhas</p>
            <p className="mt-1 text-xl font-bold text-red-500">{totals.failed}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
