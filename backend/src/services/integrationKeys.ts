/**
 * ============================================================================
 * 🔐 CONNECTION KEYS AT REST — how a portal's key is locked, and unlocked
 * ============================================================================
 * A connection's key is stored twice:
 *
 *   api_key_hash  a plain SHA-256, NO secret in it. Every incoming enquiry is
 *                 matched against this, so the portals' feeds depend on no
 *                 secret at all. That is why nothing below has ever broken a
 *                 feed, and why the hash is the ground truth for "is this the
 *                 key the portal actually sends".
 *   api_key_enc   the key itself, encrypted, so an owner can read it back to
 *                 send a portal. This is the half that broke.
 *
 * WHAT HAPPENED. The lock was `INGEST_KEY_SECRET || JWT_SECRET || built-in`,
 * resolved once, and INGEST_KEY_SECRET was never set. So the key lock was
 * silently THE LOGIN SECRET. Before August production had no JWT_SECRET at all
 * and both fell back to the built-in string; when a real JWT_SECRET went in,
 * logins moved to it — and so did the key lock, with no way left to open any
 * key written before. Bhumi's four portals (2–4 Aug) and every Delpat key
 * returned "predates key storage"; Mahalaxmi's, written after, opened fine.
 * Nothing about the keys had changed. Their lock had been replaced underneath
 * them by a change made for a different reason.
 *
 * THE RULES NOW:
 *
 *  1. The lock is JWT_SECRET — a deliberate choice, made knowing the coupling.
 *     So CHANGING JWT_SECRET IS ALSO A KEY OPERATION: put the old value in
 *     JWT_SECRET_PREVIOUS, restart, run scripts/integration-keys.ts --apply,
 *     then remove PREVIOUS. Skip that and every key goes unreadable again —
 *     the feeds keep working, the boot log says UNREADABLE, and nothing is lost
 *     for good as long as the old value still exists somewhere.
 *     (INGEST_KEY_SECRET, if it is ever set, takes over as the lock and ends
 *     the coupling. It is optional and unset today.)
 *  2. Opening tries EVERY secret a key could have been locked with — the lock,
 *     its PREVIOUS, the built-in — and a key only counts as opened if it hashes
 *     to the stored hash. A lock is never "guessed"; either the portal's own
 *     key comes out, or nothing does.
 *  3. Never lock with the built-in outside local development. It is published
 *     in this repository: a key under it is readable by anyone with the database.
 *  4. Moving a key to the current lock is a deliberate step, never a side
 *     effect of reading one: see scripts/integration-keys.ts. It only runs
 *     where the machine provably holds the live server's lock.
 * ============================================================================
 */
import crypto from 'crypto';
import { appEnv } from './env';

/** The inbound lookup key. Deliberately secret-free — see the header. */
export const hashKey = (key: string) => crypto.createHash('sha256').update(String(key).trim()).digest('hex');

/** What production signed tokens AND locked keys with before it had a real
 *  JWT_SECRET. Published in this repository, so it protects nothing — kept
 *  only so keys written under it can still be opened and moved off it. */
const BUILT_IN = 'dev-only-change-me';

export type SecretLabel = 'INGEST_KEY_SECRET' | 'INGEST_KEY_SECRET_PREVIOUS' | 'JWT_SECRET' | 'JWT_SECRET_PREVIOUS' | 'built-in default';

type Slot = { label: SecretLabel; key: Buffer };

const derive = (s: string) => crypto.createHash('sha256').update(s).digest();

/**
 * Every secret a stored key could have been locked with.
 *
 * Read on each call, not once at import. The old lock was a module-level
 * constant, which is how a change to the environment could swap it out with
 * nothing in the code looking different.
 *
 * Two names holding the same value count once, under the first name, so a
 * report never says a key is "on JWT_SECRET" when it is equally on
 * INGEST_KEY_SECRET.
 */
function keyring(): Slot[] {
  const out: Slot[] = [];
  const add = (label: SecretLabel, v: string | undefined) => {
    if (!v) return;
    const key = derive(v);
    if (!out.some(s => s.key.equals(key))) out.push({ label, key });
  };
  add('INGEST_KEY_SECRET', process.env.INGEST_KEY_SECRET);
  add('INGEST_KEY_SECRET_PREVIOUS', process.env.INGEST_KEY_SECRET_PREVIOUS);
  add('JWT_SECRET', process.env.JWT_SECRET);
  add('JWT_SECRET_PREVIOUS', process.env.JWT_SECRET_PREVIOUS);
  add('built-in default', BUILT_IN);
  return out;
}

/** The lock new keys go under: INGEST_KEY_SECRET if set, else JWT_SECRET. Never
 *  a PREVIOUS, never the built-in off a laptop. */
export function currentLock(): SecretLabel {
  return lockSlot().label;
}

function lockSlot(): Slot {
  const ring = keyring();
  const slot = ring.find(s => s.label === 'INGEST_KEY_SECRET') || ring.find(s => s.label === 'JWT_SECRET');
  if (slot) return slot;
  // env.ts already refuses to boot production or development without a real
  // JWT_SECRET; this is the same refusal at the one place a key gets written,
  // for anything that reaches here without going through boot.
  if (appEnv() !== 'local') {
    throw new Error('No INGEST_KEY_SECRET or JWT_SECRET — refusing to lock a connection key with the built-in default.');
  }
  return ring.find(s => s.label === 'built-in default')!;
}

/** Lock a key for storage. AES-256-GCM; the format predates this module. */
export function lockKey(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', lockSlot().key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}

function openWith(blob: string, key: Buffer): string | null {
  const [v, iv, tag, data] = String(blob).split('.');
  if (v !== 'v1' || !iv || !tag || !data) return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  } catch {
    // GCM's tag makes a wrong secret fail here rather than produce garbage.
    return null;
  }
}

export type KeyState =
  | { status: 'current'; lock: SecretLabel; plain: string }      // opens, on the lock new keys use
  | { status: 'old-lock'; lock: SecretLabel; plain: string }     // opens, but on a lock that should be retired
  | { status: 'unreadable' }                                     // no secret this server holds opens it
  | { status: 'mismatch'; lock: SecretLabel }                    // opens, but is not the key portals send
  | { status: 'missing' };                                       // no stored copy at all

/**
 * Where one stored key stands. The only function that decides whether a key
 * may be shown: the boot check, the script and the reveal endpoint all read
 * this, so they cannot disagree about a key.
 */
export function keyState(row: { api_key_enc?: string | null; api_key_hash?: string | null }): KeyState {
  if (!row.api_key_enc) return { status: 'missing' };
  for (const slot of keyring()) {
    const plain = openWith(row.api_key_enc, slot.key);
    if (plain === null) continue;
    // Opened is not enough. Showing an owner a key the portals do not use —
    // however it came to be stored — gets it pasted into a portal and breaks
    // a live feed. Only the key that hashes to what the portals send counts.
    if (hashKey(plain) !== row.api_key_hash) return { status: 'mismatch', lock: slot.label };
    return slot.label === currentLock()
      ? { status: 'current', lock: slot.label, plain }
      : { status: 'old-lock', lock: slot.label, plain };
  }
  return { status: 'unreadable' };
}
