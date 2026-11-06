import { LogOut, Search, Bell, Sun, Moon, Command } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAppStore } from '@/store/app-store';
import { useQueryClient } from '@tanstack/react-query';
import { getStoredUser } from '@/lib/session';
import { logout } from '@/lib/auth';

export function Topbar() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const queryClient = useQueryClient();
  const user = getStoredUser();
  const initials = (user?.name || user?.email || 'PA')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  async function handleLogout() {
    await logout();
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/80 px-6 backdrop-blur">
      <div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex">
        <Command className="h-4 w-4" />
        <span>Postaê</span>
      </div>
      <div className="relative max-w-md flex-1">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar publicações, contas, mídia..." className="pl-8" />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label="Alternar tema"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() => queryClient.invalidateQueries()}
          aria-label="Atualizar dados"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-fuchsia-500" />
        </Button>
        <div className="flex items-center gap-2 border-l pl-2">
          <Avatar>
            <AvatarFallback className="bg-violet-600 text-xs text-white">{initials}</AvatarFallback>
          </Avatar>
          <div className="hidden text-sm md:block">
            <p className="font-medium leading-none">{user?.name || 'Usuário'}</p>
            <p className="max-w-[180px] truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            title="Sair"
            aria-label="Sair"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
