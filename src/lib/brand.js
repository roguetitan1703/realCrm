// ============================================================================
// 🎨 Brand theming — apply a tenant's accent color to the live UI at runtime
// ============================================================================
// The desk ships with an ochre/green accent, but each firm picks its own color
// at onboarding. We drive the four accent CSS custom properties from that hex so
// the whole app (buttons, pills, meters, links) wears the firm's color without
// re-theming every component. Derived shades keep contrast sane on any hue.

const DEFAULT_ACCENT = '#1E6F52'

function clamp(n) { return Math.max(0, Math.min(255, Math.round(n))) }

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim())
  if (!m) return null
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('')
}

// Linear mix toward a target color; t=0 keeps c, t=1 is target.
function mix(c, target, t) {
  return { r: c.r + (target.r - c.r) * t, g: c.g + (target.g - c.g) * t, b: c.b + (target.b - c.b) * t }
}

const WHITE = { r: 255, g: 255, b: 255 }
const BLACK = { r: 0, g: 0, b: 0 }

/**
 * Point the app's accent tokens at `hex`. Falls back to the default accent for a
 * missing/invalid value, so a bad stored color can never blank the UI.
 */
export function applyBrandColor(hex) {
  if (typeof document === 'undefined') return
  const rgb = hexToRgb(hex) || hexToRgb(DEFAULT_ACCENT)
  const root = document.documentElement.style
  root.setProperty('--accent', rgbToHex(rgb))
  root.setProperty('--accent-rgb', `${clamp(rgb.r)},${clamp(rgb.g)},${clamp(rgb.b)}`) // for rgba() tints on dark chrome
  root.setProperty('--accent-ink', rgbToHex(mix(rgb, BLACK, 0.18)))   // darker text-on-light
  root.setProperty('--accent-wash', rgbToHex(mix(rgb, WHITE, 0.90)))  // faint fill
  root.setProperty('--accent-line', rgbToHex(mix(rgb, WHITE, 0.72)))  // soft border
  // Keep the browser UI (address bar, PWA theme) in step with the desk.
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', rgbToHex(rgb))
}

export { DEFAULT_ACCENT }
