# Spec: PWA & app-shell audit (Roadmap E3 + E4)

**Status:** 🧭 planning — questions open. The PWA is currently weak and feels like
"another app". This is the audit + fix plan.

---

## The core principle — **one app, not two**  🔒
The installable PWA must **be the website, installed** — the same responsive app —
**not a separate, under-built mobile experience.** Maintaining a divergent "mobile
app" is the backlog trap the user called out ("develop 2 things at once"). One
codebase, responsive; install just wraps it. → Q7 (confirm the mobile field-tool
isn't meant to be a deliberately different UX).

## Concrete bugs to fix
1. **Install identity shows "RE", not the tenant.** An installed tenant app must
   show the **tenant's org name + their icon**, not the platform "RE" fallback.
   Root cause to confirm: the manifest/icon served at `/{tenant}` isn't the
   tenant's (or `applyPwaIdentity` didn't repoint before install, or it fell back
   to platform initials). Fix: `/{tenant}` serves a manifest with the tenant name
   + tenant icon (logo, or generated initials-on-theme), verified on real install.
2. **Sticky chrome broken.** Top bar and bottom bar are **not sticky**; some scroll
   pages **push them out of view**. Fix the app-shell layout so top + bottom bars
   are pinned and only the content region scrolls, on every screen.
3. **Notifications untested.** Web Push was wired but **never verified on a real
   device**. Needs an end-to-end device test (install → subscribe → receive) — and
   it can't be signed off until a push actually lands on a phone (E3).

## The broader audit (E4)
- **Reconcile mobile screens with the *latest* website** — the mobile/PWA screens
  and options drifted from the current web app. Walk **actual flows** (lead,
  property add, follow-up, share) and make the installed app match where the
  product actually is now.
- Offline read, install prompt, per-tenant icon regeneration on theme change —
  re-verify they still hold after the branding rework.

---

## OPEN QUESTIONS
7. **One-app confirm** — the PWA = the installable responsive website, and any
   separate/under-built mobile layout is folded into it (not a distinct app). Or
   is the mobile field-tool intentionally a different, simpler UX?
8. **Scope now vs audit later** — fix the **concrete bugs first** (tenant install
   identity, sticky bars, notifications device-test), then schedule the **full
   flow/screen audit** as a pass? Or one big PWA overhaul?

---

## Build checklist (draft)
- [ ] `/{tenant}` serves tenant manifest (name) + tenant icon (logo/generated) — kill "RE" default on installed tenant apps.
- [ ] App-shell: sticky top + bottom bars; only content scrolls; audit every screen for the push-below bug.
- [ ] Web Push device test (install → subscribe → receive); fix whatever breaks.
- [ ] One-app: fold the mobile layout into the responsive app; retire divergent screens.
- [ ] Flow/screen audit vs latest website; reconcile options/screens.
- [ ] Re-verify offline read, install prompt, per-tenant icon after branding rework.
