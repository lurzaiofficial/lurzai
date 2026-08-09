export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

export type SignUpResult =
  | { status: 'signed_in' }
  | { status: 'confirm_email' };

export const MIN_PASSWORD_LENGTH = 8;

export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return 'Email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address.';
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Password is required.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}
