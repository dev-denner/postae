import { create } from 'zustand';

interface AppState {
  theme: 'dark' | 'light';
  sidebarOpen: boolean;
  posts: any[];
  accounts: any[];
  setTheme: (theme: 'dark' | 'light') => void;
  setSidebarOpen: (open: boolean) => void;
  setPosts: (posts: any[]) => void;
  setAccounts: (accounts: any[]) => void;
}

export const useAppStore = create<AppState>((set) => ({
  theme: 'dark',
  sidebarOpen: true,
  posts: [],
  accounts: [],
  setTheme: (theme) => set({ theme }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setPosts: (posts) => set({ posts }),
  setAccounts: (accounts) => set({ accounts }),
}));
