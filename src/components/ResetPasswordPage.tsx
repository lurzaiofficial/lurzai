import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';
import { MIN_PASSWORD_LENGTH } from '@/auth/types';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const inputClassName =
  'h-11 rounded-xl border-border/80 bg-background px-3.5 text-sm shadow-none placeholder:text-muted-foreground/70 focus-visible:border-foreground/30 focus-visible:ring-foreground/15';

export function ResetPasswordPage() {
  const { user, isReady, updatePassword, openAuth } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Reset password · LURZ AI';
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      const message = 'Passwords do not match.';
      setError(message);
      toast.error(message);
      return;
    }

    setPending(true);
    try {
      await updatePassword(password);
      toast.success('Password updated. You’re signed in.');
      navigate('/app', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update password.';
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_oklch(0.92_0.03_75/_0.9),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_oklch(0.88_0.04_55/_0.55),_transparent_45%)]"
      />
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
        <Card className="w-full overflow-hidden rounded-2xl border-border/80 bg-card shadow-[0_24px_64px_-24px_oklch(0.12_0.01_60_/_0.35)] [--card-spacing:1.5rem] sm:[--card-spacing:1.75rem]">
          <CardHeader className="space-y-3 border-b-0">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              LURZ AI
            </p>
            <CardTitle className="font-display text-3xl font-normal tracking-tight">
              Choose a new password
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed text-muted-foreground">
              {!isReady
                ? 'Checking your reset link…'
                : user
                  ? 'Enter a new password for your account.'
                  : 'This reset link is invalid or has expired.'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {!isReady ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : user ? (
              <form id="lurz-reset-form" onSubmit={handleSubmit} className="space-y-4">
                <fieldset disabled={pending} className="space-y-4 border-0 p-0">
                  <div className="space-y-2">
                    <Label htmlFor="reset-password" className="text-xs font-medium text-foreground/80">
                      New password
                    </Label>
                    <Input
                      id="reset-password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                      minLength={MIN_PASSWORD_LENGTH}
                      required
                      className={inputClassName}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="reset-password-confirm"
                      className="text-xs font-medium text-foreground/80"
                    >
                      Confirm password
                    </Label>
                    <Input
                      id="reset-password-confirm"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                      minLength={MIN_PASSWORD_LENGTH}
                      required
                      className={inputClassName}
                    />
                  </div>
                </fieldset>

                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                Request a fresh reset link from the sign-in screen, or return to the homepage.
              </p>
            )}
          </CardContent>

          <CardFooter className="mt-0 flex-col gap-3 border-t-0 pt-1">
            {isReady && user ? (
              <Button
                type="submit"
                form="lurz-reset-form"
                disabled={pending}
                className="h-12 w-full rounded-full bg-foreground text-base text-background hover:bg-foreground/90"
              >
                {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
                {pending ? 'Updating…' : 'Update password'}
              </Button>
            ) : isReady ? (
              <Button
                type="button"
                className="h-12 w-full rounded-full bg-foreground text-base text-background hover:bg-foreground/90"
                onClick={() => openAuth('signin')}
              >
                Back to sign in
              </Button>
            ) : null}

            <p className="text-center text-sm text-muted-foreground">
              <Link
                to="/"
                className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 transition-colors hover:decoration-foreground"
              >
                Home
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
