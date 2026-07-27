// ============================================================================
// 📱 PWA glue — service worker, per-tenant manifest identity, install prompt
// ============================================================================
// The installed app wears the tenant's identity: when a workspace is selected
// we point <link rel="manifest"> (and the iOS touch icon) at that tenant's
// manifest, so an install captures the firm's name + icon. See PWA_PLAN.md.

export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // Only in production builds — a SW in `vite dev` would cache hashed modules and
  // fight HMR. Test the installable app with `vite preview` or the deploy.
  if (!import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) =>
      console.warn('[PWA] Service worker registration failed:', err?.message || err));
  });
}

/**
 * Point the app manifest + apple-touch-icon at a tenant (slug), or the platform
 * identity when slug is falsy. Safe to call repeatedly; creates the <link>
 * elements if the HTML didn't ship them.
 */
export function applyPwaIdentity(slug) {
  if (typeof document === 'undefined') return;
  const s = slug || '_platform';
  const ensure = (id, rel) => {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('link');
      el.rel = rel;
      el.id = id;
      document.head.appendChild(el);
    }
    return el;
  };
  ensure('app-manifest', 'manifest').href = `/pwa/${s}/manifest.webmanifest`;
  ensure('app-apple-icon', 'apple-touch-icon').href = `/pwa/${s}/icon-192.png`;
}

// ── Install prompt ─────────────────────────────────────────────────────────
// Android fires beforeinstallprompt (we defer it and show our own button). iOS
// has no such event — the UI shows an "Add to Home Screen" card instead.
let deferredPrompt = null;
const listeners = new Set();
function emit() { listeners.forEach((fn) => { try { fn(canInstall()) } catch (e) {} }); }

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    emit();
  });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; emit(); });
}

export function canInstall() { return !!deferredPrompt; }

export function onInstallAvailable(fn) {
  listeners.add(fn);
  fn(canInstall());
  return () => listeners.delete(fn);
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  emit();
  return choice?.outcome === 'accepted';
}

export function isIOS() {
  return typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// ── Home-screen icons ──────────────────────────────────────────────────────
// Chrome/Android uses a PNG for the installed icon (an SVG-only manifest gets a
// generic fallback). We render the icon on a canvas — initials on the brand
// color, full-bleed so it masks cleanly — and upload it once per tenant, so the
// manifest can serve real PNGs. No server-side image library needed.
function drawIcon(size, initials, bg, fg = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size); // full-bleed → Android applies its own mask
  ctx.fillStyle = fg;
  ctx.font = `700 ${Math.round(size * 0.42)}px "Space Grotesk", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((initials || 'RE').toUpperCase(), size / 2, size / 2 + size * 0.02);
  return c.toDataURL('image/png');
}

/** Generate + upload the tenant's PWA icons once (idempotent per device). */
export async function ensurePwaIcons({ slug, initials, color } = {}) {
  if (typeof document === 'undefined' || !slug || !initials) return;
  const key = `pwa_icons_${slug}`;
  try { if (localStorage.getItem(key)) return; } catch (e) {}
  try {
    const { api } = await import('./api.js');
    const bg = color || '#1E6F52';
    const icon192 = drawIcon(192, initials, bg);
    const icon512 = drawIcon(512, initials, bg);
    await api.uploadPwaIcons({ icon192, icon512 });
    try { localStorage.setItem(key, '1'); } catch (e) {}
    // Repoint the manifest so a subsequent install picks up the real PNGs.
    applyPwaIdentity(slug);
  } catch (e) {
    console.warn('[PWA] icon generation/upload failed:', e?.message || e);
  }
}
