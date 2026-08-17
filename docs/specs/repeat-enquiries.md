# Repeat enquiries — one person, several enquiries

A buyer who enquires twice is the strongest signal a portal desk gets. Today the
second enquiry is recorded as a sentence and its requirement is thrown away.

---

## 1. What actually happens, measured

From bhumi's raw `webhook_inbox` bodies (257 payloads, 228 distinct phones):

| | |
|---|---|
| phones that enquired more than once | **21** |
| of those, the repeat carried a **different requirement** | **13** (62%) |
| differing locality | 6 |
| differing budget | 6 |
| differing project / property type | 6 |
| **differing deal type** | **0** |

Real cases:

```
9492917799  ×4  rent · Mahalunge · ₹29,999 → ₹24,999 → ₹25,000
                Godrej Green Vistas AND VTP Township
9056135378  ×3  sale · VTP Belair · ₹73L → ₹85L
8789897611  ×2  rent · Hinjewadi → Bodkewadi Maan
7507047970  ×3  Hinjawadi → Blue Ridge Town Pune
```

**Deal type never differs.** That kills the obvious design — splitting a person
into a "buyer lead" and a "renter lead" — because nobody is doing that. What
people actually do is shop across projects and localities inside one intent, and
revise their budget as they go.

## 2. The loss

`findLeadByPhone` merges on the last ten digits, which is right and must stay:
two rows for one person means two agents ring him. But the merge then:

- writes a note and a timeline line, and
- **keeps the first enquiry's requirement**

So a lead reads ₹73L while the buyer's most recent statement was ₹85L. The newer
figure survives only as prose inside a note, where no filter, no match and no
report can reach it. **13 of 21 repeat enquirers on bhumi have a record that
misstates what they currently want.**

There is also no counter. Nothing on the row, the card, or the record header
says this person has asked three times — the only evidence is a timeline entry
you have to scroll for.

## 3. The model

**A person is one lead. An enquiry is an event with its own requirement.**

Keep the lead as the unit of work — one owner, one call, one follow-up. Add the
enquiry as a first-class record beneath it, so the history of what someone asked
for is queryable rather than narrated.

```
crm_lead_enquiries
  id, tenant_id, lead_id, integration_id
  received_at          -- portal enquiry time
  source               -- the connection's name at the time
  req                  -- the parsed requirement snapshot, as sent
  raw_ref              -- webhook_inbox id, for provenance
```

The first enquiry writes a row too, so the table is the whole history and not
"everything after the first one".

## 4. How the lead's own requirement updates

Not "latest wins" for everything — the fields differ in kind:

| field | rule | why |
|---|---|---|
| budget | **latest wins** | it is a revision; ₹85L supersedes ₹73L |
| deal | **latest wins** | never observed to change; if it does, it is a correction |
| locality | **accumulate** | Hinjawadi *and* Blue Ridge — they are shopping both |
| project / interest | **accumulate** | Green Vistas *and* VTP Township |
| config | **accumulate** | 2 BHK *and* 3 BHK is a real, common search |
| anything absent from the new payload | **leave alone** | absence is not a correction (CLAUDE.md §3.1) |

The accumulate fields need a display form that stays short — "Mahalunge +1" with
the full set on the record — or the list row becomes unreadable.

## 5. What the desk sees

**On the lead row and card:** a count, only when it is more than one. `2 enquiries`.
Never a badge reading `1` — that is every lead, and a badge on everything is a
badge on nothing.

**On the record header:** the count, and the drift when there is one:

> **3 enquiries** · budget ₹73L → ₹85L · VTP Belair

**In the timeline:** each enquiry as its own entry showing what was asked for,
not a prose note. The existing "Enquired again via 99acres" line becomes the
enquiry event, carrying its requirement.

**As a filter:** "Enquired more than once" belongs in the Needs-attention set. On
bhumi that is 21 leads today, and they are the warmest ones on the desk.

**Notification:** a repeat enquiry from a known buyer should not read the same as
a new lead. It is a different, more urgent fact — someone who was already in the
book has come back.

## 6. Rules

- **Never split a person on requirement drift.** Zero of twenty-one changed deal
  type; splitting would recreate the duplicate-row problem the phone rule exists
  to prevent.
- **The lead's requirement is derived, never hand-merged in two places.** One
  function takes the enquiry rows and produces the lead's current requirement,
  or the columns and the history diverge (CLAUDE.md §3.2).
- **Backfill is possible and worth doing.** `webhook_inbox.raw_body` still holds
  the original payloads for bhumi's 257 pushes, so the enquiry table can be
  built from history rather than starting empty. Note the 30-day purge in
  `data-lifecycle.md` — bodies older than that are already gone, so this gets
  cheaper to do the sooner it happens.
- **Do not rewrite the notes that already exist.** They record what was said at
  the time.

## 7. Not in scope

Commercial enquiries (`deal_type: "L"`, `property_type: "0 BHK"`) are a separate
gap: Properties has a full commercial vocabulary — category, Office / Shop /
Showroom / Warehouse — and the lead requirement model and parser have none, so a
showroom can only land as `0 BHK`. That is its own spec, not this one.
