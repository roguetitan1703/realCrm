# Phone numbers

Status: built (20 Oct), on `a-phone-model`; see "As built" at the end. Om, 20 Oct: "we should have a country code field so
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
  `{ ok: false, reason: 'empty' | 'letters' | 'too_short' | 'too_long' | 'invalid' }`
- `phoneProblem` (the reason in words: "Too short for India"), `toE164`,
  `keepPhone` (E.164, or as received when unreadable), `formatPhone`
  (always international: "+91 98765 43210", "+971 50 123 4567"),
  `callingCode`, `phoneCountries`, `isPhoneCountry`
- links (`waLink`, `waDigits`, `telLink`) live in `src/lib/phoneLink.js` and
  need no reader: a stored number is E.164 or unreadable, and an unreadable
  one gets no number in the link

It uses the "max" metadata (full per-country patterns). "min" checks little
more than length, and accepted numbers max refuses. The cost is about 52 kB
gzipped. The buyer's pages do not pay it on first paint: the desk and the
console load on their own (main.jsx), and the public pages load the phone box
and Add as lead when they are shown. It replaces:

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

- **How it runs:** `migratePhones()` inside `initSchema`, per tenant, with that
  tenant's country, gated on `schema_migrations` row `phones_e164` (its own
  gate, not `runOnce`, so a refusal is not marked done). A failure rolls the
  whole repair back, is logged, and does not stop the boot.
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
- **Leads and owners that collide are left as they are** (an owner typed
  twice stays two records; nothing merges them) and are logged. Searching the
  number in the owner or lead list shows both. Owners have no duplicate flag or
  merge flow today.
- **Run the dry run first:** `backend/src/scripts/phone-dry-run.ts`
  (read-only) says what the repair will do, in the categories production was
  measured in. Run it on development, then on production once Om approves a
  production read.

## Not changing

- Agreements' `party_phone` is already E.164 on both paying firms.
- WhatsApp links use `waDigits` and send nothing for an unreadable number
  (WhatsApp then asks who).

## As built (20 Oct)

- Server: `backend/src/services/phone.ts` — `requirePhone` (a form: E.164 or
  422 `phone_invalid` with `reason` and the words), `editedPhone` (an edit: a
  number sent back exactly as stored passes, so a record received unreadable
  can still be saved), `keepPhone` (portals, webhooks, a listing's owner taken
  from an owner record), `phoneKey` (a lookup; null matches nobody).
- A foreign number written without `+` ("971526377771", "447876011111") is
  read as that number when the firm's country cannot read it, it is 11-15
  digits, and it is valid once `+` is put back (review, 21 Oct). Consequence:
  an 11-digit "12345678901" reads as a US number.
- An unreadable portal number matches the identical string from the same
  portal (`findLeadByRawPhone`, ingestion only), when it has no letters, no
  masking (`X`, `*`), at least 7 digits and is not one digit repeated.
- Search compares digits (`phoneLike` in store.ts): "+91 98765 43210" and
  "98765 43210" find "+919876543210". Only for an all-phone-characters search
  with 4+ digits; a trunk 0 is dropped. Unindexed: a tenant-scoped scan.
- Properties import: an owner phone cell that cannot be read refuses the row
  with the cell and the reason; it was dropped silently.
- Import: the mapping step has "Numbers without a country code" (the firm's
  country by default); rows key on exact E.164.
- Onboarding (console): a roster number is read as Indian; one that cannot be
  read is a roster issue that stops provisioning, with the reason.
- Repair on development, 20 Oct: 61 written (delpat 43, skyline-realty 17,
  test-org 1 probe row), 57 unreadable left (tutorial's 50 fixtures, delpat 7),
  0 user collisions.
- Users who would share a number (unique index) are held back with their
  metadata copies and named at boot as an error; everything else converts and
  the repair is not marked done until they are fixed (review, 21 Oct; probed
  on test-org: owner converted, both users left, marker unset).
- The phone box is `components/PhoneInput.jsx`, never primitives.jsx, and
  `personLabel` lives in phone.js: both shared modules reach the buyer's entry.
