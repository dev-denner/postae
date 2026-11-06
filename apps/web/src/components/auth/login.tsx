import { FormEvent, useState } from 'react';
import { LockKeyhole, Mail, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { login } from '@/lib/auth';
import { getApiError } from '@/lib/api';
import type { SessionUser } from '@/lib/session';

export function Login({ onSuccess }: { onSuccess: (user: SessionUser) => void }) {
  const [email, setEmail] = useState('demo@postae.io');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const user = await login(email.trim(), password);
      onSuccess(user);
    } catch (err) {
      setError(getApiError(err, 'E-mail ou senha inválidos.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.28),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(6,182,212,0.16),transparent_35%)] p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border bg-card shadow-lg">
            <Sparkles className="h-7 w-7 text-violet-400" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Postaê</h1>
          <p className="text-sm text-muted-foreground">
            Entre para gerenciar contas e publicar nas redes sociais.
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="email">
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    className="pl-8"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="password">
                  Senha
                </label>
                <div className="relative">
                  <LockKeyhole className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    className="pl-8"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </div>
              </div>

              {error && (
                <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Entrando...' : 'Entrar'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Ambiente de demonstração: <span className="font-mono">demo@postae.io</span> /{' '}
          <span className="font-mono">demo123456</span>. Troque as credenciais antes de produção.
        </p>
      </div>
    </div>
  );
}
