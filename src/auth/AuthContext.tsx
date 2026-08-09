import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  clearSession,
  getSession,
  signIn as storageSignIn,
  signUp as storageSignUp,
  type AuthUser,
} from './storage';

export type AuthMode = 'signin' | 'signup';

type AuthContextValue = {
  user: AuthUser | null;
  isReady: boolean;
  authOpen: boolean;
  authMode: AuthMode;
  openAuth: (mode?: AuthMode) => void;
  closeAuth: () => void;
  setAuthMode: (mode: AuthMode) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    setUser(getSession());
    setIsReady(true);
  }, []);

  // Deep-link / protected-route handoff: /?auth=signin|signup
  useEffect(() => {
    if (!isReady) return;
    const raw = searchParams.get('auth');
    if (raw !== 'signin' && raw !== 'signup') return;

    if (user) {
      navigate('/app', { replace: true });
      return;
    }

    setAuthMode(raw);
    setAuthOpen(true);
  }, [isReady, navigate, searchParams, user]);

  const clearAuthParam = useCallback(() => {
    if (!searchParams.has('auth')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('auth');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const syncAuthParam = useCallback(
    (mode: AuthMode) => {
      const next = new URLSearchParams(searchParams);
      next.set('auth', mode);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const openAuth = useCallback(
    (mode: AuthMode = 'signin') => {
      if (user) {
        navigate('/app');
        return;
      }
      setAuthMode(mode);
      setAuthOpen(true);
      syncAuthParam(mode);
    },
    [navigate, syncAuthParam, user],
  );

  const changeAuthMode = useCallback(
    (mode: AuthMode) => {
      setAuthMode(mode);
      if (authOpen) syncAuthParam(mode);
    },
    [authOpen, syncAuthParam],
  );

  const closeAuth = useCallback(() => {
    setAuthOpen(false);
    clearAuthParam();
  }, [clearAuthParam]);

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await storageSignIn({ email, password });
    setUser(session);
    setAuthOpen(false);
    clearAuthParam();
    navigate('/app');
  }, [clearAuthParam, navigate]);

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      const session = await storageSignUp({ name, email, password });
      setUser(session);
      setAuthOpen(false);
      clearAuthParam();
      navigate('/app');
    },
    [clearAuthParam, navigate],
  );

  const signOut = useCallback(() => {
    clearSession();
    setUser(null);
    navigate('/');
  }, [navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isReady,
      authOpen,
      authMode,
      openAuth,
      closeAuth,
      setAuthMode: changeAuthMode,
      signIn,
      signUp,
      signOut,
    }),
    [
      user,
      isReady,
      authOpen,
      authMode,
      openAuth,
      closeAuth,
      changeAuthMode,
      signIn,
      signUp,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
