// A retry queue for field writes that were made with no signal.
//
// Scope is deliberately narrow. Only what an agent APPENDS from the field —
// a call log, a remark, a site visit — is queued, because that is work already
// done in the real world and losing it loses the firm the data it is paying
// for. Edits are NOT queued: two people editing the same listing offline and
// syncing later is a merge problem, and a CRM that silently guesses the winner
// is worse than one that says it couldn't save.
//
// It is also deliberately not comfortable. There is no offline read cache and
// no pretending: a queued write shows as queued until it lands.

const KEY = 'crm_outbox';
const listeners = new Set();

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* quota */ }
  // The LIST, not its length: "3 waiting to save" has to mean three of THIS
  // workspace's, and only the subscriber knows which workspace is on screen.
  listeners.forEach(fn => { try { fn(list); } catch (e) {} });
}

export function pendingCount() { return read().length; }

export function subscribeOutbox(fn) {
  listeners.add(fn);
  fn(read());
  return () => listeners.delete(fn);
}

/**
 * A QUEUED WRITE BELONGS TO THE WORKSPACE IT WAS MADE IN.
 *
 * The queue is one list for the whole browser, and replaying it sends each
 * entry through request(), which stamps the tenant of whatever workspace is
 * open AT REPLAY TIME. So a remark typed offline on a bhumi lead, flushed
 * after the agent had opened another workspace, went out under that other
 * firm's token. Every queueable endpoint is record-scoped
 * (/records/<id>/actions/...), so the server refuses it rather than writing it
 * to the wrong firm — but it refuses three times and the entry is then DROPPED
 * with a console warning nobody reads. The agent's note is simply gone, which
 * is the one thing an offline queue exists to prevent.
 *
 * Stamped on the way in and filtered on the way out. An entry for a workspace
 * that is not open waits rather than being spent against the wrong one.
 */
export function enqueue(entry, tenantId) {
  const list = read();
  list.push({
    ...entry, tenantId: tenantId || '',
    id: `q${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, at: Date.now(), tries: 0,
  });
  write(list);
}

/** How many are waiting for the workspace currently open. */
export function pendingCountFor(tenantId) {
  return read().filter(e => !e.tenantId || e.tenantId === tenantId).length;
}

let flushing = false;

/**
 * Replay the queue oldest-first. `send` is injected (api.js passes its own
 * request()) so this module has no import cycle with the client.
 *
 * Order matters: a remark that refers to a call must not land before it, so a
 * failure stops the run rather than skipping ahead.
 */
export async function flushOutbox(send, tenantId) {
  if (flushing) return;
  const list = read();
  if (!list.length) return;
  // Only this workspace's writes. Entries with no tenant were queued before
  // they were stamped and are sent as before rather than stranded forever.
  const mine = list.filter(e => !e.tenantId || e.tenantId === tenantId);
  if (!mine.length) return;
  const theirs = list.filter(e => !(!e.tenantId || e.tenantId === tenantId));
  flushing = true;
  try {
    const remaining = [...mine];
    while (remaining.length) {
      const item = remaining[0];
      try {
        await send(item.endpoint, item.options);
        remaining.shift();
        write([...theirs, ...remaining]);
      } catch (err) {
        // Still unreachable — stop and keep the queue. A server that ANSWERED
        // with an error is different: that write will never succeed on retry,
        // so drop it rather than jam the queue behind it forever.
        if (err instanceof TypeError) break;
        item.tries = (item.tries || 0) + 1;
        if (item.tries >= 3) {
          remaining.shift();
          console.warn('[Outbox] dropping a write the server keeps rejecting:', item.endpoint, err.message);
        }
        write([...theirs, ...remaining]);
        if (item.tries < 3) break;
      }
    }
  } finally {
    flushing = false;
  }
}
