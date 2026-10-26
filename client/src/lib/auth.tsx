import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { get as apiGet, post as apiPost } from './api';
import { disconnectSocket } from './socket';

export type UserRole = 'ADMIN' | 'WAITER' | 'BILLER' | 'KITCHEN';
export interface User { id: string; name: string; email: string; role: UserRole; restaurantId: string; restaurant?: any; }
interface AuthCtx { user: User | null; loading: boolean; login: (email: string, password: string) => Promise<User>; logout: () => Promise<void>; refresh: () => Promise<void>; }

const roleDashboardPaths: Record<UserRole, string> = {
  ADMIN: '/admin',
  WAITER: '/waiter',
  BILLER: '/biller',
  KITCHEN: '/kitchen',
};

export function getDashboardPath(role?: UserRole | null): string {
  return role ? roleDashboardPaths[role] : '/login';
}

const Ctx = createContext<AuthCtx>({} as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const d = await apiGet('/auth/me');
      setUser(d.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const login = async (email: string, password: string): Promise<User> => {
    const d = await apiPost<{ user: User }>('/auth/login', { email, password });
    setUser(d.user);
    return d.user;
  };

  const logout = async () => {
    setUser(null);
    disconnectSocket();
    try {
      await apiPost('/auth/logout');
    } catch (error) {
      console.error('Server logout failed; the local session was cleared.', error);
    }
  };

  return <Ctx.Provider value={{ user, loading, login, logout, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }
