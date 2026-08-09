import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, type AuthMode } from '@/auth/AuthContext';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type AuthView = 'auth' | 'forgot';

/** Keeps the loading state visible long enough to feel deliberate, not flashy. */
const MIN_AUTH_MS = 1200;
/** Brief success beat before routing into the desk. */
const SUCCESS_HOLD_MS = 900;

const inputClassName =
  'h-11 rounded-xl border-border/80 bg-background px-3.5 text-sm shadow-none placeholder:text-muted-foreground/70 focus-visible:border-foreground/30 focus-visible:ring-foreground/15';

async function withMinDelay<T>(promise: Promise<T>, minMs = MIN_AUTH_MS): Promise<T> {
  const started = Date.now();
  const result = await promise;
  const remaining = minMs - (Date.now() - started);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
  return result;
}

export function AuthModal() {
  const {
    authOpen,
    authMode,
    closeAuth,
    setAuthMode,
    signIn,
    signUp,
    resetPassword,
  } = useAuth();
  const navigate = useNavigate();

  const [view, setView] = useState<AuthView>('auth');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!authOpen) {
      setView('auth');
      setPending(false);
      setSuccess(null);
      return;
    }
    setError(null);
    setInfo(null);
    setSuccess(null);
    setPassword('');
    setConfirmPassword('');
  }, [authOpen, authMode]);

  const handleModeChange = (value: string) => {
    if (pending || success) return;
    setAuthMode(value as AuthMode);
    setView('auth');
    setError(null);
    setInfo(null);
  };

  const handleClose = () => {
    if (pending || success) return;
    closeAuth();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending || success) return;

    setError(null);
    setInfo(null);
    setPending(true);

    try {
      if (view === 'forgot') {
        await withMinDelay(resetPassword(email));
        const message = 'Password reset email sent. Check your inbox for a link.';
        setInfo(message);
        toast.success(message);
        return;
      }

      if (authMode === 'signin') {
        await withMinDelay(signIn(email, password));
        setPending(false);
        setSuccess('Signed in — opening your desk…');
        toast.success('Signed in. Welcome back.');
        await new Promise((resolve) => setTimeout(resolve, SUCCESS_HOLD_MS));
        closeAuth();
        navigate('/app', { replace: true });
        return;
      }

      if (password !== confirmPassword) {
        throw new Error('Passwords do not match.');
      }

      const result = await withMinDelay(signUp(name, email, password));
      if (result.status === 'confirm_email') {
        const message =
          'Account created. Check your email for a confirmation link, then sign in.';
        setInfo(message);
        toast.success(message);
        setPassword('');
        setConfirmPassword('');
        return;
      }

      setPending(false);
      setSuccess('Account ready — opening your desk…');
      toast.success('Account created. Welcome to LURZ AI.');
      await new Promise((resolve) => setTimeout(resolve, SUCCESS_HOLD_MS));
      closeAuth();
      navigate('/app', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  };

  const isSignIn = authMode === 'signin';
  const isForgot = view === 'forgot';
  const busy = pending || Boolean(success);

  const title = success
    ? isSignIn
      ? 'You are in'
      : 'Welcome aboard'
    : isForgot
      ? 'Reset password'
      : isSignIn
        ? 'Welcome back'
        : 'Create account';

  const description = success
    ? 'Taking you to the LURZ desk.'
    : isForgot
      ? 'Enter your email and we’ll send a reset link.'
      : 'Unlock the desk — live markets and AI signals in one workspace.';

  const submitLabel = pending
    ? isForgot
      ? 'Sending reset link…'
      : isSignIn
        ? 'Signing you in…'
        : 'Creating your account…'
    : success
      ? 'Opening desk…'
      : isForgot
        ? 'Send reset link'
        : isSignIn
          ? 'Sign in'
          : 'Create account';

  return (
    <Dialog
      open={authOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent className="max-w-[calc(100%-2rem)] border-0 bg-transparent p-0 shadow-none sm:max-w-md sm:rounded-2xl [&>button]:right-5 [&>button]:top-5 [&>button]:z-10 [&>button]:rounded-full [&>button]:p-1.5 [&>button]:text-muted-foreground [&>button]:hover:bg-foreground/5 [&>button]:hover:text-foreground [&>button]:focus:ring-1 [&>button]:focus:ring-ring [&>button]:focus:ring-offset-0">
        <DialogTitle className="sr-only">
          {isForgot
            ? 'Reset your LURZ AI password'
            : isSignIn
              ? 'Sign in to LURZ AI'
              : 'Create your LURZ AI account'}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {isForgot
            ? 'Request a password reset email.'
            : 'Sign in to unlock your LURZ workspace.'}
        </DialogDescription>

        <Card className="w-full overflow-hidden rounded-2xl border-border/80 bg-card shadow-[0_24px_64px_-24px_oklch(0.12_0.01_60_/_0.35)] [--card-spacing:1.5rem] sm:[--card-spacing:1.75rem]">
          <CardHeader className="space-y-5 border-b-0 pb-0">
            <div className="space-y-3 pr-8">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                LURZ AI
              </p>
              <div className="space-y-2">
                <CardTitle className="font-display text-3xl font-normal tracking-tight text-foreground sm:text-[2rem]">
                  {title}
                </CardTitle>
                <CardDescription className="max-w-[32ch] text-sm leading-relaxed text-muted-foreground">
                  {description}
                </CardDescription>
              </div>
            </div>

            {!isForgot && !success && (
              <Tabs value={authMode} onValueChange={handleModeChange}>
                <TabsList className="grid h-11 w-full grid-cols-2 rounded-full border-border/70 bg-muted/80 p-1">
                  <TabsTrigger
                    value="signin"
                    disabled={busy}
                    className="rounded-full px-3 text-sm font-medium data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-none"
                  >
                    Sign in
                  </TabsTrigger>
                  <TabsTrigger
                    value="signup"
                    disabled={busy}
                    className="rounded-full px-3 text-sm font-medium data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-none"
                  >
                    Sign up
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </CardHeader>

          <CardContent className="pt-5">
            {success ? (
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{success}</p>
                  <p className="text-xs text-muted-foreground">This may take a moment.</p>
                </div>
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <form id="lurz-auth-form" onSubmit={handleSubmit} className="space-y-4">
                <fieldset disabled={busy} className="space-y-4 border-0 p-0">
                  {!isForgot && authMode === 'signup' && (
                    <div className="space-y-2">
                      <Label htmlFor="auth-name" className="text-xs font-medium text-foreground/80">
                        Name
                      </Label>
                      <Input
                        id="auth-name"
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        required
                        className={inputClassName}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="auth-email" className="text-xs font-medium text-foreground/80">
                      Email
                    </Label>
                    <Input
                      id="auth-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className={inputClassName}
                    />
                  </div>

                  {!isForgot && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label
                          htmlFor="auth-password"
                          className="text-xs font-medium text-foreground/80"
                        >
                          Password
                        </Label>
                        {isSignIn && (
                          <button
                            type="button"
                            className="text-xs font-medium text-muted-foreground underline decoration-foreground/20 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
                            onClick={() => {
                              setView('forgot');
                              setError(null);
                              setInfo(null);
                              setPassword('');
                            }}
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <Input
                        id="auth-password"
                        type="password"
                        autoComplete={isSignIn ? 'current-password' : 'new-password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                        minLength={MIN_PASSWORD_LENGTH}
                        required
                        className={inputClassName}
                      />
                    </div>
                  )}

                  {!isForgot && authMode === 'signup' && (
                    <div className="space-y-2">
                      <Label
                        htmlFor="auth-confirm"
                        className="text-xs font-medium text-foreground/80"
                      >
                        Confirm password
                      </Label>
                      <Input
                        id="auth-confirm"
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
                  )}
                </fieldset>

                {error && (
                  <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}

                {info && (
                  <p
                    className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm text-foreground"
                    role="status"
                  >
                    {info}
                  </p>
                )}
              </form>
            )}
          </CardContent>

          {!success && (
            <CardFooter className="mt-0 flex-col gap-4 border-t-0 pt-1 sm:flex-col">
              <Button
                type="submit"
                form="lurz-auth-form"
                className="h-12 w-full rounded-full bg-foreground text-base text-background hover:bg-foreground/90"
                disabled={busy}
              >
                {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
                {submitLabel}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                {isForgot ? (
                  <>
                    Remembered it?{' '}
                    <button
                      type="button"
                      disabled={busy}
                      className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 transition-colors hover:decoration-foreground disabled:opacity-50"
                      onClick={() => {
                        setView('auth');
                        setAuthMode('signin');
                        setError(null);
                        setInfo(null);
                      }}
                    >
                      Back to sign in
                    </button>
                  </>
                ) : isSignIn ? (
                  <>
                    New here?{' '}
                    <button
                      type="button"
                      disabled={busy}
                      className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 transition-colors hover:decoration-foreground disabled:opacity-50"
                      onClick={() => handleModeChange('signup')}
                    >
                      Create an account
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      disabled={busy}
                      className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 transition-colors hover:decoration-foreground disabled:opacity-50"
                      onClick={() => handleModeChange('signin')}
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </CardFooter>
          )}
        </Card>
      </DialogContent>
    </Dialog>
  );
}
