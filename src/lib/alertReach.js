// Whether a person can be reached by alerts, as the server decides it
// (backend/src/services/push.ts deliveryReadiness → `reach`). One set of words,
// for the firm's Team screen and for Delpat's console.
export const REACH_LABEL = { on: 'On', blocked: 'Blocked', unsupported: 'Browser cannot', off: 'Off' }

// What one sign-in's browser last reported (sessions.push_state).
export const PUSH_STATE_LABEL = { on: 'On', off: 'Off', default: 'Not asked yet', denied: 'Blocked', unsupported: 'Browser cannot' }

/** "4 of 9 shown this week", or nothing when nothing was sent. */
export const shownLabel = (r) => (r?.alerts_7d > 0 ? `${r.alerts_shown_7d || 0} of ${r.alerts_7d} shown this week` : '')

/** Nothing sent reached a screen, or it cannot be reached at all. */
export const reachWarn = (r) => !!r && (r.reach !== 'on' || (r.alerts_7d > 0 && !r.alerts_shown_7d))
