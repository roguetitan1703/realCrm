# User flows: what the product does today

Every flow the real estate CRM supports on 1 Nov 2026 (`development` at 494aa72). Each one is taken from the code and checked in the running app. Memory and the old specs were not used as sources. The review of these flows is in [ui-review.md](ui-review.md).

**Sources**
- `src/modules/definitions.jsx`: the MODULE_DEFINITION for leads, owners, properties and contacts.
- `src/modules/**`, `src/modules/phone/**`, `src/lib/nav.js`.
- `backend/src/routes/*`, `services/leadSegments.ts`, `services/notificationCatalogue.ts`.
- Buyer, superadmin and setup flows: `Public.jsx`, `Admin.jsx`, `admin/*`, `Team.jsx`, `Settings.jsx`, `Connections.jsx` and `ImportPage.jsx`, read with their routes.

**Production numbers**
- Read on 1 Nov 2026, read-only (`sql.begin('READ ONLY')`), for the two paying firms.
- They cover the last 60 days (3 Sep to 1 Nov) unless a line says otherwise.
- They are written **bhumi / mahalaxmi**, and every number says what it counts.
- "Call" means a `crm_timeline_events` row of type `call`. That row is written when someone taps Call and confirms. It does not prove the phone rang.

## How much each flow is actually used (production, last 60 days)

| What is counted | bhumi | mahalaxmi |
|---|---|---|
| Active people (agents / owners / managers) | 8 / 1 / 0 | 4 / 1 / 0 |
| Leads that arrived | 635 (1,080 on file) | 615 (615 on file) |
| Leads by source (top) | Housing.com 301, MagicBricks 137, Property Circle 132, 99acres 62 | 99acres 246, Housing.com 227, MagicBricks 141 |
| Calls logged on leads | 1,105 on 655 leads, by 8 people | 828 on 409 leads, by 5 people |
| ...of those, with an outcome written | 158 (14%) | 449 (54%) |
| Lead call outcomes (top) | no_answer 85, not_interested 23, unreachable 21, discussed 9 | no_answer 234, details_sent 100, visit 47, unreachable 28 |
| WhatsApp logged on leads (with an outcome) | 895 (72) | 91 (16) |
| Calls logged on calling-list owners | 495 on 483 owners, by **1** person | 118 on 112 owners, by 3 people |
| ...with an outcome | 186 (169 of them `no_answer`) | 14 |
| Follow-ups booked / rescheduled / completed (timeline `follow_up`) | 32 / 10 / 4 (+2 callbacks) | 14 / 13 / 2 |
| Leads holding a booked next step now (all time) | 42 of 1,080 | 12 of 615 |
| Owners with a callback booked now | **0** of 809 | **0** of 3,737 |
| Owners still at New | 318 of 809 | 3,301 of 3,737 |
| Lead status changes (by the system's auto-advance) | 1,036 (697) | 1,134 (214) |
| Owner status changes | 937 (637 are the automatic "→ Contacted") | 580 |
| Status changes by role: agent / owner | 1,260 / 21 | 1,484 / 16 |
| Assignments written by the firm owner | 1,975 | 2,199 |
| Remarks | 600 by agents, 4 by owner | 316 |
| Site visits logged with proof (`activities`) | 6 | 1 |
| Share links sent (to a lead) / senders | 13 (11) / 2 people | 0 |
| Buyer link events | 20 views, 7 "I'm interested" | 0 |
| Buyer asks (call me back / book a visit / homes like these) | 0 | 0 |
| Alerts sent / read | 2,106 / 219 (10%) | 1,456 / 126 (9%) |
| ...`lead_assigned` sent / read | 1,366 / 114 | 615 / 59 |
| ...`lead_untouched` ("Not contacted for 24h") sent / read | 168 / 24 | 350 / 35 |
| Imports run (kind) | 6 (owners 3, leads 3) | 11 (owners) |
| Properties added | 82 (87 on file) | 24 |

**What the table says before any flow is read**
- Calling and WhatsApp are the product. Calls and WhatsApp messages logged by agents add up to about 3,700 writes. Site visits, sharing and buyer forms are close to unused.
- A call almost never ends with a next step booked: about 4 follow-ups for every 100 calls at bhumi. No owner callback is booked at either firm.
- The firm owner works the desk, and mostly by assigning. Owners logged 6 calls in 60 days across both firms, against 4,174 assignments.

---

## Legend

Each flow is written as follows:
- **Trigger:** what makes the person start.
- **Goal:** what they are trying to get done.
- **Steps:** what the person sees and taps, with the labels on screen.
- **Writes:** the table or endpoint each step writes to.
- **Ends:** how the flow finishes and acknowledges itself.
- **Branches:** what happens when the flow forks.

`X#` points to a cross-cutting flow in section F. File references are relative to the repo root.

---

## A. Agent on a phone

Phone chrome (`src/modules/Phone.jsx`):
- **Five tabs:** Today, Leads, Calling, Props and Me.
- **Badges:** Today's badge is overdue follow-ups plus late callbacks. Calling's badge is late callbacks.
- **Top bar:** the firm name and logo, and a bell with the unread count.
- **The FAB** (the + button, bottom right) changes with the screen. Its contents are in A21.
- **No global search on the phone.** Each tab has its own search box.

### A1. Sign in on the phone
- **Trigger:** first use, or a session that has expired.
- **Goal:** get to Today.
- **Steps:**
  1. The Workspace step: type the firm, or tap one of the recent workspaces, then **Continue**. A URL carrying the firm skips this step.
  2. Enter **User ID** and **Password**, then **Sign in**.
  3. On the first sign-in, set a new password: **Update & continue**.
  4. After the first tap anywhere in the app, an "Alerts off on this device" bar offers **Turn on**.
- **Writes:** a `sessions` row (`POST /auth/login`). On first sign-in, `POST /auth/password/change`.
- **Ends:** Today, To do half.
- **Branches:**
  - Wrong details: "Those credentials didn't match."
  - **Forgot password?** sends an email link.
  - "Switch workspace" is hidden in an installed PWA.

### A2. Morning: open the app and find who to ring
- **Trigger:** the start of the day, or coming back between calls.
- **Goal:** see the next person to call.
- **Steps:**
  1. Today opens on **To do**. Its groups come from `src/modules/phone/PhoneToday.jsx:332-356`, in this order:
     - **Overdue**: follow-ups past their time.
     - **Callbacks overdue** (owners).
     - **Due today**.
     - **Callbacks later today**.
     - **Came back today**.
     - **Not yet contacted**: leads at New.
     - **Owners to call**.
     - **Tenancies expiring**.
     - **Upcoming**.
  2. Each group shows 6 rows, then "Show more". A group over 12 collapses to a single line, for example "356 Owners to call ›".
  3. Each row has an open area and one action button on the right:
     - **Phone** icon for a lead or owner;
     - **Log visit** for a booked site visit;
     - **Done** for a meeting;
     - a calendar icon to reschedule anything that is due.
  4. **My work** is the second tab: today's and the range's calls, follow-ups and pending work for that person.
- **Writes:** nothing.
- **Ends:** the agent taps a row (opens the record) or its Call icon (flow X1).
- **Screenshot:** `ui-review/p-agent-today.png`.
- **Branches:**
  - Nothing due: "Nothing due / Follow-ups, callbacks and new enquiries show up here."
  - Loading shows a skeleton rather than "Nothing due".
- **Used:** this is the agent's home screen.

### A3. A new lead arrives and gets a first call
- **Trigger:** routing assigns a portal lead. The `lead_assigned` alert pushes "A lead was assigned to you".
- **Goal:** ring them while they are warm.
- **Steps:**
  1. Tap the push, or the bell → **All / Unread / Assignments** → tap the alert.
  2. The lead record opens:
     - name, number and requirement line;
     - a NEXT card when something is booked;
     - the latest remark;
     - **Call** and **WhatsApp** buttons, plus **Log visit** first when a site visit is booked;
     - **STATUS**, **Record outcome** and **Mark as rejected**;
     - DETAILS, SHORTLISTED AND MATCHING FLATS, and the timeline.
  3. Tap **Call** → flow X1.
- **Writes:** reading the alert sets `notifications.read`.
- **Ends:** at the end of X1.
- **Branches:**
  - Not called within 24 hours: `lead_untouched` "Not contacted for 24h" (sent 168 / 350, read 24 / 35).
  - The same number enquires again: `lead_repeat` "Someone enquired again", and the lead shows under "Came back today".
- **Used:** `lead_assigned` was sent 1,366 / 615 times and read 114 / 59.

### A4. Call a lead
X1 (call → outcome → follow-up).

### A5. WhatsApp a lead
X2.

### A6. Book or move a follow-up
X3.

### A7. Finish a due follow-up from Today
- **Trigger:** a row under Overdue or Due today.
- **Goal:** do the booked thing and clear it.
- **Steps:** depends on the booked kind (`src/data/followUpKinds.js`):
  - **Follow-up Call:** the phone icon → X1. Logging the call closes the booking on the server (`closeFollowUpFor`, `routes/actions.ts:212`).
  - **Site Visit:** **Log visit** → X4.
  - **Online Demo / meeting:** **Done** → "Follow-up: name" sheet → "How did it go?" with options Interested, Negotiating, Booked, Not interested and No show, plus "What happened?" → Save.
- **Writes:** `POST /records/:id/actions/follow-up/done`, which records the outcome and a `follow_up` "Completed" event.
- **Ends:** the row leaves the group. A toast confirms.
- **Branches:**
  - The calendar icon reschedules (X3).
  - Pressing **Call** closes the booking before any outcome is written. This is a known issue in WORK-STATE Later.
- **Used:** "Completed" follow-ups were 4 / 2.

### A8. Site visit
X4.

### A9. Change a lead's status
X5.

### A10. Add a remark
- **Trigger:** something worth noting that is not a call.
- **Steps:**
  - **Phone:** FAB → **Add remark** → type → **Add remark**.
  - **Desk:** Quick actions → **Add remark**.
- **Writes:** `remark` event (`remark.added` audit).
- **Ends:** the toast, and the remark appears as the record's top line.
- **Used:** 600 / 316 remarks, almost all by agents.

### A11. Send homes to a lead
X6.

### A12. Walk the calling list (owners)
X7.

### A13. Turn a calling-list owner into a listing
- **Trigger:** the owner agreed to list. Their status is at the firm's final calling stage, for example "Key Received".
- **Steps:**
  1. On the owner record, **Convert to property** appears beside the status (`src/components/Agreements.jsx:156`).
  2. It opens the property wizard, pre-filled from the owner.
  3. After the save, the owner shows "In Properties · **Open flat**".
- **Writes:** `crm_properties`. The owner keeps `converted_property_id`.
- **Branches:** the button does not appear before the final stage.
- **Used:** bhumi has 12 "→ Key Received" stage events.

### A14. Add a walk-in or phone-in lead
- **Trigger:** someone walks into the office or rings the agent directly.
- **Steps:**
  1. FAB (on Today, Leads or Props) → **New lead**.
  2. The form asks for Full Name *, Phone Number *, Email (Optional), type, locality, project or unit, Min/Max Budget and Requirement Notes & Purpose (`Modals.jsx:695-980`).
  3. Save.
- **Writes:** `crm_leads` through `findLeadByPhone()`. An existing number does not create a second lead.
- **Ends:** the new lead's record.
- **Branches:** a duplicate number points the agent to the existing lead.

### A15. Add a property in the field
- **Trigger:** the agent is standing in a flat, or an owner is listing one.
- **Steps:**
  1. FAB → **Add property**. The full-screen wizard has three steps: **Property** (what and where), **Price & terms**, and **Details & media**.
  2. **Next** moves between steps. Saving without a flat number asks "Save without a flat number?".
  3. A draft is kept in `localStorage` under `crm_property_draft`.
  4. Photos can be added with the camera or from files.
- **Writes:** `crm_properties`, media to R2.
- **Ends:** the property record.
- **Branches:**
  - From a property: **Duplicate for another flat**.
  - From a project's page: the wizard starts inside that project.
  - From an owner: A13.
- **Used:** 82 / 24 properties added.

### A16. Find someone who is calling back
- **Trigger:** the phone rings from a number the agent half-recognises.
- **Steps:**
  1. The agent has to guess whether the caller is a lead or an owner.
  2. Lead: Leads tab → **Search leads** → type a name or digits.
  3. Owner: Calling tab → search.
  4. Property owner: Props.
- **Writes:** nothing. The search is in the URL (`q`).
- **Ends:** the record.
- **Branches:** the phone has no single search across leads, owners and contacts. The desk has one (Ctrl K, `SearchModal`, `Modals.jsx:2294`).

### A17. An alert, and acting on it
X8.

### A18. Me
- **Steps:** **Me** tab ("Profile & Settings") shows:
  - name and role, and **Sign out**;
  - **Your mobile number** with **Change** (needed before sending links);
  - **Links I've shared**;
  - **Calendar** (the only way to reach the calendar on a phone);
  - **This device**: alerts and install;
  - the **Intro message** with **Copy** (read-only for agents).
- **Writes:** `PATCH /auth/me {phone}`, and the push subscription.

### A19. A buyer tapped "I'm interested", or asked for a call back or a visit
- **Trigger:**
  - `share_interested` "A buyer tapped I'm interested";
  - `buyer_callback`, `buyer_visit` or `buyer_homes`.
- **Steps:**
  1. Tap the alert to open the BuyerAsk sheet. Its buttons are **Open lead**, **Call**, **Another time** / **Confirm** (for a visit) and **Send** (for new homes).
  2. **Confirm** books the visit. If one is already booked, the sheet shows "Booked: …" and **Replace it**.
- **Writes:** `POST /buyer-asks/:id/confirm` → a follow-up on the lead.
- **Used:** 7 "I'm interested" events and 3 alerts at bhumi; 0 buyer asks at either firm.

### A20. Edit a lead
- **Steps:** FAB → **Edit lead**. It shows only for the desk, or for an agent on a lead they created (`canEditLead`). The form is the same one as New lead.
- **Writes:** `PATCH /leads/:id`.

### A21. What the FAB holds on each screen (measured, agent, dev)

| Screen | FAB items |
|---|---|
| Today, Leads, Props | New lead, Add property |
| Calling list | New owner |
| A lead | Edit lead, Schedule/Reschedule follow-up (with when), Add remark. Plus Log site visit when no visit is booked. Plus Assign/Reassign owner and Delete for the desk |
| A calling-list owner | WhatsApp, Schedule/Reschedule callback, Callback done (when one is booked), Add remark. Plus Assign caller and Delete for the desk |
| A property | Send, Call owner, Set status, Add remark, Mark as verified, Send owner an update, Copy listing details, Duplicate for another flat. Plus Delete for the owner |

Screenshots: `ui-review/p-agent-lead-fab.png`, `ui-review/p-agent-owner-fab.png`, `ui-review/p-agent-prop-fab.png`.

---

## B. Owner or manager at a desk

Desk chrome (`src/App.jsx:36-65`):
- **Sidebar:** Dashboard, Performance, Leads, Calling, Properties, Contacts (Owners / Tenants / Buyers), Calendar; then, under Manage, Import, Team, Settings, Integrations.
- **Top bar:** global search (Ctrl K) and the bell.
- **Sidebar badges:** Leads shows "Today", Calling shows late callbacks.

### B1. Morning check: is the team working the book?
- **Trigger:** the start of the day, at a desk.
- **Goal:** know who to talk to today.
- **Steps:**
  1. **Dashboard** shows, top to bottom:
     - Five tiles: **Not contacted**, **Follow-up overdue**, **Went cold today**, **Callbacks overdue** and **People called today**. Each opens the list filtered.
     - LEADS BY SOURCE: lifetime counts per portal.
     - CALLING QUEUE: Callbacks overdue, Callbacks later today, Never called and Unassigned, plus OUTCOMES by owner status.
     - TEAM TODAY: a Leads | Calling switch. Each person has CALLS, MOVED TO and NEEDS ATTENTION ("6 missed follow-ups").
  2. At 1366×768, TEAM TODAY starts below the fold (`ui-review/d-owner-home.png`).
- **Writes:** nothing.
- **Ends:** the owner clicks a tile or a person.
- **Branches:** the Today page (B13) shows the owner's own work.

### B2. Performance, and one person's page
- **Steps:**
  1. **Performance** offers Team, Leads | Calling, and Day / 7 days / 30 days / Custom.
  2. It shows TEAM SUMMARY (people contacted, calls, answered, follow-ups booked), HOW THE CALLS WENT, and WHAT CAME OF IT.
  3. The AGENTS table has the columns People / Calls / Answered / What came of it.
  4. NEEDS ATTENTION covers "Leads not yet contacted", "Missed follow-ups" and "Calls with no result written", each listed by person.
  5. Clicking a person opens their page, which is the same AgentWork component.
- **Writes:** nothing. The range is in the URL (`day`, `from`).

### B3. Find leads by filter, search and sort
X9.

### B4. Assign, reassign, take back
X10.

### B5. Leads with nobody on them
- **Trigger:** the UnassignedBar ("N leads are unassigned · Assign"), or the `lead_unrouted` alert to the desk.
- **Steps:**
  1. Click **Assign** → BulkAssign.
  2. Or filter **Agent → Unassigned** → select rows → **Bulk assign**.
- **Writes:** `agent_id`, plus an `assignment` event through `recordAssignment()`.

### B6. Look after the calling list
- **Steps:**
  1. Import the owners (B9).
  2. **Calling** opens grouped by project. Each card reads, for example, "726 owners / 702 to call / 5 interested", shows the callers' names, and has **Assign**.
  3. **Assign** on a project → AssignProject: hand the project, or part of it, to one or more callers.
  4. **Select** → tick owners → bulk assign or take back.
  5. Rename projects: one project spelt five ways can be merged (RenameProjectsModal).
  6. Status pills: All, Callbacks overdue, Callbacks later today, Callbacks, New, Call Not Received, Unassigned.
  7. Status and Agent dropdowns; Filter (Tower, Configuration); Sort (Callback due, Recently added, Last called, Name, Project).
- **Writes:** `crm_owners.agent_id` + `assignment` events, and `crm_project_renames`.
- **Used:** 1,617 / 1,836 owner assignment events.

### B7. Properties
X11.

### B8. Contacts and closing a deal
- **Trigger:** a lead reached the final stage, a flat is let or sold, or a tenancy is ending.
- **Steps:**
  1. **Contacts**: Owners, Tenants and Buyers.
     - The Owners tab shows **Landlords / Sellers / All**, with Name / Role / Listings / Locality / Their flats / Status.
     - Tenants and Buyers rows are agreements.
  2. Closing the deal:
     1. On a lead at the final stage, the deal-close button opens the agreement modal.
     2. Saving writes `crm_agreements`, sets the flat to Leased or Sold, sets the lead's stage, and adds timeline lines on both records.
     3. The AgreementCard then offers **Attach agreement**, **Renew** (rent only), **Edit** and **End**. **End** confirms first.
  3. A tenancy ending within 30 days shows on Today under "Tenancies expiring" and raises the `agreement_ending` alert.
- **Used:** 11 / 1 agreements.

### B9. Import a spreadsheet
- **Who:** owner or manager.
- **Steps:**
  1. Import → **What are you importing?** Leads & contacts / Properties / Owners.
  2. Upload → **Example sheet**, then drop a file.
  3. Map: **Match your columns**, "Import into project", and the country for numbers without a code.
  4. **Check the file** → Review: new / already on file / repeated / cannot be imported, with a sample showing "What happens" per row.
  5. **Import N records**.
  6. Done: "X of Y saved", **Download the rows that did not import**, **Undo this import**.
- **Writes:** `crm_import_jobs`, `crm_import_rows`, then the records.
- **Branches:**
  - **Undo** keeps records that were used since the import.
  - Going back from Map starts a new job.
- **Used:** 6 / 11 imports.

### B10. Team
- **Steps:**
  1. **Add teammate**: Full name, Access (agent / manager), Login ID (optional), Email, Mobile → **Add to team**.
  2. The reveal card shows the temporary password. **Done** is locked for 3 seconds.
  3. Per person: **Edit**, **Reassign seat**, **Suspend** ("Hand the work over first" or leave it with them), and ⋯ → **Reset password**, **Force logout**, **Delete**.
  4. Your sessions.
- **Writes:** `users`, `crm_agents`, routing and audit.
- **Branches:**
  - The last owner cannot be demoted or suspended.
  - A person who holds open leads cannot be deleted.

### B11. Settings
- **Sections:** Brand, Stages, Assigning, Response times, Message templates, Sharing (expiry, reply-to, show prices, catalogue link, embed, **Stop all sharing**), This device and Billing.
- **Agents** see Message templates (read-only) and This device.

### B12. Integrations and lead sources
- **Steps:**
  1. **Add source**: name it (chips 99acres, MagicBricks, Housing.com, Meta Lead Ads, Website form) → the key shows.
  2. Per source: **Map fields**, **Setup** (an email to the portal with the key), "N waiting or failed · **Process**", **Activity**, and ⋯ for Rotate key, Pause and Delete.
- **Alert:** `feed_silent` reaches owners only, when a source has gone quiet for a week.

### B13. The owner's own day (Today on the desk)
- **Steps:** **Today** shows To do and My work side by side. These are the same groups as A2, scoped to the person signed in.

### B14. Record a call made on the desk's handset
- **Steps:**
  1. **Call** on the desk is a `tel:` link, so a paired phone (Phone Link) dials.
  2. **Record outcome** → the "Record call · name" sheet: What happened (dropdown), Remark → Save.
- **Writes:** `contact-log` + an outcome PATCH.

### B15. Calendar
- **Steps:**
  1. **Calendar** shows header counts (SCHEDULED, SITE VISITS, OVERDUE), a month grid, the picked day's list, and "ALL UPCOMING APPOINTMENTS (n)".
  2. Clicking an appointment opens its lead.
- **Writes:** nothing.
- **Branches:**
  - Owner callbacks are not on the calendar.
  - There is no agent filter.
  - The source is one read capped at 200 leads (`Calendar.jsx:42`).

### B16. Payment bar and billing
X12.

---

## C. Owner or manager on a phone

The tabs are the same as an agent's (`Phone.jsx`). These differences come from the role:

### C1. Who is working: the Team tab
- **Steps:**
  1. Today → **Team**, the third tab, which only the desk roles get. It shows TEAM SUMMARY, HOW THE CALLS WENT, AGENTS and NEEDS ATTENTION, the same content as Performance.
  2. Tapping a person opens their page, with "Their leads ›".
- **URL:** `?screen=today&view=team&person=…`.
- **Ends:** the owner taps through to that person's filtered leads.

### C2. The firm's lists on a phone
- **Steps:**
  - Leads and Calling show the firm's book, with an **AGENT** dropdown that agents do not get.
  - Calling has **Select** → bulk assign or take back.
  - Leads has no select mode on a phone.

### C3. Same record work as an agent
- **Steps:**
  - Calls, status, remarks and booking work as in A3 to A20.
  - The FAB adds Assign/Reassign and, for the owner, Delete.

### C4. The payment bar on a phone
- **Steps:** the bar shows, but it is not a link, because the phone has no Settings screen (`App.jsx:213`). The × hides it for the session.

---

## D. Buyer on public pages (no sign-in)

Routes: `/<firm>/<code>` (a link or tap ref), `/<firm>/homes` (the catalogue), `/<firm>/homes/<slug>` (one home). Pages carry the firm's brand. Each device has an id kept per firm.

### D1. Open a shared link
- **Trigger:** a WhatsApp message from the agent.
- **Steps:**
  1. The preview card shows the flat collage, or "N homes from Firm".
  2. Open it:
     - One home goes straight to its detail page.
     - Several homes show "N homes for you · M available"; tapping a card adds `?h=`.
- **Writes:** `crm_share_events` `view`, once per device. A known lead back on another day raises `share_returned`, once a day.
- **Branches:** an expired, off or wrong link shows "This link is no longer active" with **Talk to us** and **See all our homes**.
- **Used:** 20 views at bhumi.

### D2. "I'm interested"
- **Steps:** tap **I'm interested** on an available home → WhatsApp opens to the lead's agent with "Hi, I'm interested in this home: <link>".
- **Writes:** an `interested` event, and the `share_interested` alert, at most once per flat per link per day.
- **Branches:**
  - A taken home answers 409.
  - With no network, WhatsApp opens to the page's number anyway.
- **Used:** 7 taps, 3 alerts.

### D3. Talk to us
- **By link state:**
  - Live link: WhatsApp to the agent.
  - Expired link: a `talk` event and the `share_expired_open` alert to the agent. The buyer still gets the firm's number.
  - Off link: the firm's number and no alert.

### D4. Call me back / Book a visit / New homes like these
- **Steps:**
  1. A sheet asks for Name, Mobile and, for a visit, **Day** and **Time** chips (whole hours inside working hours, the next 7 days) → **Send**.
  2. The sheet then reads "Sent · {Firm} will call you" (or "will confirm the visit" / "will tell you when one comes in") → **Done**.
- **Writes:**
  - `crm_buyer_asks`, attached to the link's lead or landed as an enquiry.
  - An alert to the agent: `buyer_callback`, `buyer_visit` or `buyer_homes`.
  - A follow-up call on a new lead that asked to be called back.
- **Branches:**
  - Rate limits apply per IP, per phone and per firm per day.
  - A slot that is gone re-asks.
  - A tap outside the sheet does not close it once something is typed. The X does.
- **Used:** 0 at both firms.

### D5. Browse the catalogue and enquire
- **Steps:**
  1. `/<firm>/homes` with Sale/Rent, Bedrooms and Area filters, which carry counts and live in the URL. **Show more · N**.
  2. A home page.
  3. The enquiry form, "Tell us what you're looking for" or "Ask about this home": Name, Mobile, Message → **Send** → "Sent · {Firm} will get in touch."
- **Writes:** an enquiry through `landEnquiry` (source "Catalogue").
- **Branches:** sold or removed homes show "This home is no longer available".

### D6. A staff member opens a buyer's link or tap
- **Steps:** the StaffBar shows either **Add as lead** (for a tap with no lead), or "Sent to · X" / "X tapped I'm interested" with **Open lead**, and **FreshLink** for an expired link.
- **Writes:** none for views. Staff browsers are never counted.

---

## E. Delpat superadmin (`/admin`)

### E1. Sign in
- **Steps:** Email and Password → **Sign in**.
- **Writes:** a 12-hour revocable session.

### E2. Firms list
- **Steps:** a table with Firm / People / Leads / This week / Calling / Properties / Last work / Last signed in / Billing.
  - Last work is highlighted after 3 idle days, and Billing when overdue.
  - The "Calling" column shows the owners count.

### E3. Onboard a firm
- **Steps:**
  1. Firm & Owner Credentials: paste a roster or fill the fields. The owner's password is generated on the server.
  2. Bulk Team Setup: a grid of people.
  3. **Complete Onboarding & Create Users**.
  4. The handover text, with **Copy Handover Summary**.
- **Writes:** `provisionTenant`, plus the ledger.
- **Branches:** the ✕ closes the modal and loses the whole roster, with no confirm.

### E4. One firm's page
- **Sections:** Overview (people, leads, the calling list, properties, storage; "Leads arriving" per source; work in the last 7 days), People and sign-ins, Audit log and Alerts (outcomes per type over 14 days).
- **Per person:** **Sign out** and **New password** (generated, shown once).

### E5. Work inside a firm's CRM
- **Steps:**
  1. **View their CRM** (read-only) or **Work in their CRM**, which asks to confirm.
  2. A new tab opens as the firm's oldest owner for 2 hours. The SupportBar shows "You are viewing as / working as", "Ends at", and **Close**.
- **Writes:** a `sessions` row with `support_by`, and `support.open` on the ledger.
- **Used:** 7 `support.open` at bhumi.

### E6. Billing
- **Steps:**
  - **Set up billing** / **Edit**: Plan, Amount, Cycle, Due on, Paid through, Days before due.
  - **Mark paid**: Paid on, Amount, Note.
- **Writes:** `tenant_billing`, `tenant_billing_payments`. The status is worked out from the dates and is never stored.
- **Branches:** if the record changed elsewhere, the save answers 409 "Billing changed elsewhere".

### E7. Feed watch
- **Steps:** an hourly sweep raises `feed_silent` to the firm's owners. The console's "Leads arriving" panel highlights a source with no lead for 3 days. There is no console view of the alerts.

---

## F. Cross-cutting flows

### X1. Call → outcome → follow-up booking (leads and calling-list owners)

This is the flow the product is used for most: 1,105 / 828 lead calls and 495 / 118 owner calls in 60 days. Four separate controls write it.

**Step by step on a phone**
1. Tap **Call**. It is on every list row, every Today row, and the record's full-width button.
2. **The "Call" sheet:** "Name · +91…", then "This records an action and will redirect you to your dialer. Continue?" with **No** and **Yes, continue** (`Modals.jsx:1786-1800`).
3. **Yes, continue** does two things:
   - writes `POST /records/:id/actions/contact-log {channel:'call'}`, which adds a `call` event "Call initiated";
   - closes a booked *call* follow-up (`closeFollowUpFor`) and marks an owner as contacted (`noteOwnerContact`).
   The dialer opens with `tel:`.
4. Back in the app, the sheet is now **"Call logged"**:
   - "Optional. How did it go with Name?";
   - a dropdown, "No outcome yet" plus 9 outcomes;
   - "Add a remark…";
   - **Skip** or **Save**.
5. **Save** patches the call event (`PATCH …/remark/:eventId {text, outcome}`). `no_answer` and `unreachable` auto-advance the status to "Call Not Received" (`routes/actions.ts:129`).
6. A next step is booked only when the agent opens another sheet: FAB → **Schedule follow-up** (X3).

**Other ways in to the same write**
- **Record outcome**, the dark button beside STATUS. It opens LogCallModal, "Record call · Name" or "Record outcome · Name" (`Modals.jsx:614`):
  - It attaches to today's call by the same person that has no outcome yet, or logs a fresh call.
  - It has a "What happened" dropdown (Pick one + 9) and Remark. Save stays disabled until one is filled.
  - Only **"Asked to call back"** reveals a date and time picker, and only on a lead (`Modals.jsx:631`). On an owner it books nothing.
- **"Add outcome & remark"**, a link on every timeline row, including remarks and bookings. It opens the history's own OutcomeForm.
- **The desk's Call**, a `tel:` link that logs the call. The outcome then goes through Record outcome.

**The 9 call outcomes** (`src/data/callOutcomes.js`), with the reach each one stands for:
- Connected · discussed requirements (answered)
- Interested · scheduling a site visit (answered)
- Asked to call back (answered)
- Call not received (not received)
- Busy or switched off (busy or off)
- Sent details on WhatsApp (answered)
- Already booked elsewhere (answered)
- Wrong number (wrong number)
- Not interested (answered)

The same list is offered for an owner.

**Writes**
- `crm_timeline_events` `call`, with `metadata.outcome`.
- An audit row: `contact_action.logged` (2,658 / 1,041) and `contact_action.updated` (1,054 / 553).
- Sometimes `stage_change` (auto) or `follow_up`.

**Ends**
- Skip or Save closes the sheet. A toast confirms Save.
- Nothing moves the agent to the next person. The agent goes back, then picks the next row.

**Branches**

| What happened | What the agent does today | What gets written |
|---|---|---|
| No answer | "Call not received" in the dropdown → Save | outcome; status → Call Not Received. No retry is booked unless the agent opens Schedule follow-up |
| Busy or switched off | as above | the same |
| Wrong number | "Wrong number" → Save | outcome only. The lead stays open and the status does not change |
| Asked to call back | Record outcome → "Asked to call back" → pick a date and time → Save. Or STATUS → Callback opens "Callback: name" and books it with the status (`store.jsx:1328`) | outcome + `follow_up` + status. On an owner: Schedule callback is a separate FAB item with its own picker |
| Talked, interested | outcome, then STATUS, then FAB → Schedule follow-up | three sheets |
| Not interested / closed | **Mark as rejected** → reason → "Anything to add" → save | status Rejected + `rejection_reason` |
| Agent skips the outcome | **Skip** | a `call` with no outcome. Shows on Performance as "Calls with no result written" |

**Production**
- With an outcome: 14% of lead calls at bhumi and 54% at mahalaxmi; 38% / 12% of owner calls.
- 46 / 29 follow-up events against 1,105 / 828 lead calls.
- 0 owner callbacks booked.
- Bhumi's owner calls reached 483 different owners in 495 calls, so a no-answer was almost never tried again.

### X2. WhatsApp a lead or owner
- **Phone, from a row or the record's WhatsApp button:**
  1. The "WhatsApp" sheet: "This records an action and will redirect you to your WhatsApp. Continue?" → **Yes, continue**.
  2. `contact-log {channel:'wa'}`.
  3. WhatsApp opens with the firm's follow-up message (`followUpMessage` with the intro template).
  4. Back in the app: **"WhatsApp logged"**, with 6 message outcomes (Details shared, Sent after an unanswered call, Replied · discussed / coming for a visit / not looking, No reply yet) → Skip or Save.
- **Desk:** Quick actions → **WhatsApp** opens the composer (WaModal, `store.openWhatsApp`). There the agent picks or edits the text, then sends. The composer is not offered on the phone: `PhoneActions.jsx` filters `whatsapp` out of the lead FAB.
- **Owner record on a phone:** WhatsApp shows twice, as the record button and as the first FAB item.
- **Writes:** a `whatsapp` event (+ outcome).
- **Used:** 895 / 91 on leads (72 / 16 with an outcome); 162 / 4 on owners.

### X3. Book, move or clear a next step
- **Lead:**
  1. FAB (phone) or the NEXT FOLLOW-UP card (desk) → **Schedule follow-up** / **Reschedule follow-up**.
  2. The sheet is "Schedule follow-up: Name":
     - **Activity Type** chips: Follow-up Call, Site Visit, Online Demo.
     - **Date** day chips, or "Pick Custom Calendar Date".
     - **Time Slot** chips: 10:30 am, 11:30 am, 2:30 pm, 4:30 pm, 6:00 pm, or "Enter Exact Time".
     - "Agenda or location (optional)".
     - **Confirm Appointment**, enabled only once a time is picked.
  3. Toast: "Follow-up scheduled: Site Visit on 2026-11-02 at 4:30 pm".
- **Owner:**
  1. FAB → **Schedule callback** / **Reschedule callback**.
  2. Presets: In 2 hours, Later today, Tomorrow morning, In 3 days, Next week. "Call back at" is a datetime field, and "What to say (optional)".
  3. **Schedule**, or **Clear callback**.
  4. FAB → **Callback done** clears it with no outcome ("Clears it from the queue", `definitions.jsx:787`).
- **Writes:** `crm_leads.follow_up` + a `follow_up` event, or `crm_owners.callback_at`.
- **Ends:** the toast. The NEXT card updates.
- **Branches:** the follow-up closes itself on the next logged call (calls) or visit (visits). A meeting closes through Done (A7).
- **Used:** 32+10 / 14+13 bookings; 0 owner callbacks at both firms.

### X4. Site visit: book, the day of, log how it went
- **Book:** X3 with Site Visit, or a buyer's visit ask confirmed (A19).
- **The day of:**
  - Today shows the row with **Log visit**.
  - The `site_visit_reminder` alert fires (30 / 18 sent, 3 / 2 read).
  - On the phone record, **Log visit** becomes the first full-width button.
- **Log (VisitProofModal, `Modals.jsx:1949`):**
  1. Location permission first. With no fix, there is no visit.
  2. A live camera photo; the gallery is not allowed.
  3. Outcome: Interested, Negotiating, Booked, Not interested or No show.
  4. A remark (optional).
  5. Save. The server re-checks the location and the photo.
- **Writes:** an `activities` row (type `site_visit`, photo, geo, outcome); the booked visit closes; the status may auto-advance.
- **Branches:**
  - Location denied: the visit cannot be logged.
  - A visit with nothing booked: FAB → **Log site visit**.
- **Used:** 6 / 1 visits logged.

### X5. Change a lead's or owner's status
- **Ways in:**
  1. The status pill on a list row is a menu (`StageCell`, `collections.jsx`). Its last item is **Mark as rejected**.
  2. The record's **STATUS** dropdown.
  3. **Mark as rejected** button → RejectLead/RejectOwner: a reason, then "Anything to add (optional)".
  4. Automatic moves:
     - a no-answer outcome → Call Not Received;
     - a proven visit → Site Visit;
     - any call or WhatsApp to a calling-list owner → Contacted (`noteOwnerContact`; 637 of bhumi's 937 owner status events).
  5. Choosing **Callback** opens the callback booking (X1 table).
  6. The final stage reveals **Close the deal** (lead) or **Convert to property** (owner).
- **Writes:** `stage_change` events (titles like "New → Interested", "Stage → Contacted"), `rejection_reason`.
- **Branches:** a rejected lead that enquires again reopens at New, and the record shows "Was rejected: reason".
- **Used:** leads 1,036 / 1,134 (697 / 214 by the system); owners 937 / 580. The firm owner changed 21 / 16. Rejection titles are stored in two spellings, "Rejected: No Requirement" (at least 72) and "Rejected — No Requirement" (at least 28), at bhumi (counted from the 30 most common titles).

### X6. Send homes or the catalogue on WhatsApp
- **Ways in:**
  - a property's **Send** (record button or FAB);
  - "Send" beside a matched buyer on a property;
  - on a lead, tick flats under SHORTLISTED AND MATCHING FLATS → send;
  - the BuyerAsk **Send**.
- **SendSheet steps:**
  1. **Choose a recipient**: matched buyers are offered first.
  2. **Show price** toggle; "Add to the catalogue".
  3. If the sender has no number yet, the step "Your mobile number" comes first.
  4. "Link ready for Name" → WhatsApp.
- **Writes:**
  - `crm_share_links` (`share_link.create`);
  - a `share` event on the lead;
  - later, D1 and D2 events.
- **Branches:**
  - The number belongs to a colleague's lead: the "held" step, and the `share_number_held` alert to them.
  - Settings → Sharing → Stop all sharing turns off every link.
- **Used:** 13 links by 2 people at bhumi; 0 at mahalaxmi.

### X7. Walk the calling list (owners)
- **Trigger:** an agent with hundreds of owners to ring (bhumi: 1 caller, 495 calls in 60 days).
- **Steps on a phone:**
  1. Calling tab: a STATUS dropdown and "By project", then pills (All 368, Callbacks overdue, Callbacks later today, Callbacks, New, Call Not Received), then project cards ("Godrej Green Vistas · 362 owners · 349 to call · 4 interested").
  2. Tap the project. The list is sorted by name, so "Unnamed owner" rows come first (`ui-review/p-agent-calling-project.png`).
  3. Tap an owner. The record shows the number in the title when unnamed, then the project and unit, **Call** and **WhatsApp**, STATUS, **Record outcome**, **Mark as rejected**, DETAILS and CALL HISTORY.
  4. **Call** → X1, steps 2 to 5.
  5. Back, back to the list, then the next owner. The list has no "next" control.
- **Writes:** as X1, plus the owner status auto-moving to Contacted.
- **Ends:** never. There is no end-of-batch state.
- **Branches:**
  - No answer: nothing books a retry. "Asked to call back" on an owner books nothing (X1).
  - Interested: status, then later Convert to property (A13).
  - Wrong number or do not call: status menu → Do Not Call or Mark as rejected.
- **Used:** mahalaxmi has 3,301 of 3,737 owners still at New.

### X8. An alert, and acting on it
- **Trigger:** a push, or the bell count.
- **Steps:**
  1. The bell opens the drawer: "Notifications · N new", **Mark all read**, and tabs **All (n) / Unread (n) / Assignments (n)**.
  2. Tap one. It marks that one read and goes to its record or list:
     - `lead=` → the lead;
     - `alert=` → Leads filtered "From alert";
     - `agent=` → Leads filtered to that agent (`Modals.jsx:2370-2392`).
- **The alerts** (`notificationCatalogue.ts`):
  - **Assignment:** `lead_assigned`, `lead_assigned_bulk`, `lead_reassigned`, `owner_assigned`, `owner_reassigned`.
  - **Arrival and repeats:** `lead_unrouted` (desk), `lead_repeat`, `lead_untouched`.
  - **Bookings:** `followup_due`, `site_visit_reminder`, `calendar_task_assigned`.
  - **Agreements:** `agreement_ending`.
  - **Buyer activity:** `share_interested`, `share_expired_open`, `share_returned`, `share_number_held`, `buyer_callback`, `buyer_visit`, `buyer_homes`, `buyer_new_homes`.
  - **Loops:** `lead_reassign_loop` and `owner_reassign_loop` (desk).
  - **Feeds:** `feed_silent` (owner).
  - **Remarks:** `remark_added`.
- **Ends:** the record. Some alerts close when the work is done (`alertLifecycle.ts`).
- **Seen on dev:** "Follow-up due now" from 18 days ago and "Site visit due now" from 60 days ago, both still unread (`ui-review/p-agent-notifs.png`).
- **Used:** 9 to 10% of alerts are ever read.

### X9. Search, filter and sort a list
- **Leads, phone:**
  - **TYPE** and **STATUS** dropdowns.
  - Pills from `leadSegments.ts`: All, Today, Not contacted, Going cold, Follow-up overdue, Came back.
  - **Search leads**.
  - A funnel button opens the "Filter & sort" sheet:
    - SORT BY: Date arrived, Last activity, Budget, Name, Stage; Ascending / Descending;
    - SOURCE and LOCALITY chips with counts from the server;
    - a "FROM ALERT" heading with no options;
    - **Show N leads**.
  - Rows add 20 at a time with "Load 20 more".
- **Leads, desk:** the same, plus **AGENT**, a "Filter" chip builder, a SORT dropdown, a grid/table switch, and **New lead**. Sortable columns. The global search is in the top bar.
- **Everything lives in the URL** (`nav.js`: `seg, intent, stage, sortKey, sortDir, q, source, locality, agent, flag, alert`). Opening a record keeps the filters. A tab tap clears them.
- **Calling:** Status, Agent, project grouping, the pills above, Filter (Tower, Configuration) and the Sort list.
- **Properties:**
  - Pills: All, Available for sale, Available for rent, Blocked, Sold, Leased.
  - "Group by project".
  - 17 filter fields grouped Where / What / State / Condition / Sale only, and 5 sorts.
- **Contacts:** Landlords / Sellers / All, Project, Locality, and Sort.

### X10. Assign, reassign, take back
- **One lead:**
  - Desk: the Agent cell menu on the row, or More actions → **Reassign owner** → pick a person.
  - Phone (desk roles): FAB → **Reassign owner**.
- **Many:** desk → tick rows → **Bulk assign** → pick a person, or "Unassign", which reads "Take back N from X?".
- **Calling:** per row; per project with **Assign** (AssignProject); or **Select** (desk, and the manager's phone).
- **A seat:** Team → Reassign seat moves a leaver's leads and owners to the new person.
- **Routing:** new leads go round-robin by the firm's rules. The idle-owner sweep can move owners nobody has touched.
- **Writes:** `agent_id`, plus an `assignment` event through `recordAssignment()`; alerts `lead_assigned_bulk` and `owner_assigned`.
- **Used:** 830 lead and 1,617 owner assignment events at bhumi; 363 and 1,836 at mahalaxmi.

### X11. Properties: add, edit, status, verify, catalogue
- **List:** project cards ("Lakeview Residency · 6 units · 5 available · PRICE RANGE"). Tap a project → unit cards (config, deal, tower and number, status, area, floor, QUOTED PRICE, "144 buyers").
- **Record:**
  - title, price, deal;
  - **Send** and **Edit**;
  - STATUS;
  - PHOTOS (drag/browse, camera);
  - OVERVIEW, DETAILS, INTERNAL · NEVER SHARED;
  - AGREEMENTS;
  - OTHER UNITS IN the project;
  - OWNER · INTERNAL (**Edit owner**, **Call owner**, **WhatsApp**);
  - INTERESTED TENANTS/BUYERS, "4 matched", each with **Send**;
  - HISTORY.
- **Actions:**
  - **Set status**: Available, Blocked, Sold, Leased.
  - **Mark as verified** / **Remove verified**.
  - **Send owner an update**: a WhatsApp to the landlord.
  - **Copy listing details**.
  - **Duplicate for another flat**.
  - "In catalogue" on the desk.
- **Writes:** `crm_properties` and `stage_change` / `price` / `media` / `catalogue` events.
- **Used:** 82 / 24 added; 13 / 6 media events.

### X12. Payment bar
- **Who sees what:**
  - Owner or manager: "Payment due {date} · ₹X · Plan" when due soon, or "Payment pending since {date}…" when overdue. On the desk it opens Settings → Billing.
  - Agents: "Payment pending · ask your manager or owner", only when overdue.
- **Hiding it:** × hides it for this browser session, per firm per period.
- **Clearing it:** Mark paid in the console clears it on the next `/workspace/pulse`.
