# Phone numbers

Status: proposed (20 Oct). Om, 20 Oct: "we should have a country code field so
we know exactly what the number is." This replaces matching on the last ten
digits, which made a UAE owner's number and an Indian one the same person.

## The rule

1. **Stored as exact E.164**: `+919876543210`, `+971501234567`. Never as typed.
2. **Two numbers are the same person only when the E.164 strings are equal.**
   No last-10, no digit stripping, no `right(…, 10)`.
3. **A number without a country code is read in the firm's country**
   (`crm_settings.default.locale.country`, India when unset). A number with
   one (`+`, `00`, or the country code written without `+`) keeps it.
4. **A number that cannot be read with confidence is never guessed and never
   matched.** It stays exactly as it was received. Nothing compares it,
   because every lookup goes in as E.164 and an unreadable string is never
   E.164. Screens flag it. There is no second column: "unreadable" is
   `readPhone(stored).ok === false`, computed the same way everywhere.

## One module

`src/lib/phone.js`, on `libphonenumber-js/max`, imported by the backend and
the bundle alike:

- `readPhone(raw, country)` → `{ ok, e164, country }`, or
  `{ ok: false, reason: 'empty' | 'letters' | 'invalid' }`
- `toE164`, `formatPhone` (national format in the firm's country,
  international otherwise), `waDigits`, `callingCode`

It uses the "max" metadata (full per-country patterns). "min" checks little
more than length, and accepted numbers max refuses. The cost is about 145 kB in
the bundle. It replaces:

- `phoneE164` (last ten digits behind the firm's code)
- `phoneAsStored`
- `normalizePhone` (roster)
- `parsePhone` (import)
- `storedPhone`
- the `waLink` digit cleaning
- every `replace(/\D/g…)` / `'[^0-9]'` / `right(…, 10)` used to compare numbers

## Input

`PhoneInput`: a country picker beside the number, defaulting to the firm's
country. Pasting `+971…` switches the picker. It is used by every form that
takes a phone:

- lead
- owner
- team member
- Your profile
- Settings reply-to
- the public catalogue form
- Add from tap
- the import column mapping (the country used for numbers without a code)

An invalid number is refused at input, with the reason ("Too short for
India"). The server re-reads every number and answers `422 phone_invalid` with
the same reason, so a script cannot store what the form would not.

## Ingestion, portals and CSV

These sources are read with the firm's country. Where a number can't be read,
the lead is still made (a buyer is not lost to a typo) and the raw value is
kept and flagged. It is never matched, so it never merges into another
person's lead.

## Matching: exact E.164 everywhere

- `findLeadByPhone` (repeat enquiries, dedupe on create)
- import dedupe
- owner match (properties ↔ owners)
- the team phone clash (users have a unique `(tenant_id, phone)` index)
- share lead-for-number and Add from tap
- catalogue enquiry, and its per-number limit

## The repair (one time)

- **How it runs:** `runOnce('phones_e164', …)` inside `initSchema`, per tenant,
  with that tenant's country.
- **What it converts:**
  - `users.phone`
  - `users.metadata.phone`
  - `crm_agents.metadata.phone`
  - `crm_leads.phone`
  - `crm_owners.phone`
  - `crm_properties.owner_phone`
  - `crm_agreements.party_phone`
  - `crm_settings` sharing `replyToPhone`
- **Writes only clean conversions.** Each write is conditional on the row
  still holding the value that was read. Unreadable rows are left untouched
  and logged per tenant.
- **Users are checked before anything is written.** If two user rows would
  become one number, the repair writes nothing at all and logs which ones;
  the unique index would otherwise stop the boot. The next boot tries again.
- **Leads and owners that collide are left as they are.** They are duplicates
  for the existing merge flow, and are reported.
- **Run the dry run first:** `backend/src/scripts/phone-dry-run.ts`
  (read-only) says what the repair will do, in the categories production was
  measured in. Run it on development, then on production once Om approves a
  production read.

## Not changing

- Agreements' `party_phone` is already E.164 on both paying firms.
- WhatsApp links use `waDigits` and send nothing for an unreadable number
  (WhatsApp then asks who).
