import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Bell,
  Check,
  Copy,
  Loader2,
  Lock,
  LogOut,
  Moon,
  Shield,
  SlidersHorizontal,
  Sun,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';
import { MIN_PASSWORD_LENGTH } from '@/auth/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DEFAULT_PROFILE_PREFS,
  loadProfilePrefs,
  saveProfilePrefs,
  type ProfileLocalPrefs,
} from '@/lib/profilePrefs';
import type { ServerSettings, Timeframe } from '@/types';

type ProfileSettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  settings: ServerSettings;
  onSaveSettings: (patch: Partial<ServerSettings>) => Promise<void>;
};

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

const inputClassName =
  'h-11 rounded-xl border-border/80 bg-background px-3.5 text-sm shadow-none placeholder:text-muted-foreground/70 focus-visible:border-foreground/30 focus-visible:ring-foreground/15';

function getInitials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  if (parts[0] && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  if (parts[0]) return parts[0].toUpperCase();
  return email.slice(0, 2).toUpperCase() || '?';
}

export function ProfileSettingsModal({
  open,
  onOpenChange,
  theme,
  onToggleTheme,
  settings,
  onSaveSettings,
}: ProfileSettingsModalProps) {
  const { user, updateProfile, updatePassword, signOut } = useAuth();
  const [tab, setTab] = useState('profile');

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingDesk, setSavingDesk] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [copied, setCopied] = useState(false);

  const [defaultTimeframe, setDefaultTimeframe] = useState<Timeframe>(settings.defaultTimeframe);
  const [accountRiskPercent, setAccountRiskPercent] = useState(settings.accountRiskPercent);
  const [maxSignalsPerDay, setMaxSignalsPerDay] = useState(settings.maxSignalsPerDay);
  const [minRiskReward, setMinRiskReward] = useState(settings.minRiskReward);
  const [requireStopLoss, setRequireStopLoss] = useState(settings.requireStopLoss);
  const [localPrefs, setLocalPrefs] = useState<ProfileLocalPrefs>(DEFAULT_PROFILE_PREFS);

  useEffect(() => {
    if (!open) return;
    setName(user?.name ?? '');
    setPassword('');
    setConfirmPassword('');
    setDefaultTimeframe(settings.defaultTimeframe);
    setAccountRiskPercent(settings.accountRiskPercent);
    setMaxSignalsPerDay(settings.maxSignalsPerDay);
    setMinRiskReward(settings.minRiskReward);
    setRequireStopLoss(settings.requireStopLoss);
    setLocalPrefs(loadProfilePrefs());
    setTab('profile');
  }, [open, user?.name, settings]);

  const initials = useMemo(
    () => (user ? getInitials(name || user.name, user.email) : '?'),
    [name, user]
  );

  const busy = savingProfile || savingPassword || savingDesk || signingOut;

  const handleSaveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      await updateProfile(name);
      toast.success('Profile updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      await updatePassword(password);
      setPassword('');
      setConfirmPassword('');
      toast.success('Password updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSaveDesk = async (event: FormEvent) => {
    event.preventDefault();
    setSavingDesk(true);
    try {
      await onSaveSettings({
        defaultTimeframe,
        accountRiskPercent,
        maxSignalsPerDay,
        minRiskReward,
        requireStopLoss,
      });
      saveProfilePrefs(localPrefs);
      toast.success('Desk preferences saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save preferences.');
    } finally {
      setSavingDesk(false);
    }
  };

  const handleCopyId = async () => {
    if (!user?.id) return;
    try {
      await navigator.clipboard.writeText(user.id);
      setCopied(true);
      toast.success('User ID copied.');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy user ID.');
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      toast.success('Signed out.');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not sign out.');
      setSigningOut(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-[calc(100%-1.5rem)] overflow-hidden border-border/80 bg-card p-0 sm:max-w-xl sm:rounded-2xl">
        <DialogHeader className="space-y-3 border-b border-border/60 px-6 py-5 text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted text-sm font-semibold tracking-wide">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Account
              </p>
              <DialogTitle className="font-display text-2xl font-normal tracking-tight">
                Profile settings
              </DialogTitle>
              <DialogDescription className="truncate text-sm text-muted-foreground">
                {user?.email}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-col">
          <div className="border-b border-border/60 px-6 py-3">
            <TabsList className="grid h-auto w-full grid-cols-4 gap-1 p-1">
              <TabsTrigger value="profile" className="gap-1.5 px-2 py-2 text-[11px] sm:text-xs">
                <UserRound className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Profile</span>
              </TabsTrigger>
              <TabsTrigger value="preferences" className="gap-1.5 px-2 py-2 text-[11px] sm:text-xs">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Prefs</span>
              </TabsTrigger>
              <TabsTrigger value="risk" className="gap-1.5 px-2 py-2 text-[11px] sm:text-xs">
                <Shield className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Risk</span>
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-1.5 px-2 py-2 text-[11px] sm:text-xs">
                <Lock className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Security</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="max-h-[min(60vh,520px)] overflow-y-auto px-6 py-5">
            <TabsContent value="profile" className="mt-0 space-y-5">
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <fieldset disabled={busy} className="space-y-4 border-0 p-0">
                  <div className="space-y-2">
                    <Label htmlFor="profile-name" className="text-xs font-medium text-foreground/80">
                      Display name
                    </Label>
                    <Input
                      id="profile-name"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      required
                      className={inputClassName}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="profile-email" className="text-xs font-medium text-foreground/80">
                      Email
                    </Label>
                    <Input
                      id="profile-email"
                      type="email"
                      value={user?.email ?? ''}
                      readOnly
                      className={`${inputClassName} cursor-default text-muted-foreground`}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Email is managed by your sign-in provider and can’t be changed here.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-foreground/80">User ID</Label>
                    <div className="flex gap-2">
                      <Input
                        value={user?.id ?? ''}
                        readOnly
                        className={`${inputClassName} font-mono text-xs text-muted-foreground`}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-11 w-11 shrink-0 rounded-xl"
                        onClick={() => void handleCopyId()}
                        title="Copy user ID"
                      >
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </fieldset>

                <Button
                  type="submit"
                  disabled={busy}
                  className="h-11 w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
                >
                  {savingProfile && <Loader2 className="animate-spin" data-icon="inline-start" />}
                  {savingProfile ? 'Saving…' : 'Save profile'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="preferences" className="mt-0 space-y-5">
              <form onSubmit={handleSaveDesk} className="space-y-5">
                <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 px-4 py-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Appearance</p>
                    <p className="text-xs text-muted-foreground">
                      {theme === 'dark' ? 'Dark desk' : 'Light desk'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 gap-2 rounded-full"
                    onClick={onToggleTheme}
                  >
                    {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    {theme === 'dark' ? 'Light' : 'Dark'}
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-foreground/80">Default timeframe</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {TIMEFRAMES.map((tf) => (
                      <button
                        key={tf}
                        type="button"
                        disabled={busy}
                        onClick={() => setDefaultTimeframe(tf)}
                        className={`h-8 rounded-full px-3 font-mono text-xs transition-colors ${
                          defaultTimeframe === tf
                            ? 'bg-foreground text-background'
                            : 'border border-border bg-muted/40 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Used when you open the desk or start a new analysis window.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <Bell className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Signal emails</p>
                      <p className="text-xs text-muted-foreground">
                        Opt in to email alerts when signal notifications are enabled.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={localPrefs.emailSignals}
                    onCheckedChange={(checked) =>
                      setLocalPrefs((prev) => ({ ...prev, emailSignals: checked }))
                    }
                    disabled={busy}
                  />
                </div>

                <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 px-4 py-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Compact header</p>
                    <p className="text-xs text-muted-foreground">
                      Use a denser top bar on this device.
                    </p>
                  </div>
                  <Switch
                    checked={localPrefs.compactHeader}
                    onCheckedChange={(checked) =>
                      setLocalPrefs((prev) => ({ ...prev, compactHeader: checked }))
                    }
                    disabled={busy}
                  />
                </div>

                <Button
                  type="submit"
                  disabled={busy}
                  className="h-11 w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
                >
                  {savingDesk && <Loader2 className="animate-spin" data-icon="inline-start" />}
                  {savingDesk ? 'Saving…' : 'Save preferences'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="risk" className="mt-0 space-y-5">
              <form onSubmit={handleSaveDesk} className="space-y-5">
                <p className="text-sm text-muted-foreground">
                  These guide how LURZ scores setups for you. They never place trades.
                </p>

                <fieldset disabled={busy} className="space-y-4 border-0 p-0">
                  <div className="space-y-2">
                    <Label htmlFor="risk-percent" className="text-xs font-medium text-foreground/80">
                      Account risk per idea (%)
                    </Label>
                    <Input
                      id="risk-percent"
                      type="number"
                      min={0.1}
                      max={10}
                      step={0.1}
                      value={accountRiskPercent}
                      onChange={(e) => setAccountRiskPercent(Number(e.target.value) || 1)}
                      className={`${inputClassName} font-mono`}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="min-rr" className="text-xs font-medium text-foreground/80">
                      Minimum risk / reward
                    </Label>
                    <Input
                      id="min-rr"
                      type="number"
                      min={0.5}
                      max={10}
                      step={0.1}
                      value={minRiskReward}
                      onChange={(e) => setMinRiskReward(Number(e.target.value) || 1.5)}
                      className={`${inputClassName} font-mono`}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="max-signals" className="text-xs font-medium text-foreground/80">
                      Max signals per day
                    </Label>
                    <Input
                      id="max-signals"
                      type="number"
                      min={1}
                      max={settings.maxSignalsPerDay}
                      step={1}
                      value={maxSignalsPerDay}
                      onChange={(e) =>
                        setMaxSignalsPerDay(
                          Math.min(
                            Number(e.target.value) || 1,
                            settings.maxSignalsPerDay
                          )
                        )
                      }
                      className={`${inputClassName} font-mono`}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Free plan caps this at {settings.maxSignalsPerDay}/day. Pro & Max coming soon.
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 px-4 py-3">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Require stop-loss</p>
                      <p className="text-xs text-muted-foreground">
                        Prefer setups that include a clear invalidation level.
                      </p>
                    </div>
                    <Switch
                      checked={requireStopLoss}
                      onCheckedChange={setRequireStopLoss}
                      disabled={busy}
                    />
                  </div>
                </fieldset>

                <Button
                  type="submit"
                  disabled={busy}
                  className="h-11 w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
                >
                  {savingDesk && <Loader2 className="animate-spin" data-icon="inline-start" />}
                  {savingDesk ? 'Saving…' : 'Save risk settings'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="security" className="mt-0 space-y-6">
              <form onSubmit={handleSavePassword} className="space-y-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Change password</p>
                  <p className="text-xs text-muted-foreground">
                    Choose a strong password you don’t use elsewhere.
                  </p>
                </div>

                <fieldset disabled={busy} className="space-y-4 border-0 p-0">
                  <div className="space-y-2">
                    <Label htmlFor="profile-password" className="text-xs font-medium text-foreground/80">
                      New password
                    </Label>
                    <Input
                      id="profile-password"
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
                      htmlFor="profile-password-confirm"
                      className="text-xs font-medium text-foreground/80"
                    >
                      Confirm password
                    </Label>
                    <Input
                      id="profile-password-confirm"
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

                <Button
                  type="submit"
                  variant="outline"
                  disabled={busy}
                  className="h-11 w-full rounded-full border-border"
                >
                  {savingPassword && <Loader2 className="animate-spin" data-icon="inline-start" />}
                  {savingPassword ? 'Updating…' : 'Update password'}
                </Button>
              </form>

              <div className="h-px bg-border/70" />

              <div className="space-y-3 rounded-xl border border-border/70 px-4 py-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Sign out</p>
                  <p className="text-xs text-muted-foreground">
                    End this session on this device.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void handleSignOut()}
                  className="h-11 w-full gap-2 rounded-full border-rose-500/30 text-rose-600 hover:bg-rose-500/10"
                >
                  {signingOut ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </Button>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
