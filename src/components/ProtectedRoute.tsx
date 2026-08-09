import { Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';

/**
 * Dashboard gate. Unauthenticated visitors go home after session restore.
 * Stale-session cleanup is handled by AuthContext when leaving `/app`.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isReady } = useAuth();

  // Keep the desk shell up during refresh until Supabase finishes restoring
  // the session — never bounce to home mid-restore.
  if (!isReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
        <p className="text-sm">Loading your desk…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/?auth=signin" replace />;
  }

  return <>{children}</>;
}
