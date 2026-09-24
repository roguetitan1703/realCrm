/**
 * WHAT A FOLLOW-UP IS: its kind ("Site visit", "Call"), without the person.
 *
 * Until 25 Sep the schedule form stored `action` as "<kind> — <lead name>", so
 * anything that printed it said the person's name back to them beside their
 * own name. It now stores the kind alone; older rows still carry the name,
 * and this strips it. The browser's twin is followUpAction() in format.js.
 */
export function followUpKind(fu: any): string {
  const raw = String(fu?.action || '').trim();
  if (!raw) return 'Follow-up';
  return raw.split(/\s+—\s+/)[0].trim() || raw;
}
