/**
 * Every word a notification says. One module, because the text used to be
 * written at the call site and each call site invented its own: `lead_assigned`
 * had two titles, `lead_reassigned` had three, six types carried an emoji and
 * four did not, and salespeople were shown "SLA Warning: Untouched Lead".
 *
 * A call site passes a type and the facts. This turns them into words. The
 * icon comes from the type on the client (src/lib/notificationMeta.js), so no
 * glyph belongs in any string here.
 *
 * The rules, in full — see docs/specs/notifications.md:
 *   - Sentence case, no trailing full stop.
 *   - No emoji.
 *   - Title says what happened or what is needed; body says which record.
 *     The body never repeats the title.
 *   - The number goes in the title when the number is the point; the name goes
 *     in the body.
 *   - No system vocabulary: no "SLA", no "stale", no "escalation".
 *   - Plurals resolved here, once, not with `n === 1 ? '' : 's'` at nine sites.
 */

export type NotifCopy = { title: string; body?: string };

/** "2 leads" / "1 lead" — the only place this decision is made. */
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * An appointment instant as a person reads it, in the desk's own zone.
 * Formatting here rather than at the call site is the point of this module —
 * a "when" phrased at each site is how one fact ends up worded four ways.
 */
/** The firm's clock and words — a DeskConfig (store.ts deskConfigOf) fits. */
export type CopyDesk = { timezone: string; locale: { numberLocale: string } };
const INDIA_DESK: CopyDesk = { timezone: 'Asia/Kolkata', locale: { numberLocale: 'en-IN' } };

const whenLabel = (at: string | null | undefined, desk: CopyDesk) => {
  if (!at) return undefined;
  const d = new Date(at);
  if (isNaN(d.getTime())) return undefined;
  return d.toLocaleString(desk.locale.numberLocale, {
    timeZone: desk.timezone, weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit',
  });
};

/** Join the facts that are actually present. A body should never read "· ·". */
const facts = (...parts: (string | null | undefined | false)[]) =>
  parts.filter(Boolean).join(' · ') || undefined;

type Builders = Record<string, (d: any, desk: CopyDesk) => NotifCopy>;

export const COPY: Builders = {
  lead_assigned: (d) => ({
    title: 'Lead assigned to you',
    body: facts(d.name, d.locality, d.source && `via ${d.source}`),
  }),
  lead_assigned_bulk: (d) => ({
    title: `${plural(d.n, 'lead')} assigned to you`,
  }),
  lead_unrouted: (d) => ({
    title: 'Lead arrived unassigned',
    body: facts(d.name, d.source && `nobody is set to receive ${d.source}`),
  }),
  // MOVED, not assigned. This rendered the exact sentence `lead_assigned`
  // renders, so an agent could not tell a fresh enquiry -- where minutes decide
  // who wins it -- from a lead taken off a colleague who let it go quiet. Two
  // different jobs arriving under one line. Two meanings must not share a word.
  lead_reassigned: (d) => ({
    title: 'Lead moved to you',
    body: facts(d.name),
  }),
  // For a manager, not the agent who just got it. The count is the whole point
  // — "reassigned" alone reads like the routine hand-off it individually is.
  // `count` is set when one bulk move tripped this for several records at once
  // — a project handed over, a desk cleared. One alert for the batch (see
  // alertOnReassignLoop); saying "726 records" is the honest version of sending
  // 726 notifications.
  lead_reassign_loop: (d) => ({
    title: d.count ? `${d.count} leads passed around` : `Reassigned ${d.n} times`,
    body: d.count
      ? facts(`each moved ${d.n}+ times`, d.agent && `now with ${d.agent}`)
      : facts(d.name, d.agent && `now with ${d.agent}`),
  }),
  owner_reassign_loop: (d) => ({
    title: d.count ? `${d.count} owners passed around` : `Owner reassigned ${d.n} times`,
    body: d.count
      ? facts(`each moved ${d.n}+ times`, d.agent && `now with ${d.agent}`)
      : facts(d.name, d.agent && `now with ${d.agent}`),
  }),

  // Was "⚠️ SLA Warning: Untouched Lead". The agent is being told they have not
  // rung someone yet — which is what it now says.
  // F5. A person who has enquired BEFORE is not a new lead, and reading like
  // one is what made every repeat invisible — the desk saw "New lead captured"
  // for somebody an agent spoke to on Tuesday. One of these per SESSION; the
  // buyer who opened four listings in five minutes gets one, not four.
  lead_repeat: (d) => ({
    // NAMES THE STAGE IT CAME FROM, rather than calling everything rejected.
    // This read "Rejected lead enquired again" off a boolean, so a buyer whose
    // deal had CLOSED and who was asking about something else was announced as
    // a rejection.
    title: d.previousStage ? `Enquired again, reopened` : 'Enquired again',
    body: facts(d.name, d.source && `via ${d.source}`,
      d.previousStage && `was ${d.previousStage}`,
      d.changed > 0 && `${plural(d.changed, 'detail')} changed`),
  }),
  lead_untouched: (d) => ({
    title: `Not contacted for ${d.hours}h`,
    body: facts(d.name, 'assigned to you'),
  }),
  agreement_ending: (d) => ({
    title: `Rent agreement ends ${d.ends}`,
    body: facts(d.name, d.flat),
  }),
  followup_due: (d) => ({
    title: 'Follow-up due now',
    body: facts(d.name, d.action, d.locality),
  }),
  site_visit_reminder: (d) => ({
    title: 'Site visit due now',
    body: facts(d.name, d.when, d.locality),
  }),
  calendar_task_assigned: (d, desk) => ({
    title: d.isVisit ? 'Site visit assigned to you' : 'Task assigned to you',
    body: facts(d.name, whenLabel(d.at, desk) || d.when),
  }),
  remark_added: (d) => ({
    title: 'Note added',
    body: facts(d.name, d.author && `by ${d.author}`),
  }),

  owner_assigned: (d) => ({
    title: `${plural(d.n, 'owner')} assigned to you`,
  }),
  // Same fault, same fix: identical to `owner_assigned` in both branches.
  owner_reassigned: (d) =>
    d.n != null
      ? { title: `${plural(d.n, 'owner')} moved to you` }
      : { title: 'Owner moved to you', body: facts(d.name) },
};

/**
 * THE MORNING SUMMARY (spec §4): several alerts held overnight, or held for
 * the morning, reach the phone as ONE notification. Each type says its count
 * as a short phrase; the title is the total. Only alerts still open are in it,
 * so work done in the meantime is never announced.
 */
const PHRASE: Record<string, (n: number) => string> = {
  lead_assigned: (n) => `${plural(n, 'new lead')}`,
  lead_assigned_bulk: (n) => `${plural(n, 'batch', 'batches')} of leads`,
  lead_reassigned: (n) => `${plural(n, 'lead')} moved to you`,
  lead_unrouted: (n) => `${plural(n, 'lead')} with nobody on ${n === 1 ? 'it' : 'them'}`,
  lead_untouched: (n) => `${plural(n, 'lead')} still waiting`,
  lead_repeat: (n) => `${n} came back`,
  followup_due: (n) => `${plural(n, 'follow-up')} due`,
  site_visit_reminder: (n) => `${plural(n, 'site visit')}`,
  calendar_task_assigned: (n) => `${plural(n, 'booking')} made for you`,
  owner_assigned: (n) => `${plural(n, 'batch', 'batches')} of owners to call`,
  owner_reassigned: (n) => `${plural(n, 'batch', 'batches')} of owners moved to you`,
  agreement_ending: (n) => `${plural(n, 'tenancy', 'tenancies')} ending`,
  lead_reassign_loop: (n) => `${plural(n, 'lead')} keeps being handed on`,
  owner_reassign_loop: (n) => `${plural(n, 'owner')} keeps being handed on`,
};

export function summaryCopy(byType: Record<string, number>): NotifCopy {
  const total = Object.values(byType).reduce((a, b) => a + b, 0);
  const parts = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => (PHRASE[t] ? PHRASE[t](n) : null));
  return { title: `${plural(total, 'thing')} waiting for you`, body: facts(...parts) };
}

/**
 * Words for a type. Returns null for a type with no entry so the caller can
 * fall back to whatever it passed — a type added without copy still delivers
 * rather than sending an empty notification.
 */
export function copyFor(type: string, data: any, desk: CopyDesk = INDIA_DESK): NotifCopy | null {
  const build = COPY[type];
  if (!build) return null;
  try {
    const c = build(data || {}, desk);
    return c?.title ? c : null;
  } catch {
    return null;
  }
}
