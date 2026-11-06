import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { Dashboard } from '@/components/dashboard/dashboard';
import { CreatePost } from '@/components/posts/create-post';
import { PostsList } from '@/components/posts/posts-list';
import { CalendarView } from '@/components/calendar/calendar';
import { MediaLibrary } from '@/components/media/media-library';
import { Analytics } from '@/components/analytics/analytics';
import { Accounts } from '@/components/accounts/accounts';
import { SettingsPage } from '@/components/settings/settings';
import { Login } from '@/components/auth/login';
import { useAppStore } from '@/store/app-store';
import { getAccessToken, type SessionUser } from '@/lib/session';

export default function App() {
  const theme = useAppStore((s) => s.theme);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const [authenticated, setAuthenticated] = useState(() => Boolean(getAccessToken()));
  const [, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  useEffect(() => {
    const handleLogout = () => setAuthenticated(false);
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  if (!authenticated) {
    return (
      <Login
        onSuccess={(user) => {
          setUser(user);
          setAuthenticated(true);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar open={sidebarOpen} />
      <div className="flex min-h-screen flex-1 flex-col lg:pl-60">
        <Topbar />
        <main className="flex-1 p-6">
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/posts/new" element={<CreatePost />} />
            <Route path="/posts/:id/edit" element={<CreatePost />} />
            <Route path="/posts" element={<PostsList />} />
            <Route path="/calendar" element={<CalendarView />} />
            <Route path="/media" element={<MediaLibrary />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
