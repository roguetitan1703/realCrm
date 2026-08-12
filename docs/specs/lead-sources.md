# Lead sources — naming and renaming them in the app

A firm should be able to call a source what they call it out loud. Bhumi's
second 99acres account is "Property Circle" to the people working it; the CRM
called it "99acres 2" because that is what the connection was named when it was
created.

Renaming it today means a script and a database transaction. This is what it
should be instead.

---

## 1. Where a source's name actually lives

Four places, and moving one without the others is how a portal ends up counted
twice:

| | |
|---|---|
| `integrations.provider` | what the connection is called on screen |
| `integrations.parser_config.defaults.source` | what **future** leads are stamped with |
| `crm_leads.source` | what **existing** leads already carry |
| `crm_settings.value.sources` | a curated array some tenants still hold |

Change only the default and today's leads say one thing, yesterday's say
another, and no screen admits they are the same portal. That split is the whole
reason this needs to be one action rather than a text field someone edits.

**Not rewritten, deliberately:** notification bodies and timeline entries
reading "via 99acres 2". They record what happened at the time. A ledger that
edits itself to match the present is worth less than one that does not.

---

## 2. The interaction

**Where:** the connection's own screen, beside its name. Renaming a source is
something you do while looking at the connection it belongs to, not in a
settings list of strings detached from anything.

**What it does, in one action:** rename the connection, restamp every lead it
has ever produced, update what future leads get, and leave the history alone.

**What it must say before it does it.** The count is the whole safety mechanism
— someone renaming "99acres" thinking it affects one connection needs to see
that 15 leads move with it:

> Rename **99acres 2** to **Property Circle**
> 1 lead will be restamped. Future enquiries from this connection will arrive as
> Property Circle.
> `[Cancel]` `[Rename]`

**Merging is a different verb.** Renaming onto a name already in use is not a
rename — it fuses two sources permanently, and afterwards nothing distinguishes
the rows. It needs its own confirmation, in its own words, saying how many leads
each side holds. The script models this with a separate `--merge` flag; the UI
should not let it happen by accident either.

**Who can:** owner and manager. It rewrites every lead's attribution, and an
agent should not be able to reshape the desk's reporting.

---

## 3. Server

`POST /api/v1/connections/:id/rename` — `{ name }`

One transaction, in this order, all scoped to `tenantId`:

```
UPDATE crm_leads     SET source = :new WHERE tenant_id = :t AND source = :old
UPDATE integrations  SET provider = :new WHERE tenant_id = :t AND provider = :old
UPDATE integrations  SET parser_config = jsonb_set(
                           parser_config, '{defaults,source}', to_jsonb(:new::text))
                     WHERE tenant_id = :t AND parser_config->'defaults'->>'source' = :old
UPDATE crm_settings  SET value = jsonb_set(value, '{sources}', :nextArray)
                     WHERE key = 'default' AND tenant_id = :t   -- only if it holds the old name
```

Then `audit()` — through the service, never a raw INSERT, because `audit_log`
carries `prev_hash`/`hash` and a row written around the service breaks the chain
the ledger is sold on.

**`to_jsonb(:new::text)`, not `JSON.stringify(new)::jsonb`.** postgres.js
already encodes a JS string for the parameter, so stringifying first encodes it
twice and stores `{"source":"\"Property Circle\""}` — quotes and all — which
then stamps every future lead with a quoted source. That happened on the live
tenant during the manual rename and was caught by reading the value back.

**Read it back and assert** before reporting success. A rename that reports
"done" while leaving a connection mangled is worse than one that fails.

---

## 4. Rules

- **A source name is unique per tenant.** Two connections may share one — two
  99acres accounts both writing `99acres` is legitimate, and is the default the
  mapper suggests. What must not happen is a *rename* silently colliding.
- **Empty is not allowed.** A blank source is not a source.
- **The name is free text**, trimmed, no case-folding. "Property Circle" and
  "property circle" are different, and the firm may mean the difference.
- **Agents see it after a refresh.** Sources are read at bootstrap; the rename
  should invalidate that so the desk does not sit on a stale list.

---

## 5. Until it exists

```
npx tsx src/scripts/rename-source.ts --tenant=bhumi --from="99acres 2" --to="Property Circle"
npx tsx src/scripts/rename-source.ts ... --apply
```

Dry-run by default, prints the blast radius per tenant, one transaction, audited
through the service, and reads the value back before claiming success.

It is the same four writes. The feature is that button, and the confirmation
that tells you what the button is about to move.
