// Per-device, per-person preferences. NOT firm settings — these never leave the
// device and never affect anyone else. The firm's defaults live in
// state.settings; this is the one agent saying "I write to my clients in
// Marathi" without changing what the desk sends.

const KEY = 'crm_prefs'

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch (e) { return {} }
}

export function getPref(key, fallback) {
  const v = read()[key]
  return v === undefined ? fallback : v
}

export function setPref(key, value) {
  try {
    const next = { ...read(), [key]: value }
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch (e) { /* private mode / quota — the fallback is the default, which is fine */ }
}
