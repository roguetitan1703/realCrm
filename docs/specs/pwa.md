# Spec: PWA & app-shell audit (Roadmap E3 + E4)

**Status:** 🔒 **LOCKED.** One-app confirmed; **one big overhaul** (it's really
behind), not a phased patch. This is the audit + rebuild plan.

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

## ANSWERS (locked)
6/7. **One app — confirmed** ("that will make us not miss things"): the mobile
   layout folds into the responsive website; no separate app.
8. **One big overhaul** — it's really behind, so a single rebuild pass (install
   identity + sticky shell + push device-test + full flow/screen reconciliation),
   not incremental patches.

---

## Build checklist (draft)
- [ ] `/{tenant}` serves tenant manifest (name) + tenant icon (logo/generated) — kill "RE" default on installed tenant apps.
- [ ] App-shell: sticky top + bottom bars; only content scrolls; audit every screen for the push-below bug.
- [ ] Web Push device test (install → subscribe → receive); fix whatever breaks.
- [ ] One-app: fold the mobile layout into the responsive app; retire divergent screens.
- [ ] Flow/screen audit vs latest website; reconcile options/screens.
- [ ] Re-verify offline read, install prompt, per-tenant icon after branding rework.
