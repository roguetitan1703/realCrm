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
const whenLabel = (at?: string | null) => {
  if (!at) return undefined;
  const d = new Date(at);
  if (isNaN(d.getTime())) return undefined;
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit',
  });
};

/** Join the facts that are actually present. A body should never read "· ·". */
const facts = (...parts: (string | null | undefined | false)[]) =>
  parts.filter(Boolean).join(' · ') || undefined;

type Builders = Record<string, (d: any) => NotifCopy>;

export const COPY: Builders = {
  lead_assigned: (d) => ({
    title: 'Lead assigned to you',
    body: facts(d.name, d.locality, d.source && `via ${d.source}`),
  }),
  lead_assigned_bulk: (d) => ({
    title: `${plural(d.n, 'lead')} assigned to you`,
  }),
  lead_new: (d) => ({
    title: 'New lead captured',
    body: facts(d.name, d.locality, d.agent && `to ${d.agent}`),
  }),
  lead_unrouted: (d) => ({
    title: 'Lead arrived unassigned',
    body: facts(d.name, d.source && `nobody is set to receive ${d.source}`),
  }),
  lead_moved_away: (d) => ({
    title: `${plural(d.n, 'lead')} moved to another agent`,
  }),
  lead_reassigned: (d) => ({
    title: 'Lead assigned to you',
    body: facts(d.name),
  }),
  // For a manager, not the agent who just got it. The count is the whole point
  // — "reassigned" alone reads like the routine hand-off it individually is.
  lead_reassign_loop: (d) => ({
    title: `Reassigned ${d.n} times`,
    body: facts(d.name, d.agent && `now with ${d.agent}`),
  }),
  owner_reassign_loop: (d) => ({
    title: `Owner reassigned ${d.n} times`,
    body: facts(d.name, d.agent && `now with ${d.agent}`),
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
    title: d.previousStage ? `Reopened — enquired again` : 'Enquired again',
    body: facts(d.name, d.source && `via ${d.source}`,
      d.previousStage && `was ${d.previousStage}`,
      d.changed > 0 && `${plural(d.changed, 'detail')} changed`),
  }),
  // To the desk as well as the agent: a lead somebody closed has reopened on
  // its own, and the people who run the desk are told which and why. The stage
  // MOVED — this used to say "left rejected", which stopped being true on
  // 23 Aug when the client overrode the reason-based conditional.
  lead_repeat_rejected: (d) => ({
    title: 'Closed lead reopened',
    body: facts(d.name, d.source && `via ${d.source}`,
      d.previousStage && `was ${d.previousStage}`,
      d.reason && `rejected: ${d.reason}`),
  }),

  lead_untouched: (d) => ({
    title: `Not contacted for ${d.hours}h`,
    body: facts(d.name, 'assigned to you'),
  }),
  // Was "🚨 SLA Escalation". Same fact, different reader: a manager needs to
  // know whose it is, so the agent is named instead of "you".
  lead_untouched_escalated: (d) => ({
    title: `Not contacted for ${d.hours}h`,
    body: facts(d.name, d.agent && `with ${d.agent}`),
  }),
  // Retired with the No reply pile — nothing sends this any more. Kept because
  // rows already delivered still have to render in somebody's drawer.
  lead_retry_due: (d) => ({
    title: `No answer for ${plural(d.days, 'day')}`,
    body: facts(d.name, d.when && `last tried ${d.when}`),
  }),

  followup_set: (d) => ({
    title: 'Follow-up scheduled',
    body: facts(d.name, whenLabel(d.at) || d.when),
  }),
  followup_due: (d) => ({
    title: 'Follow-up due now',
    body: facts(d.name, d.action, d.locality),
  }),
  site_visit_reminder: (d) => ({
    title: 'Site visit due now',
    body: facts(d.name, d.when, d.locality),
  }),
  calendar_task_assigned: (d) => ({
    title: d.isVisit ? 'Site visit assigned to you' : 'Task assigned to you',
    body: facts(d.name, whenLabel(d.at) || d.when),
  }),
  remark_added: (d) => ({
    title: 'Note added',
    body: facts(d.name, d.author && `by ${d.author}`),
  }),

  owner_assigned: (d) => ({
    title: `${plural(d.n, 'owner')} assigned to you`,
  }),
  owner_reassigned: (d) =>
    d.n != null
      ? { title: `${plural(d.n, 'owner')} assigned to you` }
      : { title: 'Owner assigned to you', body: facts(d.name) },
};

/**
 * Words for a type. Returns null for a type with no entry so the caller can
 * fall back to whatever it passed — a type added without copy still delivers
 * rather than sending an empty notification.
 */
export function copyFor(type: string, data: any): NotifCopy | null {
  const build = COPY[type];
  if (!build) return null;
  try {
    const c = build(data || {});
    return c?.title ? c : null;
  } catch {
    return null;
  }
}
