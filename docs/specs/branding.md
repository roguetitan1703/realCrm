# Spec: Branding & platform identity (Roadmap E5 + platform surfaces)

**Status:** 🔒 **LOCKED** (landing page parked; palette values designed at build).
Covers: the Delpat-vs-tenant identity split, derived multi-colour themes, the URL
model, org-select login, the very-quiet "Powered by Delpat" mark, and the
colour-bleed-on-logout bug.

---

## The positioning problem (why this keeps coming back)
We are a **white-label SaaS**: RealEstate **by Delpat**. Inside a tenant it should
feel like **the broker's own software** — their name, logo, colours dominate;
Delpat is a quiet "powered by". Today it **looks like Delpat's product** (our
branding + watermark too prominent), which contradicts the pitch. Fixing this
properly is E5.

## The two-identity rule  🔒 (principle)
Every surface wears exactly one identity:

| Surface | Identity |
|---------|----------|
| Landing page (`realestate.delpat.in`) | **Delpat** (platform) |
| Root login / "enter your organisation" | **Delpat** (no tenant chosen yet) |
| Superadmin console (`/admin`) | **Delpat** |
| System / error / not-found | **Delpat** |
| **Everything under `/{tenant}`** (login + whole app) | **TENANT** — name, logo, theme |
| Inside a tenant, Delpat shows only as | **one very quiet "Powered by Delpat"** mark, nothing else |

**Rule:** pre-tenant = Delpat; inside a tenant = the tenant, with Delpat reduced
to **a single very quiet mark and removed everywhere else**. Nothing
tenant-coloured may leak onto a Delpat surface, and vice-versa.

## Tenant theming = a derived **collection of colours**  🔒
A tenant's identity is a **full coordinated palette**, never a single raw hex
slapped on one variable (that's what kept breaking nav-active/contrast). Two ways
to set it, both producing a **complete, contrast-checked token set**:

**(a) Pick a starter theme** — I design **~6 coherent palettes** (Delpat-curated,
light/dark, validated). One tap.

**(b) Pick a custom seed colour → the palette is DERIVED by fixed rules.** The
picker is allowed, but a seed **never** gets applied blindly — it generates the
whole accent family under guaranteed-contrast rules:

- Fixed **neutral base stays** (charcoal chrome, linen surfaces) — only the accent
  family varies, so the app is always coherent.
- From the seed, derive + **contrast-clamp**:
  - `--accent` = seed, lightness-clamped so it can carry `--on-accent` text ≥ AA.
  - `--accent-rgb` = for alpha tints (nav-active etc.).
  - `--accent-ink` = seed darkened until ≥ 4.5:1 on `--bg` (accent text/links).
  - `--accent-wash` = seed ~90% → surface (faint fills).
  - `--accent-line` = seed ~72% → surface (soft borders).
  - `--on-accent` = white **or** near-black, whichever hits ≥ 4.5:1 on `--accent`
    (auto-fixes the on-accent foreground).
  - `--nav-active-bg` = `rgba(accent-rgb, .18)` on the dark chrome, contrast-checked.
- **Preset rules = contrast constraints + fixed mix ratios.** A seed that can't
  satisfy them (e.g. pure yellow) gets its **lightness clamped until it can** — so
  every derived palette is legible by construction. A validator runs at derive-time.
- Do the actual palette design + the derivation function with the **frontend-design
  skill** at build (this is a real colour-system task).

Implementation: `applyTheme(seedOrTheme)` computes the full token set and applies
it; themes are just pre-baked instances of the same derivation. → Q1 (I design the
starters), Q2 (picker allowed, always derived).

## Tenant identity = theme + logo + name
- **Logo** drives: sidebar mark, login, **PWA install icon**, and the **media
  watermark** (block C). Name drives titles + share signatures.
- All of it stored in `tenants.brand_config` (single source, already the model).

## The colour-bleed bug (fix)  🐛
Changing a tenant's theme then logging out leaves the **Delpat page in the
tenant's colour** — `applyTheme` sets CSS vars on `:root` globally and they
persist (plus the PWA `theme-color` meta and any cache). **Fix:** leaving a tenant
(logout / root / landing) **hard-resets to the Delpat platform theme** — clear all
tenant tokens, reset `theme-color`, and don't let a stale value survive. Platform
surfaces must always render Delpat, regardless of what was last viewed.

## URL model  🔒
- `realestate.delpat.in` → **landing** (Delpat).
- **`realestate.delpat.in/{tenant}`** → the tenant's workspace (login + app).
  Everything tenant lives under this path.
- **Kill the fake `app.{tenant}.com`** shown in the superadmin console — display
  the **real** `realestate.delpat.in/{tenant}`.
- Custom per-tenant domains (real `app.tenant.com`) = a *future* white-label
  upsell, **not now**. → Q4.

## Platform surfaces to build
- **Landing page** (`/`): simple, Delpat-branded, the pitch + **"Contact Delpat
  for onboarding"** (onboarding is manual/superadmin — no self-serve signup). → Q5.
- **Root login** (no tenant): "enter your organisation" → resolve → redirect to
  `/{tenant}`. Arriving directly at `/{tenant}` shows the **tenant-branded** login
  straight away (block A credentials). → Q6.

---

## ANSWERS (locked)
1. **I design the ~6 starter palettes** (frontend-design pass), you approve.
2. **Colour picker allowed — but always derives the full palette** by the rules
   above. Never a raw single value.
3. **Delpat = one very quiet mark**, and **removed everywhere else** inside a
   tenant. Minimal, single presence.
4. **All under `realestate.delpat.in/{tenant}`**; custom domains parked.
5. **Landing page parked** (later).
6. Root = "enter organisation"; `/{tenant}` = tenant-branded login. ✔

---

## Build checklist (draft)
- [ ] Palette **derivation function** (seed → full token family, contrast-clamped + validator) — frontend-design pass.
- [ ] **~6 starter themes** (designed instances) + **custom seed picker** that runs the derivation (never raw).
- [ ] `applyTheme(seedOrTheme)` sets the full token set; retire the single-`--accent`-only path.
- [ ] Hard-reset to Delpat theme on logout/leave-tenant (fix colour bleed); reset PWA theme-color.
- [ ] Two-identity guard: platform surfaces always Delpat; tenant surfaces always tenant.
- [ ] One very quiet "Powered by Delpat" mark; remove Delpat branding everywhere else in tenant.
- [ ] Root login "enter organisation" → `/{tenant}`; tenant-branded login at `/{tenant}`.
- [ ] Replace fake `app.{tenant}.com` with real `realestate.delpat.in/{tenant}` everywhere.
- [ ] Logo → sidebar + login + PWA icon + media watermark (single source brand_config).
- [ ] **Parked:** landing page (Delpat + contact-for-onboarding) — later.
