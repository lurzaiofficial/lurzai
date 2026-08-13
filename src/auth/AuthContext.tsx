import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import {
  validateEmail,
  validatePassword,
  type AuthUser,
  type SignUpResult,
} from './types';

function isDashboardPath(pathname: string): boolean {
  return pathname === '/app' || pathname.startsWith('/app/');
}

function isAuthExemptPath(pathname: string): boolean {
  return pathname === '/reset-password';
}

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
  signUp: (name: string, email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateProfile: (name: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const LEGACY_USERS_KEY = 'lurz_auth_users_v1';
const LEGACY_SESSION_KEY = 'lurz_auth_session_v1';

function mapUser(user: User | null | undefined): AuthUser | null {
  if (!user?.email) return null;
  const meta = user.user_metadata ?? {};
  const name =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    user.email.split('@')[0] ||
    'Trader';
  return {
    id: user.id,
    email: user.email,
    name,
  };
}

function clearLegacyLocalAuth(): void {
  try {
    localStorage.removeItem(LEGACY_USERS_KEY);
    localStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    // ignore storage access errors
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  /** Blocks leave-dashboard logout during the sign-in → /app handoff. */
  const enteringDashboardRef = useRef(false);
  const signingOutRef = useRef(false);
  /** True only after the user has stably used `/app` — prevents refresh false-logouts. */
  const settledOnDeskRef = useRef(false);
  /** Previous path — logout only when leaving `/app`, not while logging in on `/`. */
  const previousPathRef = useRef(location.pathname);
  const initialSessionDoneRef = useRef(false);

  useEffect(() => {
    clearLegacyLocalAuth();

    let mounted = true;

    const applySession = (sessionUser: User | null | undefined) => {
      if (!mounted) return;
      setUser(mapUser(sessionUser));
      setIsReady(true);
      initialSessionDoneRef.current = true;
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Wait for the first real session resolution so a refresh never sees a
      // blank user and bounces /app → / (which used to trigger sign-out).
      if (!initialSessionDoneRef.current && event !== 'INITIAL_SESSION') {
        return;
      }

      if (event === 'SIGNED_OUT' && enteringDashboardRef.current) return;

      if (event === 'INITIAL_SESSION') {
        applySession(session?.user);
        return;
      }

      if (!initialSessionDoneRef.current) return;
      setUser(mapUser(session?.user));
      setIsReady(true);
    });

    // Fallback for clients that don't emit INITIAL_SESSION.
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted || initialSessionDoneRef.current) return;
      applySession(data.session?.user);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Mark the desk as settled only after we've been on /app with a user briefly.
  // Refresh remounts with settled=false, so bootstrap path noise can't auto sign-out.
  useEffect(() => {
    if (!isReady || !user || !isDashboardPath(location.pathname)) return;

    const timer = window.setTimeout(() => {
      settledOnDeskRef.current = true;
      enteringDashboardRef.current = false;
    }, 400);

    return () => window.clearTimeout(timer);
  }, [isReady, user, location.pathname]);

  // Sign out when the user intentionally leaves the dashboard after it settled.
  useEffect(() => {
    const previous = previousPathRef.current;
    previousPathRef.current = location.pathname;

    if (!isReady || !user) return;
    if (enteringDashboardRef.current) return;
    if (signingOutRef.current) return;
    if (isAuthExemptPath(location.pathname)) return;
    if (!settledOnDeskRef.current) return;

    const leftDashboard =
      isDashboardPath(previous) && !isDashboardPath(location.pathname);

    if (!leftDashboard) return;

    settledOnDeskRef.current = false;
    signingOutRef.current = true;
    void supabase.auth
      .signOut()
      .catch(() => {
        // Still clear local auth state if the network call fails.
      })
      .finally(() => {
        // Don't wipe a login that started while signOut was in flight.
        if (enteringDashboardRef.current) {
          signingOutRef.current = false;
          return;
        }
        setUser(null);
        setAuthOpen(false);
        signingOutRef.current = false;
        if (location.pathname !== '/') {
          navigate('/', { replace: true });
        }
      });
  }, [isReady, user, location.pathname, navigate]);

  // Deep-link / protected-route handoff: /?auth=signin|signup
  useEffect(() => {
    if (!isReady) return;
    const raw = searchParams.get('auth');
    if (raw !== 'signin' && raw !== 'signup') return;

    if (user) {
      enteringDashboardRef.current = true;
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
        enteringDashboardRef.current = true;
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

  /** Establishes session state; the auth modal handles the success pause + /app navigation. */
  const establishSession = useCallback(
    (nextUser: AuthUser) => {
      enteringDashboardRef.current = true;
      initialSessionDoneRef.current = true;
      setUser(nextUser);
      setIsReady(true);
      clearAuthParam();
    },
    [clearAuthParam],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const emailError = validateEmail(email);
      if (emailError) throw new Error(emailError);
      if (!password) throw new Error('Password is required.');

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) throw new Error(error.message);
      if (!data.session || !data.user) {
        throw new Error(
          'Sign in succeeded but no session was returned. Confirm your email if required.'
        );
      }

      const mapped = mapUser(data.user);
      if (!mapped) throw new Error('Could not load your account. Try again.');
      establishSession(mapped);
    },
    [establishSession],
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string): Promise<SignUpResult> => {
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error('Name is required.');

      const emailError = validateEmail(email);
      if (emailError) throw new Error(emailError);

      const passwordError = validatePassword(password);
      if (passwordError) throw new Error(passwordError);

      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            full_name: trimmedName,
            name: trimmedName,
          },
          emailRedirectTo: `${window.location.origin}/app`,
        },
      });

      if (error) throw new Error(error.message);

      const mapped = mapUser(data.user);
      // App-owned welcome mail via Resend (optional). Auth confirmation / reset
      // emails still come from Supabase (configure Custom SMTP → Resend for those).
      if (mapped) {
        void fetch('/api/email/welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: mapped.email,
            name: mapped.name,
            userId: mapped.id,
          }),
        }).catch(() => {
          // Non-blocking: signup must succeed even if email delivery fails.
        });
      }

      // When email confirmation is required, Supabase returns a user without a session.
      if (!data.session) {
        return { status: 'confirm_email' };
      }

      if (!mapped) throw new Error('Account created, but session is missing. Sign in to continue.');
      establishSession(mapped);
      return { status: 'signed_in' };
    },
    [establishSession],
  );

  const signOut = useCallback(async () => {
    signingOutRef.current = true;
    enteringDashboardRef.current = false;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error(error.message);
      setUser(null);
      setAuthOpen(false);
      navigate('/', { replace: true });
    } finally {
      signingOutRef.current = false;
    }
  }, [navigate]);

  const resetPassword = useCallback(async (email: string) => {
    const emailError = validateEmail(email);
    if (emailError) throw new Error(emailError);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) throw new Error(error.message);
  }, []);

  const updateProfile = useCallback(async (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('Name is required.');

    const { data, error } = await supabase.auth.updateUser({
      data: {
        full_name: trimmedName,
        name: trimmedName,
      },
    });

    if (error) throw new Error(error.message);
    setUser(mapUser(data.user));
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const passwordError = validatePassword(password);
    if (passwordError) throw new Error(passwordError);

    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(error.message);
  }, []);

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
      resetPassword,
      updateProfile,
      updatePassword,
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
      resetPassword,
      updateProfile,
      updatePassword,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
