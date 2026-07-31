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
  listeners.forEach(fn => { try { fn(list.length); } catch (e) {} });
}

export function pendingCount() { return read().length; }

export function subscribeOutbox(fn) {
  listeners.add(fn);
  fn(pendingCount());
  return () => listeners.delete(fn);
}

export function enqueue(entry) {
  const list = read();
  list.push({ ...entry, id: `q${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, at: Date.now(), tries: 0 });
  write(list);
}

let flushing = false;

/**
 * Replay the queue oldest-first. `send` is injected (api.js passes its own
 * request()) so this module has no import cycle with the client.
 *
 * Order matters: a remark that refers to a call must not land before it, so a
 * failure stops the run rather than skipping ahead.
 */
export async function flushOutbox(send) {
  if (flushing) return;
  const list = read();
  if (!list.length) return;
  flushing = true;
  try {
    const remaining = [...list];
    while (remaining.length) {
      const item = remaining[0];
      try {
        await send(item.endpoint, item.options);
        remaining.shift();
        write(remaining);
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
        write(remaining);
        if (item.tries < 3) break;
      }
    }
  } finally {
    flushing = false;
  }
}
