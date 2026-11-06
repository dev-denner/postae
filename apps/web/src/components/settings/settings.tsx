import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SocialAccountsManager } from '@/components/accounts/social-accounts-manager';
import { getStoredUser } from '@/lib/session';

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'workspace' ? 'workspace' : 'accounts';
  const user = getStoredUser();
  const [name, setName] = useState(user?.name || '');
  const [industry, setIndustry] = useState('');

  function changeTab(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value === 'accounts') next.delete('tab');
    else next.set('tab', value);
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie as contas sociais conectadas e as configurações do workspace.
        </p>
      </div>

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList>
          <TabsTrigger value="accounts">Contas sociais</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-4 pt-4">
          <SocialAccountsManager compact />
          <p className="text-xs text-muted-foreground">
            O retorno do OAuth volta para esta tela. As permissões e aprovações de cada rede
            aparecem no cartão da integração antes de conectar.
          </p>
        </TabsContent>

        <TabsContent value="workspace" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Conta do usuário</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nome</label>
                <Input value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">E-mail</label>
                <Input value={user?.email || ''} disabled />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Setor</label>
                <Input
                  value={industry}
                  onChange={(event) => setIndustry(event.target.value)}
                  placeholder="Moda, tecnologia, saúde..."
                />
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Edição ainda não conectada à API</Badge>
                <span className="text-xs text-muted-foreground">
                  Estes campos são apenas locais nesta versão.
                </span>
              </div>
              <Button disabled title="A edição de workspace ainda não foi implementada na API">
                Salvar alterações
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Segurança das integrações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Tokens de acesso e refresh são criptografados no banco e nunca são retornados ao
                frontend, gravados em logs ou incluídos nas respostas de erro.
              </p>
              <p>
                A conexão usa OAuth oficial de cada rede. Client IDs e secrets ficam somente no
                ambiente da API, nunca no navegador.
              </p>
              <p>
                Desconectar uma conta revoga/limpa os tokens, mas preserva o histórico de
                publicações e os resultados por conta.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
