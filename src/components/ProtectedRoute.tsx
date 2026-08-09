import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { supabase } from '@/lib/supabase';

/**
 * Dashboard gate. Unauthenticated visitors are signed out (clears stale
 * sessions) and sent to the home page — they must sign in again to open `/app`.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isReady } = useAuth();

  useEffect(() => {
    if (!isReady || user) return;
    void supabase.auth.signOut().catch(() => {
      // ignore — destination redirect still happens
    });
  }, [isReady, user]);

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
