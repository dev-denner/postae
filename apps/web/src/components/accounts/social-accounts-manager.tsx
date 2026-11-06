import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AtSign,
  CheckCircle2,
  ExternalLink,
  Facebook,
  Instagram,
  Loader2,
  Music2,
  Plug2,
  RefreshCw,
  ShieldAlert,
  Unplug,
  Youtube,
  type LucideIcon,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { api, getApiError } from '@/lib/api';
import {
  accountHandle,
  providerLabel,
  PROVIDER_ORDER,
  tokenExpiryLabel,
  type ProviderKey,
  type SocialAccount,
  type SocialProviderInfo,
} from '@/lib/social';
import { formatDateBR } from '@/lib/utils';

const PROVIDER_ICONS: Record<string, LucideIcon> = {
  INSTAGRAM: Instagram,
  FACEBOOK: Facebook,
  THREADS: AtSign,
  TWITTER: AtSign,
  TIKTOK: Music2,
  YOUTUBE: Youtube,
};

const REFRESHABLE_PROVIDERS = new Set(['INSTAGRAM', 'THREADS', 'TWITTER', 'TIKTOK', 'YOUTUBE']);

function connectionBadge(account: SocialAccount) {
  if (account.connectionState === 'CONNECTED') {
    return <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/15 text-emerald-500">Conectada</Badge>;
  }
  if (account.connectionState === 'REFRESH_REQUIRED') {
    return <Badge variant="outline" className="border-amber-500/30 bg-amber-500/15 text-amber-500">Renovação necessária</Badge>;
  }
  if (account.connectionState === 'DISCONNECTED') {
    return <Badge variant="outline" className="text-muted-foreground">Desconectada</Badge>;
  }
  return <Badge variant="outline" className="border-red-500/30 bg-red-500/15 text-red-400">Reconectar</Badge>;
}

function ProviderIcon({ provider, className }: { provider: string; className?: string }) {
  const Icon = PROVIDER_ICONS[provider] || Plug2;
  return <Icon className={className || 'h-5 w-5'} />;
}

export function SocialAccountsManager({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const providersQuery = useQuery({
    queryKey: ['social', 'providers'],
    queryFn: async () => {
      const response = await api.get('/social/providers');
      return (response.data?.data ?? response.data) as SocialProviderInfo[];
    },
  });

  const accountsQuery = useQuery({
    queryKey: ['social', 'accounts'],
    queryFn: async () => {
      const response = await api.get('/social/accounts');
      return (response.data?.data ?? response.data) as SocialAccount[];
    },
  });

  useEffect(() => {
    const social = searchParams.get('social');
    if (!social) return;
    const provider = searchParams.get('provider');
    const message = searchParams.get('message');
    const accounts = searchParams.get('accounts');
    if (social === 'connected') {
      setNotice({
        type: 'success',
        message: `${providerLabel(provider)} conectado com sucesso${accounts ? ` (${accounts} conta${Number(accounts) === 1 ? '' : 's'})` : ''}.`,
      });
    } else if (social === 'error') {
      setNotice({ type: 'error', message: message || 'Não foi possível conectar a conta.' });
    }
    const next = new URLSearchParams(searchParams);
    next.delete('social');
    next.delete('provider');
    next.delete('message');
    next.delete('accounts');
    setSearchParams(next, { replace: true });
    // Executa apenas quando o retorno do OAuth chega na URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectMutation = useMutation({
    mutationFn: async (provider: ProviderKey) => {
      const response = await api.post(`/social/accounts/${provider}/connect`, {
        returnTo: '/settings?tab=accounts',
      });
      const payload = response.data?.data ?? response.data;
      if (!payload?.authorizationUrl) {
        throw new Error('A API não retornou a URL de autorização.');
      }
      return payload.authorizationUrl as string;
    },
    onMutate: (provider) => {
      setConnecting(provider);
      setNotice(null);
    },
    onSuccess: (authorizationUrl) => {
      window.location.assign(authorizationUrl);
    },
    onError: (error) => {
      setNotice({ type: 'error', message: getApiError(error, 'Falha ao iniciar a conexão OAuth.') });
    },
    onSettled: () => setConnecting(null),
  });

  const refreshMutation = useMutation({
    mutationFn: async (accountId: string) => {
      await api.post(`/social/accounts/${accountId}/refresh`);
    },
    onSuccess: () => {
      setNotice({ type: 'success', message: 'Token renovado com sucesso.' });
      queryClient.invalidateQueries({ queryKey: ['social', 'accounts'] });
    },
    onError: (error) => {
      setNotice({ type: 'error', message: getApiError(error, 'Não foi possível renovar a conexão.') });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (accountId: string) => {
      await api.delete(`/social/accounts/${accountId}`);
    },
    onSuccess: () => {
      setNotice({ type: 'success', message: 'Conta desconectada. O histórico de publicações foi preservado.' });
      queryClient.invalidateQueries({ queryKey: ['social', 'accounts'] });
    },
    onError: (error) => {
      setNotice({ type: 'error', message: getApiError(error, 'Não foi possível desconectar a conta.') });
    },
  });

  const accounts = accountsQuery.data ?? [];
  const providers = providersQuery.data ?? [];
  const orderedProviders = useMemo(
    () => PROVIDER_ORDER.map((key) => providers.find((provider) => provider.key === key)).filter(Boolean) as SocialProviderInfo[],
    [providers],
  );
  const accountsByProvider = useMemo(() => {
    const map = new Map<string, SocialAccount[]>();
    for (const account of accounts) {
      const list = map.get(account.provider) ?? [];
      list.push(account);
      map.set(account.provider, list);
    }
    return map;
  }, [accounts]);

  async function disconnect(account: SocialAccount) {
    const confirmed = window.confirm(
      `Desconectar ${account.displayName} (${providerLabel(account.provider)})? O histórico será mantido, mas você não poderá publicar nesta conta até reconectá-la.`,
    );
    if (confirmed) disconnectMutation.mutate(account.id);
  }

  const loading = providersQuery.isLoading || accountsQuery.isLoading;
  const queryError = providersQuery.error || accountsQuery.error;

  return (
    <div className="space-y-6">
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

      {queryError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {getApiError(queryError, 'Não foi possível carregar as contas sociais.')}
        </div>
      )}

      {!compact && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Contas Conectadas</h1>
            <p className="text-sm text-muted-foreground">
              Conecte uma ou várias contas por rede. As credenciais ficam criptografadas no servidor.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plug2 className="h-4 w-4" /> Contas conectadas
            <Badge variant="secondary">{accounts.filter((account) => account.status !== 'DISCONNECTED').length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando contas...
            </div>
          )}
          {!loading && !accounts.length && (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhuma conta conectada. Escolha uma rede abaixo para iniciar o OAuth.
            </div>
          )}
          {accounts.map((account) => (
            <div key={account.id} className="flex flex-wrap items-center gap-4 rounded-xl border p-4">
              <Avatar className="h-11 w-11">
                {account.avatarUrl && <AvatarImage src={account.avatarUrl} alt={account.displayName} />}
                <AvatarFallback className="bg-muted">
                  <ProviderIcon provider={account.provider} />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-[180px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{account.displayName}</p>
                  {connectionBadge(account)}
                </div>
                <p className="text-sm text-muted-foreground">
                  {providerLabel(account.provider)}
                  {account.username ? ` · ${accountHandle(account)}` : ''}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {tokenExpiryLabel(account)}
                  {account.lastSyncedAt ? ` · sincronizada em ${formatDateBR(account.lastSyncedAt)}` : ''}
                </p>
                {account.lastError && (
                  <p className="mt-1 max-w-2xl text-xs text-amber-400">{account.lastError}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {account.needsReconnect ? (
                  <Button
                    size="sm"
                    onClick={() => connectMutation.mutate(account.provider)}
                    disabled={connectMutation.isPending}
                  >
                    <RefreshCw className="h-4 w-4" /> Reconectar
                  </Button>
                ) : (
                  REFRESHABLE_PROVIDERS.has(account.provider) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => refreshMutation.mutate(account.id)}
                      disabled={refreshMutation.isPending}
                      title="Renovar token agora"
                    >
                      <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
                      Renovar
                    </Button>
                  )
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => disconnect(account)}
                  disabled={disconnectMutation.isPending || account.status === 'DISCONNECTED'}
                  title="Desconectar conta"
                >
                  <Unplug className="h-4 w-4" /> Desconectar
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {orderedProviders.map((provider) => {
          const count = accountsByProvider.get(provider.key)?.length ?? 0;
          return (
            <Card key={provider.key}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                      <ProviderIcon provider={provider.key} />
                    </div>
                    <div>
                      <CardTitle className="text-base">{provider.label}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {count ? `${count} conta${count === 1 ? '' : 's'} conectada${count === 1 ? '' : 's'}` : 'Nenhuma conta conectada'}
                      </p>
                    </div>
                  </div>
                  {provider.configured ? (
                    <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                      <CheckCircle2 className="mr-1 h-3 w-3" /> Configurado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400">
                      <ShieldAlert className="mr-1 h-3 w-3" /> Faltam credenciais
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!provider.configured && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
                    Defina no ambiente da API: {provider.requiredEnv.join(', ')}.
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {provider.mediaSupport.text && <Badge variant="secondary">Texto</Badge>}
                  {provider.mediaSupport.image && <Badge variant="secondary">Imagem</Badge>}
                  {provider.mediaSupport.video && <Badge variant="secondary">Vídeo</Badge>}
                  {provider.mediaSupport.carousel && <Badge variant="secondary">Carrossel</Badge>}
                </div>

                <Button
                  className="w-full"
                  variant={count ? 'outline' : 'default'}
                  disabled={!provider.configured || connectMutation.isPending}
                  onClick={() => connectMutation.mutate(provider.key)}
                >
                  {connecting === provider.key ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Iniciando OAuth...</>
                  ) : (
                    <><Plug2 className="h-4 w-4" /> {count ? 'Adicionar outra conta' : 'Conectar conta'}</>
                  )}
                </Button>

                <details className="rounded-lg border p-3 text-xs">
                  <summary className="cursor-pointer font-medium text-muted-foreground">
                    Limitações e aprovação oficial
                  </summary>
                  <div className="mt-3 space-y-3">
                    <div>
                      <p className="font-medium text-foreground">Limitações atuais</p>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                        {provider.limitations.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Aprovações necessárias</p>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                        {provider.approvalNotes.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Escopos solicitados</p>
                      <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                        {provider.scopes.join(', ')}
                      </p>
                    </div>
                    <a
                      href={provider.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-violet-400 hover:underline"
                    >
                      Documentação oficial <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </details>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        OAuth usa o navegador e retorna para <span className="font-mono">/settings?tab=accounts</span>. Nenhum
        token de acesso é enviado ao frontend; a API só devolve nome, identificador público e status.
      </p>
    </div>
  );
}
