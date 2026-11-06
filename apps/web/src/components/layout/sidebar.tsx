import { NavLink, useLocation } from 'react-router-dom';
import { CalendarDays, LayoutDashboard, Library, Megaphone, PenSquare, BarChart3, Settings, Plug2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/posts/new', label: 'Criar Post', icon: PenSquare, end: false },
  { to: '/calendar', label: 'Calendário', icon: CalendarDays, end: false },
  { to: '/posts', label: 'Publicações', icon: Megaphone, end: false },
  { to: '/media', label: 'Biblioteca', icon: Library, end: false },
  { to: '/analytics', label: 'Análises', icon: BarChart3, end: false },
  { to: '/accounts', label: 'Contas', icon: Plug2, end: false },
  { to: '/settings', label: 'Configurações', icon: Settings, end: false },
];

export function Sidebar({ open }: { open: boolean }) {
  const location = useLocation();
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r bg-card transition-transform duration-300 lg:static',
        open ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="flex h-16 items-center gap-2 px-6 border-b">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white">
          <Sparkles className="h-4 w-4" />
        </div>
        <span className="text-lg font-bold tracking-tight">Postaê</span>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
      <div className="p-4 border-t">
        <div className="rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-600/20 p-4 border">
          <p className="text-sm font-semibold">Plano Growth</p>
          <p className="text-xs text-muted-foreground mt-1">2 de 3 contas usadas</p>
        </div>
      </div>
    </aside>
  );
}
