/**
 * Lightweight local auth store.
 *
 * Demo-friendly email/password accounts in localStorage. Structured so a later
 * Supabase (or other) backend can replace these helpers without touching UI.
 */

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

type StoredUser = AuthUser & {
  passwordHash: string;
  createdAt: string;
};

const USERS_KEY = 'lurz_auth_users_v1';
const SESSION_KEY = 'lurz_auth_session_v1';

const MIN_PASSWORD_LENGTH = 8;

function readUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredUser[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

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

export function getSession(): AuthUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AuthUser;
    if (!session?.id || !session?.email) return null;
    return session;
  } catch {
    return null;
  }
}

function setSession(user: AuthUser): void {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ id: user.id, email: user.email, name: user.name }),
  );
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export async function signUp(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthUser> {
  const name = input.name.trim();
  if (!name) throw new Error('Name is required.');

  const emailError = validateEmail(input.email);
  if (emailError) throw new Error(emailError);

  const passwordError = validatePassword(input.password);
  if (passwordError) throw new Error(passwordError);

  const email = normalizeEmail(input.email);
  const users = readUsers();
  if (users.some((u) => u.email === email)) {
    throw new Error('An account with this email already exists.');
  }

  const user: StoredUser = {
    id: crypto.randomUUID(),
    email,
    name,
    passwordHash: await hashPassword(input.password),
    createdAt: new Date().toISOString(),
  };

  writeUsers([...users, user]);
  const session = { id: user.id, email: user.email, name: user.name };
  setSession(session);
  return session;
}

export async function signIn(input: {
  email: string;
  password: string;
}): Promise<AuthUser> {
  const emailError = validateEmail(input.email);
  if (emailError) throw new Error(emailError);

  if (!input.password) throw new Error('Password is required.');

  const email = normalizeEmail(input.email);
  const users = readUsers();
  const user = users.find((u) => u.email === email);
  if (!user) throw new Error('Invalid email or password.');

  const hash = await hashPassword(input.password);
  if (hash !== user.passwordHash) throw new Error('Invalid email or password.');

  const session = { id: user.id, email: user.email, name: user.name };
  setSession(session);
  return session;
}

export { MIN_PASSWORD_LENGTH };
