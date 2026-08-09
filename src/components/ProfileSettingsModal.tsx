import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';
import { MIN_PASSWORD_LENGTH } from '@/auth/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ProfileSettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const inputClassName =
  'h-11 rounded-xl border-border/80 bg-background px-3.5 text-sm shadow-none placeholder:text-muted-foreground/70 focus-visible:border-foreground/30 focus-visible:ring-foreground/15';

export function ProfileSettingsModal({ open, onOpenChange }: ProfileSettingsModalProps) {
  const { user, updateProfile, updatePassword } = useAuth();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(user?.name ?? '');
    setPassword('');
    setConfirmPassword('');
  }, [open, user?.name]);

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

  const busy = savingProfile || savingPassword;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-[calc(100%-2rem)] border-border/80 bg-card p-0 sm:max-w-md sm:rounded-2xl">
        <DialogHeader className="space-y-2 border-b border-border/60 px-6 py-5 text-left">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Account
          </p>
          <DialogTitle className="font-display text-2xl font-normal tracking-tight">
            Profile settings
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            Update how you appear on the desk.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 px-6 py-5">
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

          <div className="h-px bg-border/70" />

          <form onSubmit={handleSavePassword} className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Change password</p>
              <p className="text-xs text-muted-foreground">
                Set a new password for this account.
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
        </div>

        <DialogFooter className="border-t border-border/60 px-6 py-4 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="rounded-full"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
