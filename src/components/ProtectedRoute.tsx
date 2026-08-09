import { Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isReady } = useAuth();

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/?auth=signin" replace />;
  }

  return <>{children}</>;
}
