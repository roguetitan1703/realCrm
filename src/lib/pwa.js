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
    // NO STORED FALLBACK. `crm_tenant_id` is one global key that any workspace
    // overwrites merely by being visited, so this answered with the last firm
    // opened rather than the one on screen — and it feeds the PWA identity, so
    // the wrong answer is the name and icon an install captures forever.
    // Matches api.js currentTenant(); the two must not drift.
    return new URLSearchParams(window.location.search).get('ws') || seg || '';
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
  const appleIcon = ensure('app-apple-icon', 'apple-touch-icon');
  appleIcon.setAttribute('sizes', '180x180');
  appleIcon.href = `/pwa/${s}/icon-180.png`;

  if (firmName) {
    let meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'apple-mobile-web-app-title';
      document.head.appendChild(meta);
    }
    meta.content = firmName;
    // Remember it for the NEXT cold load. index.html has to write this title
    // before the parser reaches the head, and on a first visit there is no
    // session yet to ask — so the answer has to already be on the device.
    try {
      // Per slug only. The global companion to this was read by index.html as
      // a fallback and captioned unseen workspaces with the last firm's name.
      localStorage.setItem(`crm_firm_name_${s}`, firmName);
    } catch (e) {}
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
  if (typeof navigator === 'undefined') return false;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return true;
  // An iPad on iPadOS 13+ reports itself as a Mac. It is still an iPad, it
  // still has no install API, and it still installs through the Share sheet —
  // so it has to answer yes here or it gets desktop instructions it cannot
  // follow. A real Mac has no touch points.
  return /Macintosh/i.test(navigator.userAgent) && (navigator.maxTouchPoints || 0) > 1;
}

/**
 * Where the person actually is, because on iOS that decides whether installing
 * is even possible.
 *
 * Add to Home Screen is a Safari feature. Open the same link inside WhatsApp,
 * Gmail, Instagram or LinkedIn — which is how an agent receives a link, every
 * time — and iOS renders it in an embedded web view whose Share sheet has no
 * "Add to Home Screen" row at all. Telling that person to "tap Share, then Add
 * to Home Screen" sends them looking for a button that is not there, and they
 * conclude the app is broken. So the guide has to know the difference and say
 * "open this in Safari first" instead.
 *
 * Returns { ios, inApp, browser, canPrompt, installed }.
 */
export function installEnv() {
  if (typeof navigator === 'undefined') return { ios: false, inApp: false, browser: 'browser', canPrompt: false, installed: false };
  const ua = navigator.userAgent || '';
  const ios = isIOS();

  // iOS browsers that are not Safari. Chrome and Edge do carry Add to Home
  // Screen (they hand it to the same iOS webclip machinery), Firefox and Opera
  // do not — they get the "open in Safari" route as well.
  const criOS = /CriOS/i.test(ua), edgiOS = /EdgiOS/i.test(ua);
  const fxiOS = /FxiOS/i.test(ua), opiOS = /OPiOS|OPT\//i.test(ua);

  // Embedded web views. Each of these is an app showing a page inside itself,
  // not a browser, and none of them can install anything.
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|LinkedInApp|Twitter|MicroMessenger|GSA\//i.test(ua)
    // iOS Safari's own UA always carries "Version/<n> Safari". A web view built
    // on WKWebView carries "Safari" without "Version/", which is the only
    // reliable tell for the in-app browsers that ship no name of their own.
    || (ios && !criOS && !edgiOS && !fxiOS && !opiOS && /Safari/i.test(ua) && !/Version\//i.test(ua));

  const browser = inApp ? 'inapp'
    : criOS ? 'chrome' : edgiOS ? 'edge' : fxiOS ? 'firefox' : opiOS ? 'opera'
    : ios ? 'safari' : 'browser';

  return {
    ios,
    inApp,
    browser,
    // Safari, Chrome-iOS and Edge-iOS reach the Add to Home Screen row.
    canAddToHome: ios && (browser === 'safari' || browser === 'chrome' || browser === 'edge'),
    canPrompt: canInstall(),
    installed: isStandalone(),
  };
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

// ── Home-screen icons ──────────────────────────────────────
// There is no client-side icon generator any more, and that is the fix rather
// than an omission.
//
// This file used to draw the icon on a <canvas> and POST it to the tenant, back
// when the server had no image library. The server has had resvg for a while
// and renders the firm's real uploaded logo on demand at /pwa/<slug>/icon-N.png
// — so the canvas was a second implementation of the same picture, and the two
// disagreed. The boot payload sends brand.logoUrl as the URL "/pwa/<slug>/logo"
// (store.ts rewrites it there, so a 76KB data URI is not re-sent on every load),
// but the canvas only accepted "data:" or "http" and fell through to its
// initials fallback on everything else. So every device that opened the app
// quietly uploaded INITIALS-ON-BRAND-COLOUR over the correctly rendered logo,
// and did not update pwa_config.signature — which is the only thing that would
// have invalidated it. That is the whole story behind the letters icon.
//
// One renderer now: the server. Nothing here to drift from it.
