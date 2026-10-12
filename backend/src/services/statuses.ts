/**
 * The statuses that END a record's work. Here, not in store.ts, so the alert
 * lifecycle (alertLifecycle.ts) can ask "is this still open" without importing
 * the store — which imports notifications, which imports the lifecycle. One
 * list per record kind; store.ts re-exports them, so nothing else changes.
 *
 * Mirrors src/data/leadStatus.js and src/data/ownerStatus.js.
 */
export const TERMINAL_STATUSES = ['Deal Closed', 'Rejected'];
export const OWNER_TERMINAL_STATUSES = ['Not Interested', 'Do Not Call'];
/** Ends the calling walk without closing the record (see ownerStatus.js). */
export const OWNER_WALK_END = 'Key Received';
