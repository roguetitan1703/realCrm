# Plan — 20 Oct to 12 Dec 2026

Written 17 Oct against `docs/usage-2026-10-17.md` (production, read-only, 30
days). Every number below is from that file unless it says otherwise. The
product is in production for two paying firms: bhumi (7 agents + owner) and
mahalaxmi (4 agents + owner, live since 21 Sep). Om and AI builders; a Vercel
plan with capped deploys; the paying firms' data is read-only unless Om names it.

---

## 1. Diagnosis

### The agent, on a phone, between calls

**What works.** Every lead arrives by portal webhook (719 in 30 days; manual
entry and import are 1 and 0). Everyone is active: 0 agents with zero activity.
The first call happens: bhumi reaches 75% of new leads within 24 hours, median
7.4 h. Calls and WhatsApps are logged by the hundred (bhumi 468 + 434,
mahalaxmi 526 + 46 in 30 days) and statuses are moved (420 and 783 times). The
"who do I ring next, tap to record it" half of the job is done and used.

**What does not work — our fault.**

1. **Nobody writes what happened.** Outcome on 20% of bhumi's calls, 51% of
   mahalaxmi's. Ravish (163 calls) and Anil (110) wrote 0. The product asks
   the same fact twice: the outcome sheet (which appears as the dialer takes
   the screen, says "Optional." and has a Skip) and the status pill one tap
   away. Agents answer the one they understand, the status. One fact, two
   controls (CLAUDE.md §3.2). Status changes are 2× the outcomes at bhumi.
2. **A status change tells us nothing about the call.** mahalaxmi: 151 of 420
   leads (36%) carry a status — 93 Rejected, 20 Call Not Received — with no
   call or WhatsApp ever logged. Their "33% contacted in 24 h" is partly a
   measurement gap; "any touch in 24 h" is 68%. We cannot say how fast
   mahalaxmi really calls, and neither can their owner.
3. **Bookings do not close.** Follow-ups booked 13 and 11 a month; past due
   right now 24 of 33 (bhumi) and 7 of 9. Site visits booked 18 and 19; logged
   with proof 3 and 1; leads moved to the Site Visit stage 2 and 17. Logging a
   visit (photo + GPS) is a separate flow from the status, so the status wins
   again. A booked call closes itself when the Call button is tapped on that
   lead, and that has happened 2 times ever.
4. **Alerts are noise.** 735 and 1,025 in a month, read 6% and 12%; bhumi's
   owner got none. The rebuild (an alert is open work, closes itself) is on
   `development`, verified on dev, not deployed. 257 iPhone pushes timed out;
   the fix is also not deployed.
5. **Nothing watched the feeds.** bhumi's 99acres sent 0 leads for 4 weeks
   (about 45 leads at its previous rate). `webhook_inbox` lost nothing; the
   portal stopped. Our side: `last_received_at` exists and is shown only on the
   Connections page, which nobody opens. Nobody — not the owner, not Delpat —
   noticed for a month.

**Adoption or training, not product.**

- Anil and Vinod have never turned push on (5 of 8 bhumi phones subscribed).
- Siddhi stopped on 11 Oct and still holds 65 open leads.
- mahalaxmi's owner made 2,128 assignments in 26 days (82 a day) because
  round-robin sends to 4 agents and he wants 2. Settings → Assigning already
  has a rota (`active_agent_ids`). Nobody showed him.
- Zahir logged 219 calls and holds 1 lead: mahalaxmi seems to run a
  first-caller-then-handler model our assignment model does not describe.

**Outside our control.** The 99acres feed itself; Apple's push service; how
the firms staff Sundays (both work them).

### The owner, at a desk

Used for one thing: handing out leads (984 and 2,128 assignment events). The
mahalaxmi owner reads every alert he gets (33 of 33). We have **no number** on
whether either owner opens Team or Performance. The desk's job is "who do I
talk to today"; today the honest answers are Siddhi (65 leads, gone), Anil and
Vinod (unreachable), Ravish and Anil (no outcomes) — and nothing on the desk
says any of these yet. The weekly Performance view and the Team "Alerts"
column that would are built and not deployed.

### The unused half

0–3 uses ever: lead import, merge duplicates, units/projects, agreements (3,
one by us), mark verified, owner callbacks, owner → listing, calendar tasks,
email, shortlist verdicts. bhumi imported 1,324 owners and made 0 calls on
them. **Verdict: stop investing.** Keep them working; add nothing; write no
specs; do not remove them (removal is work and risk with no return). Two
things have a pulse and deserve adoption, not code: mahalaxmi's owner calling
by status (344 owners touched) and bhumi sharing listings on WhatsApp (57 in
30 days, 36 of them Mohit's).

**Plain verdict.** For the agent the product is half doing its job: it gets
the call made and does not get the result written. For the owner it is a
distribution tool, not yet a management tool, mostly because what would make
it one is sitting undeployed.

---

## 2. Where effort goes

**NOW (weeks 1–4).** Deploy what is built. Watch the feeds. Make the status
change and the call outcome one control. Close bookings. Get the owners to
act on what the desk will now show. Send Prithviraj the demo. Start Meta track
A (paperwork, Om's time only).

**NEXT (weeks 5–8).** Catalog, steps 1–2 only (send records, multi-flat send,
buyer's buttons), then measure for two weeks before step 3. Help desk once Om
says what it is. Collapsible sidebar bundled into a release, never its own.

**LATER.** Catalog step 3–4 (public catalogue, owner's numbers) if step 1–2
earns it. Enquiries model (a migration on paying firms' leads; the repeat case
is 8% of leads and `lead_repeat` already handles it). PWA overhaul, branding
audit, data retention, route-by-route permissions (all parked with reasons).
Meta track B (build) — only after Meta has verified Delpat. Owner updates and
one-person-across-roles (parked 30 Sep, still right).

**DROP or decline, for now.**
- The "Phase 2" list (qualifier bot, campaigns, drips, AI replies,
  comment-to-DM, call-to-lead card): every item waits on a Meta approval we do
  not have, and no number from either firm asks for any of it.
- Kanban group-by, pagination restyle, skeletons: 0 numbers behind them.
- Any work on import, agreements, units, calendar, email, verification.
- Pushing bhumi to use the owner queue (1,324 rows, 0 calls): ask once whether
  they meant to; if not, it is noise on their desk.
- A production speed test (parked 25 Sep): no complaint, no number.

**The bets, named.**

| Bet | What we believe | How we will know by 12 Dec |
|---|---|---|
| A. Retention | One control for status + outcome lifts outcomes without training | bhumi outcome rate 20% → 60%; mahalaxmi status-without-contact 36% → under 10% |
| B. Manager value | Owners act when the desk names the person | Siddhi's 65 leads reassigned; push on 8 of 8 and 5 of 5; mahalaxmi assignments/day 82 → under 20 |
| C. Sales | WhatsApp/Instagram inbox sells client #3–#10; the current two will not pay more for it (PARKED, 30 Sep) | Not provable in 8 weeks. Spend only Om's time on verification; no build before approval |
| D. Catalog | A firm's own page brings leads it does not pay a portal for | Unproven, 0 numbers. Test with sends and responses first; step 3 only if ≥10% of sends get a buyer response |

Why the core loop beats the Meta track for builder time: the core loop is
weak in numbers we can move in two weeks with S/M work and no external
dependency. The Meta track has 20 open tasks, none started, and its clock is
Meta's (business verification, App Review, Tech Provider access), not ours.
Its value to the two paying firms is unmeasured: we have no count of WhatsApp
or Instagram enquiries at either firm.

---

## 3. The sequenced plan

Weeks run Monday to Sunday from 20 Oct. Releases go API first, frontend
second (`docs/releases/2026-10-13.md`). Five frontend deploys in eight weeks.

| # | Item | For | Outcome (measurable) | Size | Depends on | Writes paying firms' data |
|---|---|---|---|---|---|---|
| **W1** | **Release 1 (shipped 27 Oct)**: alert lifecycle, working hours, Performance 7/30 days, follow-up done from Today, Apple push fix, legal pages. 45 commits on `development`; 17 touch the app | both | Bells per agent 140–297 → 0–5; Apple timeouts 257/month → under 10; a week of the team visible | M (Om: re-test, merge, 2 deploys) | Om's re-test on dev. Re-run `alert-first-run-preview.ts` first: it is 4 days stale | **Yes.** Status columns on ~2,227 bhumi and ~757 mahalaxmi `notifications` rows (first run, `runOnce`). No other table |
| W1 | Send Prithviraj the demo (#125, overdue 15 Oct) | Delpat | One reply, one date | S, no code | demo-showcase tenant exists | No |
| W1 | Release note to each owner: 6 lines on WhatsApp, in their words (bell clears itself, 9–9 quiet hours, the month view) | owners | Each owner opens Performance → 30 days once in week 2 (check `audit_log`) | S | Release 1 | No |
| **W1–2** | **Feed watch.** A sweep: an active integration with `last_received_at` older than 7 days that received ≥8 pushes in the 28 days before. One `feed_silent` alert, morning urgency, to the owner ("99acres has sent nothing for 7 days") and to Delpat (console + a message to Om) | owner, Delpat | A silent feed is named within 1 day, not 28. 0 unexplained silent feeds at any week end | S | Alert catalogue (`closesWhen`: a push arrives) | Yes: new alert rows only |
| W1–3 | Business rails: weekly numbers script (`scripts/usage-weekly.ts`, read-only, the §4 numbers per firm, run Mondays); a release every two weeks on Monday 08:00 IST (mahalaxmi's quiet day, before bhumi's 10:00 start); `docs/ops/ONBOARDING.md` runbook from the mahalaxmi go-live (provision, imports, rota set, **every phone subscribed before we leave**, support group opened); a price written down (Q2) | Delpat | Numbers in hand every Monday; client #3 onboarded from a page, not memory | S each | — | No |
| **W2–4** | **One place to say what happened.** (a) The outcome sheet opens when the agent returns from the dialer (`visibilitychange`), as chips, with the status row on the same sheet; Skip stays (never force a fact); the "Optional." caption and "This records an action and will redirect you…" go (CLAUDE.md §5). (b) An outcome sets the status by one map the firm can see (no_answer → Call Not Received exists; add callback → Callback, visit → Site Visit + booking, not_interested / booked_elsewhere → Rejected with reason). (c) A status change on a lead with no contact logged that day asks one tap: Called · Messaged · Neither. "Neither" is honest and allowed | agent | bhumi outcome rate 20% → 60%; mahalaxmi 51% → 75%; mahalaxmi status-without-contact 36% → under 10%; bhumi "contacted in 24 h" holds ≥75% | M | Release 1 (so the lifecycle is measuring); Q3 | No at deploy; new rows from agents' taps only |
| W3–4 | **Finish what was booked.** Phone lead record gets Done for a booked meeting (Small list, `FollowUpDoneModal` ready). Moving a lead to Site Visit books the visit (date) when none is booked. Today's row the day after asks "Did it happen?": proof flow, or No show. Proof stays mandatory for a logged visit unless Q4 says otherwise | agent | Past-due follow-ups at week end: bhumi 24 → under 8, mahalaxmi 7 → under 3. Of leads moved to Site Visit, ≥50% have a date and a result within 7 days | S/M | Item above | No |
| **W3** | **Release 2**: feed watch, one-place outcome, collapsible sidebar (#130, S, Sonnet builder) | both | As above | — | — | Feed alerts only |
| W4–5 | **Help the owner act.** Team gets one line per agent that is inactive 7+ days and holds open leads ("Siddhi · 65 open · last active 6 Oct"), beside the Alerts column. Then one support call per owner (not code): set the rota, reassign Siddhi's leads, turn push on for Anil and Vinod, ask bhumi about the 1,324 owners, ask mahalaxmi how Zahir works | owner | 0 open leads held by anyone inactive 7+ days; push on 8/8 and 5/5; mahalaxmi assignments/day 82 → under 20 | S + 2 calls | Release 1 | No (the owner writes, in the app) |
| **W5** | **Release 3**: finish-what-was-booked, Team inactive line, help desk if Q1 says "report a problem" (S: the existing support WhatsApp number, prefilled with firm, user, screen, version) | both | Support requests arrive with context | — | Q1 | No |
| **W5–8** | **Catalog (shipped 27 Oct with release 1, with the public catalogue)**: steps 1–2 (`specs/listing-pages.md` §7): send records + multi-flat send from the lead; old photo links redirect; buyer's buttons (Interested · Book a visit · Not for me) and sticky "Talk to us"; responses on the lead; one alert. Needs a reply-to person per firm and agents' phone numbers (bhumi: 4 of 8 missing) | agent at bhumi; the buyer | ≥40 sends/month at bhumi with ≥2 flats per send; ≥10% of sends get a response; the sending spreads beyond Mohit (36 of 57 today) | L (two releases) | Releases 1–3 out; Q5 | Yes, small: 2 bhumi photo links redirected; new tables otherwise |
| W7, W8 | **Releases 4 and 5**: catalog step 1, then step 2 | — | — | — | — | — |
| **W1–8, parallel** | **Meta track A** (#101–#106): footer, legal pages (live with Release 1), documents, business portfolio, Business app, read the docs. Om's calendar, no builder | Delpat | Business verified and app created by 12 Dec. **Gate:** no track B work before verification passes | S each, Meta's clock | Release 1 | No |
| W8 | Decide: catalog step 3; Meta track B; enquiries model | Om | From §4's numbers | — | — | — |

What is left out on purpose: the enquiries migration, PWA, branding, retention,
permissions pass, Phase 2. All in BACKLOG/PARKED with their reasons; nothing
here re-litigates them.

---

## 4. Seven numbers, every Monday, per firm

All from production, read-only, IST firm days, last 7 full days. "Person" means
`crm_timeline_events` with author not `System`/`Import` and `metadata.auto`
not true; a Delpat support window (`audit_log` `support.open` + 2 h) is
excluded, as the usage snapshot does.

1. **Contacted in 24 h.** Portal leads (`created_by` null, no
   `import_batch_id`) created in the week with a person `call` or `whatsapp`
   row within 24 h of `created_at`, ÷ those leads. Now 75% / 33%. Hold ≥75%;
   mahalaxmi → 60%.
2. **Outcome written.** Person `call` rows with non-empty `metadata.outcome`
   ÷ person `call` rows. Now 20% / 51%. → 60% / 75%.
3. **Status without contact.** Leads with a person `stage_change` in the week
   and no person `call`/`whatsapp` row ever, ÷ leads with a person
   `stage_change` in the week. Now ~36% at mahalaxmi. → under 10%.
4. **Past due at week end.** `crm_leads.follow_up` not null with its time
   before now, ÷ leads with a follow-up. Now 24 of 33 / 7 of 9. → under 8 /
   under 3.
5. **Alerts that got done.** After Release 1: `notifications` opened in the
   week closed with `close_reason='done'` within 24 h ÷ opened. Replaces "read
   rate" (6% / 12%). Target ≥60%. Beside it: push `sent+displayed` ÷ attempts
   to a device (84% / 86% → ≥95%), and agents with a device that delivered in
   7 days ÷ agents (5/8, 4/5 → all).
6. **Feeds alive.** Active integrations with 0 pushes in 7 days that averaged
   ≥2 a week over the 4 weeks before. Target 0 unexplained; any 1 named in a
   message to the owner the same day.
7. **Leads nobody is working.** Open leads (not Rejected / Deal Closed) held by
   a person with no activity for 7+ days, per firm. Now 65 (bhumi, Siddhi) /
   0. → 0.

Business line, same sheet: paying firms, monthly revenue, support requests per
firm, days since last API deploy, `main` vs deployed commit.

---

## 5. Risks, ranked

1. **Release 1's first run writes ~3,000 alert rows at both paying firms.** A
   wrong close test empties bells of real work, or leaves them full. Mitigate:
   re-run the preview the morning of the deploy; watch the boot line; one day
   of bells checked by hand; a reopen script (`closed_at = NULL where
   close_reason in (...)` for that run's rows) written before the deploy.
2. **A silent portal costs a firm the leads it pays for, and they blame the
   CRM** (`routes/ingest.ts` says this in its own words). 99acres: 4 weeks,
   ~45 leads. Until the feed watch ships this can repeat tomorrow.
3. **Om is the only deployer and the only production writer.** Hand deploys,
   hand production runs, a watcher that can write prod. Mitigate: the runbook,
   the Monday script, two-week rhythm, nothing clever on a Friday.
4. **`main` runs ahead of the live API** (7 commits for a month). "Field does
   not exist" bugs on real desks. Mitigate: API first, every time; the business
   line in §4 counts the gap.
5. **Meta track swallows weeks and may refuse a one-person agency** (Tech
   Provider access verification). Mitigate: Om's time only until verified;
   gate in §3; the sales story is told as "coming", never built as fake.
6. **mahalaxmi's way of working does not fit the assignment model** (82
   reassignments a day; a first caller holding 1 lead). Forcing the model is
   how a client churns. Mitigate: ask them (W4–5 call) before changing code.
7. **Security debt, known and parked:** `/api/v1/ingest` has no rate limit;
   routes not reviewed role by role; secrets exposed during development not yet
   rotated (user-side). A leaked key fills a desk.
8. **Data growth with no retention** (`webhook_inbox`, timeline, deliveries)
   on a Supabase plan with a low connection cap. Not urgent at this volume;
   wrong to forget.
9. **Vercel's deploy cap.** Five releases planned; a hotfix costs one. Bundle;
   never deploy docs.

---

## 6. Questions only Om can answer

1. **What is the help desk (#129)?** *Answered 19 Oct: report a problem AND a
   help centre.* Report a problem is S (the support WhatsApp bubble, prefilled
   with firm, user, screen, version, Release 3); the help centre is M (the
   tutorial-videos engine exists).
2. **What do bhumi and mahalaxmi pay, and will #3 pay the same?** Nothing in
   the repo says. Example: Prithviraj asks "how much?" on the demo call. *Yes,
   a price exists and is written down*: put it in the onboarding runbook.
   *No*: set one this week — per seat per month, portals included, WhatsApp
   inbox as a later add-on. **Recommendation:** per seat; do not sell the
   inbox before Meta says yes.
3. **May a status change ask one tap — Called · Messaged · Neither — when no
   contact was logged that day?** Example: Khushboo moves a lead to Rejected
   from her phone recents; today we record nothing about the call. *Yes*: one
   extra tap per status change, and mahalaxmi's 36% becomes visible. *No*: we
   keep guessing, and the owner's contact numbers stay wrong for mahalaxmi.
   **Recommendation:** yes, with "Neither" always allowed.
4. **Does a site visit still need photo + GPS to count?** Example: mahalaxmi
   moved 17 leads to Site Visit and logged 1 with proof. *Yes*: visits stay a
   trusted number and stay near zero; the owner reads the stage instead.
   *No*: a visit can be closed from Today with a result and proof optional,
   shown as "with proof" on Performance. **Recommendation:** keep proof for
   "logged visit"; let the stage move book the date and ask for the result.
   Decide after four weeks of the new flow.
5. **Catalog: steps 1–2 now and step 3 on evidence, or all four?** *19 Oct: reopened, to be redesigned as one piece.* Example:
   Mohit sends 36 listings a month; nobody else at either firm sends more than
   10. *All four*: ~L, two more releases, the public catalogue built on 0
   numbers. *Steps 1–2 then decide*: two releases, and by 12 Dec we know
   whether buyers respond. **Recommendation:** 1–2 then decide.
6. **Will bhumi do their own Meta business verification (#118)?** Example: it
   needs their GST or registration documents uploaded by them. *Yes*: the
   pilot is possible this quarter. *No*: track D has no pilot, and track B
   has no customer; A continues as sales paperwork only. **Recommendation:**
   ask bhumi's owner in the W4–5 call, before any build.
7. **Do we tell owners what we see in their usage?** Example: "Siddhi holds
   65 open leads and stopped on 11 Oct." *Yes*: a monthly 5-line note per
   firm from the §4 numbers; Delpat becomes the firm's manager's manager.
   *No*: the desk must say it by itself and we stay silent. **Recommendation:**
   yes, monthly, by WhatsApp, numbers only.
8. **Monday 08:00 IST as the deploy window?** Example: Release 1 on Mon 20
   Oct at 08:00, before bhumi's 10:00 start, on mahalaxmi's quiet day. *Yes*:
   every release lands when the fewest people are working. *No*: name another
   hour. **Recommendation:** yes.
