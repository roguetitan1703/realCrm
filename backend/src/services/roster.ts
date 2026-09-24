/**
 * THE ROSTER A NEW FIRM STARTS WITH — every login id and password, decided once.
 *
 * Onboarding used to decide these in two places. The console invented passwords
 * as it parsed a paste (`vinod123` — the first name and three digits, so every
 * seat's password was guessable from the team list), and provisionTenant filled
 * the blanks with the OWNER's password. Login ids were derived on the server
 * only, so nobody saw them until the handover — and the handover never listed
 * the team at all.
 *
 * Now the console asks this for a plan while the roster is being typed, shows
 * it, and sends it back; provisionTenant runs the same plan on what it receives.
 * A row that already carries a login id and password comes out unchanged, so
 * what the screen showed is what gets created.
 */
import { passwordIssue } from './auth.js';

/**
 * ONBOARDING ONLY: the handle and password a new firm's people are handed.
 * Vijay is `vijay` / `vijay@123`. A short name takes more digits to reach the
 * 8-character minimum (`raj@1234`). The Team screen's add, reassign and reset
 * keep their own generator — this rule was asked for the handover, nowhere else.
 * Guessable from the team list by design, so onboarding keeps
 * must_change_password on by default.
 */
function firstName(name: string): string {
  return String(name || '').trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '');
}
function onboardingPassword(name: string): string {
  const first = firstName(name) || 'user';
  let digits = '123';
  while (`${first}@${digits}`.length < 8) digits += String(digits.length + 1);
  return `${first}@${digits}`;
}

export interface RosterRow {
  name?: string;
  loginId?: string;
  email?: string;
  phone?: string;
  role?: string;
  password?: string;
}

export interface PlannedMember {
  name: string;
  loginId: string;
  email: string | null;
  phone: string | null;   // +91XXXXXXXXXX, the form every other writer stores
  role: 'agent' | 'manager';
  password: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A typed login id, reduced to what the sign-in lookup can match. */
export function cleanLoginId(raw: string): string {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

/** The login id a name gets at onboarding when nobody chose one: `vijay`. */
function loginIdFromName(name: string, fallback = 'agent'): string {
  return firstName(name).slice(0, 16) || fallback;
}

export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits ? `+91${digits.slice(-10)}` : null;
}

/** `base`, else `base2`, `base3`… — the first one not in `taken`. Claims it. */
function claim(base: string, taken: Set<string>): string {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}${n}`;
  taken.add(id);
  return id;
}

/**
 * Plan the owner and team. Pure — no database: a firm being onboarded has no
 * users yet, so the only collisions are inside this list.
 *
 * `issues` names every row that cannot be created as given. Provisioning
 * refuses while there are any, BEFORE the tenant row exists, so a bad roster
 * never leaves a half-made firm behind.
 */
export function planRoster(input: { ownerName?: string; ownerEmail?: string; ownerPassword?: string; team?: RosterRow[] }): {
  owner: { loginId: string; password: string };
  team: PlannedMember[];
  issues: string[];
} {
  const taken = new Set<string>();
  const issues: string[] = [];

  const ownerPassword = String(input.ownerPassword || '').trim() || onboardingPassword(input.ownerName || 'owner');
  const ownerIssue = passwordIssue(ownerPassword);
  if (ownerIssue) issues.push(`Owner: ${ownerIssue}`);
  const owner = { loginId: claim(loginIdFromName(input.ownerName || '', 'owner'), taken), password: ownerPassword };

  const team: PlannedMember[] = [];
  for (const row of Array.isArray(input.team) ? input.team : []) {
    const name = String(row?.name || '').trim();
    if (!name) continue;
    const typed = cleanLoginId(row.loginId || '');
    if (typed && typed.length < 3) issues.push(`${name}: a user ID needs at least 3 characters.`);
    // A typed id that another row already holds is a mistake, not something to
    // quietly suffix — the person was told a specific id.
    if (typed && taken.has(typed)) issues.push(`${name}: user ID "${typed}" is used twice.`);
    const loginId = typed ? (taken.add(typed), typed) : claim(loginIdFromName(name), taken);

    const email = String(row.email || '').trim().toLowerCase() || null;
    if (email && !EMAIL_RE.test(email)) issues.push(`${name}: "${email}" is not an email.`);

    const password = String(row.password || '').trim() || onboardingPassword(name);
    const pwIssue = passwordIssue(password);
    if (pwIssue) issues.push(`${name}: ${pwIssue}`);

    team.push({
      name, loginId, email,
      phone: normalizePhone(row.phone),
      role: row.role === 'manager' ? 'manager' : 'agent',
      password,
    });
  }
  const ownerEmail = String(input.ownerEmail || '').trim().toLowerCase();
  const emails = [ownerEmail, ...team.map(t => t.email)].filter(Boolean);
  for (const e of new Set(emails)) {
    if (emails.filter(x => x === e).length > 1) issues.push(`${e} is on more than one person.`);
  }
  return { owner, team, issues };
}
