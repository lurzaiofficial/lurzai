import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
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

const inputClassName =
  'h-11 rounded-xl border-border/80 bg-background px-3.5 text-sm shadow-none placeholder:text-muted-foreground/70 focus-visible:border-foreground/30 focus-visible:ring-foreground/15';

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

  useEffect(() => {
    if (!authOpen) {
      setView('auth');
      return;
    }
    setError(null);
    setInfo(null);
    setPassword('');
    setConfirmPassword('');
  }, [authOpen, authMode]);

  const handleModeChange = (value: string) => {
    setAuthMode(value as AuthMode);
    setView('auth');
    setError(null);
    setInfo(null);
  };

  const handleClose = () => {
    if (pending) return;
    closeAuth();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setPending(true);
    try {
      if (view === 'forgot') {
        await resetPassword(email);
        const message = 'Password reset email sent. Check your inbox for a link.';
        setInfo(message);
        toast.success(message);
        return;
      }

      if (authMode === 'signin') {
        await signIn(email, password);
        toast.success('Signed in. Welcome back.');
        navigate('/app');
        return;
      }

      if (password !== confirmPassword) {
        throw new Error('Passwords do not match.');
      }

      const result = await signUp(name, email, password);
      if (result.status === 'confirm_email') {
        const message =
          'Account created. Check your email for a confirmation link, then sign in.';
        setInfo(message);
        toast.success(message);
        setPassword('');
        setConfirmPassword('');
        return;
      }

      toast.success('Account created. Welcome to LURZ AI.');
      navigate('/app');
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

  const title = isForgot
    ? 'Reset password'
    : isSignIn
      ? 'Welcome back'
      : 'Create account';

  const description = isForgot
    ? 'Enter your email and we’ll send a reset link.'
    : 'Unlock the desk — live markets and AI signals in one workspace.';

  const submitLabel = pending
    ? isForgot
      ? 'Sending…'
      : isSignIn
        ? 'Signing in…'
        : 'Creating account…'
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

            {!isForgot && (
              <Tabs value={authMode} onValueChange={handleModeChange}>
                <TabsList className="grid h-11 w-full grid-cols-2 rounded-full border-border/70 bg-muted/80 p-1">
                  <TabsTrigger
                    value="signin"
                    disabled={pending}
                    className="rounded-full px-3 text-sm font-medium data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-none"
                  >
                    Sign in
                  </TabsTrigger>
                  <TabsTrigger
                    value="signup"
                    disabled={pending}
                    className="rounded-full px-3 text-sm font-medium data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-none"
                  >
                    Sign up
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </CardHeader>

          <CardContent className="pt-5">
            <form id="lurz-auth-form" onSubmit={handleSubmit} className="space-y-4">
              <fieldset disabled={pending} className="space-y-4 border-0 p-0">
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
                      <Label htmlFor="auth-password" className="text-xs font-medium text-foreground/80">
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
                    <Label htmlFor="auth-confirm" className="text-xs font-medium text-foreground/80">
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
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}

              {info && (
                <p className="text-sm text-foreground" role="status">
                  {info}
                </p>
              )}
            </form>
          </CardContent>

          <CardFooter className="mt-0 flex-col gap-4 border-t-0 pt-1 sm:flex-col">
            <Button
              type="submit"
              form="lurz-auth-form"
              className="h-12 w-full rounded-full bg-foreground text-base text-background hover:bg-foreground/90"
              disabled={pending}
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
                    disabled={pending}
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
                    disabled={pending}
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
                    disabled={pending}
                    className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 transition-colors hover:decoration-foreground disabled:opacity-50"
                    onClick={() => handleModeChange('signin')}
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </CardFooter>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
