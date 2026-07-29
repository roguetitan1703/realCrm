# Spec: Branding & platform identity (Roadmap E5 + platform surfaces)

**Status:** 🧭 planning — questions open. The recurring one. Covers: the
Delpat-vs-tenant identity split, curated multi-colour themes, the URL model, the
landing + login surfaces, the "powered by Delpat" watermark, and the
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
| Inside a tenant, Delpat shows only as | a small **"Powered by Delpat"** mark |

**Rule:** pre-tenant = Delpat; inside a tenant = the tenant, with Delpat reduced
to a quiet footer mark. Nothing tenant-coloured may leak onto a Delpat surface,
and vice-versa.

## Tenant theming = a curated **collection of colours**, never a random hex  🔒
- A tenant's identity is a **theme = a coordinated palette** (primary, accent,
  surface, ink, wash, line, on-accent foreground, …), **not one colour**. This is
  why ad-hoc single-hex picking kept breaking things (nav-active, contrast).
- Tenants **pick from a set of designed themes** (each a full, contrast-checked
  palette in light/dark) + upload their **logo**. **No raw colour picker.**
- Implementation: `applyTheme(tokens)` sets the **whole token set** (extends
  today's single `--accent` into a full palette); themes are defined once,
  centrally, and validated. → Q1, Q2.

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

## OPEN QUESTIONS
1. **Curated themes** — I propose a starter set of **~6 designed palettes** (full
   multi-colour, light/dark, contrast-checked). Do you want to hand me the
   palettes/refs, or should I design the starter set and you approve?
2. Confirm: **no raw colour picker at all** — tenants choose a theme + upload a
   logo, full stop.
3. **Delpat presence inside a tenant** — a small "Powered by Delpat" in the login
   footer + sidebar base only? Or even quieter (legal/settings only)?
4. **URL** — everything under `realestate.delpat.in/{tenant}` for now; custom
   domains parked as a future upsell — agree?
5. **Landing page** — a simple one-pager (value prop + contact-for-onboarding) for
   v1? Any content/brand refs you'll provide, or I draft it?
6. **Login** — root = "enter organisation"; `/{tenant}` = tenant-branded login
   directly. Confirm this split.

---

## Build checklist (draft)
- [ ] `applyTheme(tokens)` — full palette token set; retire single-hex accent path.
- [ ] Curated theme registry (~6), light/dark, contrast-validated; picker = themes not colours.
- [ ] Hard-reset to Delpat theme on logout/leave-tenant (fix colour bleed); reset PWA theme-color.
- [ ] Two-identity guard: platform surfaces always Delpat; tenant surfaces always tenant.
- [ ] Landing page (Delpat + contact-for-onboarding).
- [ ] Root login "enter organisation" → `/{tenant}`; tenant-branded login at `/{tenant}`.
- [ ] Replace fake `app.{tenant}.com` with real `realestate.delpat.in/{tenant}` everywhere.
- [ ] "Powered by Delpat" mark placement per Q3.
- [ ] Logo → sidebar + login + PWA icon + media watermark (single source brand_config).
