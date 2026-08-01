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
 * Which tenant this document belongs to, read the same way the inline script in
 * index.html reads it so the two can never disagree: the first path segment
 * (`/acme-realty`), else an explicit `?ws=`, else the last workspace this
 * browser opened. Empty when there is no tenant in play yet.
 */
export function slugFromLocation() {
  if (typeof window === 'undefined') return '';
  try {
    let seg = decodeURIComponent(window.location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || '');
    if (seg === 'admin') seg = '';
    return new URLSearchParams(window.location.search).get('ws')
      || seg
      || window.localStorage?.getItem('crm_tenant_id')
      || '';
  } catch (e) { return ''; }
}

/**
 * Point the app manifest + apple-touch-icon at a tenant (slug), or the platform
 * identity when slug is falsy. Safe to call repeatedly; creates the <link>
 * elements if the HTML didn't ship them.
 *
 * Note this only matters for a browser that has not installed yet — an already
 * installed app keeps the identity captured at install time no matter what this
 * does later. index.html writes the correct link before first paint for that
 * reason; this keeps it in step when the workspace changes mid-session.
 */
export function applyPwaIdentity(slug, firmName) {
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
  
  if (firmName) {
    let meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'apple-mobile-web-app-title';
      document.head.appendChild(meta);
    }
    meta.content = firmName;
  }
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

// Installed or not. `standalone` is the common answer, but an app installed to
// the Windows/ChromeOS shell can report `minimal-ui` or `fullscreen`, and iOS
// answers on navigator.standalone instead of matchMedia at all. Reading only
// the first of those told an installed app it wasn't installed.
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  const m = (q) => window.matchMedia?.(q)?.matches === true;
  return m('(display-mode: standalone)') || m('(display-mode: fullscreen)')
    || m('(display-mode: minimal-ui)') || window.navigator.standalone === true;
}

// ── Home-screen icons ──────────────────────────────────────────────────────
// Chrome/Android uses a PNG for the installed icon (an SVG-only manifest gets a
// generic fallback). We render the icon on a canvas — initials on the brand
// color, full-bleed so it masks cleanly — and upload it once per tenant, so the
// manifest can serve real PNGs. No server-side image library needed.
function drawIcon(size, initials, bg, fg = '#ffffff', logoUrl = '') {
  return new Promise((resolve) => {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');

    if (logoUrl && (logoUrl.startsWith('data:image/') || logoUrl.startsWith('http'))) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        const pad = Math.round(size * 0.12);
        ctx.drawImage(img, pad, pad, size - pad * 2, size - pad * 2);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = fg;
        ctx.font = `700 ${Math.round(size * 0.42)}px "Space Grotesk", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((initials || 'RE').toUpperCase(), size / 2, size / 2 + size * 0.02);
        resolve(c.toDataURL('image/png'));
      };
      img.src = logoUrl;
      return;
    }

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = fg;
    ctx.font = `700 ${Math.round(size * 0.42)}px "Space Grotesk", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((initials || 'RE').toUpperCase(), size / 2, size / 2 + size * 0.02);
    resolve(c.toDataURL('image/png'));
  });
}

/** Generate + upload the tenant's PWA icons once (idempotent per device). */
export async function ensurePwaIcons({ slug, initials, color, logoUrl } = {}) {
  if (typeof document === 'undefined' || !slug || !initials) return;
  const key = `pwa_icons_${slug}_${initials}_${color || ''}_${logoUrl ? 'logo' : 'nologo'}`;
  try { if (localStorage.getItem(key)) return; } catch (e) {}
  try {
    const { api } = await import('./api.js');
    const bg = color || '#1E6F52';
    const icon192 = await drawIcon(192, initials, bg, '#ffffff', logoUrl);
    const icon512 = await drawIcon(512, initials, bg, '#ffffff', logoUrl);
    await api.uploadPwaIcons({ icon192, icon512 });
    try { localStorage.setItem(key, '1'); } catch (e) {}
    // Repoint the manifest so a subsequent install picks up the real PNGs.
    applyPwaIdentity(slug);
  } catch (e) {
    console.warn('[PWA] icon generation/upload failed:', e?.message || e);
  }
}
