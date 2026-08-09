/**
 * Persistence layer.
 *
 * A small durable JSON document store with in-memory indexes and atomic writes,
 * exposed through a repository-style API so it can be swapped for a real
 * database later without touching call sites.
 *
 * Holds only signals, tracked signals and settings — there are no orders or
 * positions, because this application never trades.
 */

import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger';
import type { ServerSettings, SignalRecord, TrackedSignal } from '../../shared/types';
import { DEFAULT_SERVER_SETTINGS } from '../../shared/types';

/**
 * Paths are resolved lazily rather than at module scope.
 *
 * ES module imports are hoisted, so a caller that sets `process.env.DATA_DIR`
 * at the top of its own file would otherwise be too late: this module would
 * already have captured the default. Reading on first use makes the override
 * work and keeps tests off the real datastore.
 */
function dataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), '.data');
}

function dbFile(): string {
  return path.join(dataDir(), 'tradepilot.json');
}

interface UsageDay {
  /** UTC calendar day key YYYY-MM-DD */
  dayKey: string;
  chatCount: number;
}

interface DbShape {
  version: number;
  settings: Record<string, ServerSettings>;
  signals: SignalRecord[];
  tracked: TrackedSignal[];
  usage: Record<string, UsageDay>;
}

const EMPTY_DB: DbShape = {
  version: 3,
  settings: {},
  signals: [],
  tracked: [],
  usage: {},
};

function utcDayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

class Store {
  private db: DbShape = structuredClone(EMPTY_DB);
  private writeQueued = false;
  private loaded = false;

  /** Secondary indexes, rebuilt on load and kept in sync on insert. */
  private idx = {
    signalsByUser: new Map<string, SignalRecord[]>(),
    signalsById: new Map<string, SignalRecord>(),
    trackedByUser: new Map<string, TrackedSignal[]>(),
    trackedById: new Map<string, TrackedSignal>(),
  };

  load(): void {
    if (this.loaded) return;
    const dir = dataDir();
    const file = dbFile();

    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(file)) {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as DbShape;
        this.db = { ...structuredClone(EMPTY_DB), ...parsed };
      }
    } catch (err) {
      // A corrupt file must not take the server down; start clean but keep a backup.
      logger.error('store: failed to load database, starting empty', err);
      try {
        if (fs.existsSync(file)) fs.renameSync(file, `${file}.corrupt.${Date.now()}`);
      } catch {
        /* best effort */
      }
      this.db = structuredClone(EMPTY_DB);
    }

    this.rebuildIndexes();
    this.loaded = true;
  }

  private rebuildIndexes(): void {
    this.idx.signalsByUser.clear();
    this.idx.signalsById.clear();
    this.idx.trackedByUser.clear();
    this.idx.trackedById.clear();

    for (const s of this.db.signals) {
      push(this.idx.signalsByUser, s.userId, s);
      this.idx.signalsById.set(s.id, s);
    }
    for (const t of this.db.tracked) {
      push(this.idx.trackedByUser, t.userId, t);
      this.idx.trackedById.set(t.id, t);
    }
  }

  /** Debounced atomic persist (write temp file, then rename). */
  private persist(): void {
    if (this.writeQueued) return;
    this.writeQueued = true;

    setTimeout(() => {
      this.writeQueued = false;
      try {
        const dir = dataDir();
        const file = dbFile();
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const tmp = `${file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(this.db), 'utf8');
        fs.renameSync(tmp, file);
      } catch (err) {
        logger.error('store: persist failed', err);
      }
    }, 150);
  }

  // ---------------------------------------------------------------- settings

  getSettings(userId: string): ServerSettings {
    this.load();
    return { ...DEFAULT_SERVER_SETTINGS, ...(this.db.settings[userId] || {}) };
  }

  saveSettings(userId: string, patch: Partial<ServerSettings>): ServerSettings {
    this.load();
    const next = { ...this.getSettings(userId), ...patch };
    this.db.settings[userId] = next;
    this.persist();
    return next;
  }

  // ----------------------------------------------------------------- signals

  insertSignal(signal: SignalRecord): SignalRecord {
    this.load();
    this.db.signals.push(signal);
    push(this.idx.signalsByUser, signal.userId, signal);
    this.idx.signalsById.set(signal.id, signal);

    // Bound growth: keep the most recent 500 signals per user.
    const all = this.idx.signalsByUser.get(signal.userId) || [];
    if (all.length > 500) {
      const cutoff = [...all].sort((a, b) => b.timestamp - a.timestamp).slice(500);
      const doomed = new Set(cutoff.map((s) => s.id));
      // Never discard a signal the user is actively tracking.
      const protectedIds = new Set(this.db.tracked.map((t) => t.signalId));
      this.db.signals = this.db.signals.filter(
        (s) => !doomed.has(s.id) || protectedIds.has(s.id)
      );
      this.rebuildIndexes();
    }

    this.persist();
    return signal;
  }

  getSignal(id: string): SignalRecord | null {
    this.load();
    return this.idx.signalsById.get(id) || null;
  }

  updateSignal(id: string, patch: Partial<SignalRecord>): SignalRecord | null {
    this.load();
    const found = this.idx.signalsById.get(id);
    if (!found) return null;
    Object.assign(found, patch);
    this.persist();
    return found;
  }

  listSignals(userId: string, limit = 100): SignalRecord[] {
    this.load();
    return [...(this.idx.signalsByUser.get(userId) || [])]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  listSignalsSince(userId: string, sinceMs: number): SignalRecord[] {
    return this.listSignals(userId, 1000).filter((s) => s.timestamp >= sinceMs);
  }

  // ----------------------------------------------------------------- tracked

  insertTracked(tracked: TrackedSignal): TrackedSignal {
    this.load();
    this.db.tracked.push(tracked);
    push(this.idx.trackedByUser, tracked.userId, tracked);
    this.idx.trackedById.set(tracked.id, tracked);
    this.persist();
    return tracked;
  }

  getTracked(id: string): TrackedSignal | null {
    this.load();
    return this.idx.trackedById.get(id) || null;
  }

  updateTracked(id: string, patch: Partial<TrackedSignal>): TrackedSignal | null {
    this.load();
    const found = this.idx.trackedById.get(id);
    if (!found) return null;
    Object.assign(found, patch);
    this.persist();
    return found;
  }

  listTracked(userId: string): TrackedSignal[] {
    this.load();
    return [...(this.idx.trackedByUser.get(userId) || [])].sort((a, b) => b.openedAt - a.openedAt);
  }

  listActiveTracked(userId: string): TrackedSignal[] {
    return this.listTracked(userId).filter((t) => t.status === 'ACTIVE');
  }

  // ------------------------------------------------------------------- usage

  getChatUsageToday(userId: string, now = Date.now()): number {
    this.load();
    if (!this.db.usage) this.db.usage = {};
    const row = this.db.usage[userId];
    if (!row || row.dayKey !== utcDayKey(now)) return 0;
    return row.chatCount;
  }

  incrementChatUsage(userId: string, now = Date.now()): number {
    this.load();
    if (!this.db.usage) this.db.usage = {};
    const dayKey = utcDayKey(now);
    const row = this.db.usage[userId];
    if (!row || row.dayKey !== dayKey) {
      this.db.usage[userId] = { dayKey, chatCount: 1 };
    } else {
      row.chatCount += 1;
    }
    this.persist();
    return this.db.usage[userId]!.chatCount;
  }
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

export const store = new Store();
