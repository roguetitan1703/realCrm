# Pick lists

Every fixed set of choices in the app: what it is called, where a person meets it, its values in order, the default, whether a firm can change it, and where it lives in code. Read from the code on 1 Nov 2026; when the code and this page disagree, the code wins and this page is out of date.

"Firm can change" means Settings (or Connections) lets the firm edit it. Where a stored value differs from the shown label it is written `value (label)`.

## Leads

### Lead statuses (stages)
- **Shows:** Leads list pills, record status control, Settings > Stages > Leads, dashboard.
- **Values:** New, Follow-Up, Callback, Call Not Received, Interested, Site Visit, Deal Closed, Rejected.
- **Default:** New (the first one; `NEW_STATUS`).
- **Firm can change:** yes, except Deal Closed and Rejected, which are fixed. Those two can carry a different shown name (`stageLabels`), nothing else. The others can be renamed, added, removed (leads move to the first stage) and reordered. A new firm starts with the eight above.
- **Code:** `src/data/leadStatus.js` `LEAD_STATUSES`, `TERMINAL_STATUSES`; `backend/src/services/store.ts` `LEAD_STATUSES` (a second copy, checked equal by `npm run check:vocab`); roles in `src/data/pipelineRoles.js` (`LABELLED_LEAD_STAGES`, `DEFAULT_FINAL.leads`); the firm's own list is `crm_settings.stages`.

### Rejection reasons (leads)
- **Shows:** "Mark as rejected" sheet.
- **Values:** Not Answering, Budget Mismatch, Locality Mismatch, Broker, Already purchased / rented, No Requirement, Want Ready-To-Move, Negotiation Failed, Others.
- **Default:** Not Answering (first, pre-selected).
- **Firm can change:** no.
- **Code:** `src/data/leadStatus.js` `REJECTION_REASONS`.

### Call outcomes
- **Shows:** call sheet (Record call / Record outcome), the outcome step after Call, the remark editor on a call, activity reports. Used for leads and owners alike.
- **Values (stored value, shown label, reach):** discussed (Connected · discussed requirements, answered); visit (Interested · scheduling a site visit, answered); callback (Asked to call back, answered); no_answer (Call not received, no_answer); unreachable (Busy or switched off, unreachable); details_sent (Sent details on WhatsApp, answered); booked_elsewhere (Already booked elsewhere, answered); wrong_number (Wrong number, wrong_number); not_interested (Not interested, answered).
- **Default:** none. The sheet starts at "Pick one" so nobody records "Connected" by not touching it.
- **Firm can change:** no.
- **Code:** `src/data/callOutcomes.js` `CALL_OUTCOMES`, `CALL_REACH`. The backend imports this file (`activityReport.ts`).

### WhatsApp outcomes
- **Shows:** outcome step after a WhatsApp is logged.
- **Values:** wa_details_sent (Details shared), wa_after_no_answer (Sent after an unanswered call), wa_discussed (Replied · discussed requirements), wa_visit (Replied · coming for a visit), wa_not_looking (Replied · not looking), wa_no_reply (No reply yet).
- **Default:** none ("No outcome yet").
- **Firm can change:** no.
- **Code:** `src/data/callOutcomes.js` `WA_OUTCOMES`.

### Visit outcomes
- **Shows:** finishing a site-visit follow-up.
- **Values:** interested (Interested), negotiating (Negotiating), booked (Booked), not_interested (Not interested), no_show (No show).
- **Default:** none.
- **Firm can change:** no.
- **Code:** `src/data/callOutcomes.js` `VISIT_OUTCOMES`.

### Visit feedback: reasons a flat was rejected
- **Shows:** site-visit feedback sheet (Liked / Rejected, then a reason).
- **Values:** Price / budget, Vaastu / facing, Floor, Location, Noise, Size / layout, Furnishing, Parking.
- **Default:** Price / budget (first).
- **Firm can change:** no.
- **Code:** `src/data/leadStatus.js` `VISIT_REJECT_REASONS`.

### Follow-up kinds
- **Shows:** schedule-a-follow-up sheet. One list, `src/data/followUpKinds.js` `FOLLOW_UP_ACTIONS` (the rail has no scheduler of its own).
- **Values:** Follow-up Call, Site Visit, Online Demo. A kind already booked but not on the list is added to the front.
- **Default:** Follow-up Call.
- **Firm can change:** no (the message templates for them are editable in Settings > Message templates).
- **Code:** `src/data/followUpKinds.js` `FOLLOW_UP_ACTIONS`, `DEFAULT_FOLLOW_UP_ACTION`; kind detection `followUpKindOf` (visit, meeting/demo, call); rail: `src/components/rail.jsx` `Scheduler`.

### Callback presets
- **Shows:** "Schedule callback" on a lead or owner.
- **Values:** In 2 hours, Later today (5 pm), Tomorrow morning (11 am), In 3 days (11 am), Next week (11 am), plus an exact date and time.
- **Default:** none picked.
- **Firm can change:** no.
- **Code:** `src/modules/Modals.jsx` `CALLBACK_PRESETS`.

### Lead sources
- **Shows:** Source select on a lead, Leads filter, dashboard "Leads by source".
- **Values:** the firm's own list. A new firm starts with 99acres, MagicBricks, Walk-in, Referral, Website. The list the screens read is derived from the firm's connections plus sources already on leads. Connections suggests 99acres, MagicBricks, Housing.com, Meta Lead Ads, Website form. An imported lead's source is "Spreadsheet import".
- **Default:** Not stated.
- **Firm can change:** yes (Connections adds a source; a lead carries whatever source arrived).
- **Code:** `backend/src/services/store.ts` (new-firm `settings.sources`, boot payload `sources`); `src/modules/Connections.jsx` `SUGGESTED`; `src/components/ModuleFields.jsx` (`source` field).

### Lead requirement fields (what a lead wants)
| Field | Shows | Values | Default | Firm can change | Code |
|---|---|---|---|---|---|
| Deal type | Lead sheet, New lead form | sale (Buy), rent (Rent) | none | no | `propertyFields.js` `DEAL_LEAD` |
| Category | Lead sheet | residential, commercial | none | no | `propertyFields.js` `CATEGORIES` |
| Property type | Lead sheet | the subtypes of the chosen category (see Properties) | none | no | `propertyFields.js` `SUBTYPES` |
| Requirement Config | Lead sheet | every room count x Apartment / Villa / Independent House, then every commercial subtype, plus configurations the firm's stock holds; sorted | none | partly (stock adds to it) | `ModuleFields.jsx` `req.config` options, `BHK_FILTER` |
| Preferred Locality | Lead sheet | localities the firm already has (free text on the form) | none | derived from the firm's data | `src/lib/suggest.js` `localities` |
| Possession Target | Lead sheet | Immediate, Within 30 days, Within 60 days, Within 90 days, Flexible | none | no | `ModuleFields.jsx` `POSSESSION_TARGETS` |
| Budget from / to | Lead sheet | numbers, not a list | none | n/a | |

## Owners (Calling)

### Calling statuses
- **Shows:** Calling list steps, owner record status control, Settings > Stages > Calling.
- **Values:** New, Call Not Received, Incoming Not Available, Switch Off, Contacted, Interested, Key Received, then the two endings Not Interested, Do Not Call. (`Callback` is no longer a status; old rows keep it.)
- **Default:** New.
- **Firm can change:** yes, except the two endings (fixed, always last). One non-ending status is the "final" one that offers Convert to property; default Key Received, changeable with "Make final".
- **Code:** `src/data/ownerStatus.js` `OWNER_STAGES`, `OWNER_TERMINAL_STATUSES`, `OWNER_STATUSES`; `src/data/pipelineRoles.js` `DEFAULT_FINAL.calling`; the firm's own list is `crm_settings.ownerStages`.

### Owner rejection reasons
- **Shows:** "Mark as rejected" on an owner; the reason picks the ending.
- **Values (reason, ends as):** Said not interested (Not Interested); Not selling or renting (Not Interested); Already with another agency (Not Interested); Asked us not to call again (Do Not Call); Wrong number (Do Not Call); Never answers (Not Interested).
- **Default:** first row for the chosen ending.
- **Firm can change:** no.
- **Code:** `src/data/ownerStatus.js` `OWNER_REJECTION_REASONS`.

### Owner call outcomes
Owners use the same call outcomes as leads (above). There is no owner-only outcome list. Imports map a sheet's status text to a status with `statusFromSheet` in `src/data/ownerStatus.js`.

### Owner calling pills
- **Values:** Callbacks overdue, Callbacks later today, Callbacks, Unassigned (fallback; the server sends the live set).
- **Code:** `src/data/ownerStatus.js` `OWNER_SEGMENT_FALLBACK`. Lead pills are `backend/src/services/leadSegments.ts`.

## Properties

Form defaults: category residential, deal sale, subtype apartment, area unit sq.ft, status Available. Everything else is "Not stated" until filled. None of these is firm-editable. All live in `src/data/propertyFields.js` unless noted.

| Pick list | Shows | Values (stored value, label where different) | Export |
|---|---|---|---|
| Category | add form, filters | residential, commercial | `CATEGORIES` |
| Deal | add form | sale (Sell), rent (Rent / Lease) | `DEALS` |
| Property type | add form, filters | Residential: apartment, independent_house (Independent House), duplex, independent_floor (Independent Floor), villa, penthouse, townhouse, studio, farm_house (Farm House), plot (Plot / Land). Commercial: office (Office Space), shop (Shop / Retail), showroom, warehouse (Warehouse / Godown), industrial (Industrial Building), coworking (Co-working), plot (Commercial Plot / Land) | `SUBTYPES` |
| Transaction | add form (sale) | new (New), resale (Resale) | `TRANSACTION` |
| Possession | add form (sale) | ready (Ready to move), under_construction (Under construction) | `POSSESSION` |
| Ownership | add form (sale, not under construction) | freehold, leasehold, power_of_attorney (Power of Attorney), cooperative (Co-op society) | `OWNERSHIP` |
| Configuration (BHK) | add form, filters | 1, 2, 3, then 1rk, 1.5, 2.5, 3.5, 4, 4.5, 5, then 6 to 12, 5plus. Labels follow the firm's locale (BHK or bedroom). The filter shows 1rk, 1, 2, 3, 4, 5, 5plus | `BHK`, `BHK_COMMON`, `BHK_MORE`, `BHK_LARGE`, `BHK_FILTER` |
| Bathrooms / balconies | add form | counts, with a top that depends on bedrooms (bathrooms 1 to 4-9 then "n+", balconies 0 to 3-9 then "n+") | `countsFor`, `COUNT_0_4`, `COUNT_1_4`, `COUNT_0_3` |
| Floor words | add form | basement, lower_ground (Lower Ground), ground, stilt, or a number | `FLOOR_TOKENS` |
| Area type | add form | carpet, builtup (Built-up), super_builtup (Super built-up), plot | `AREA_TYPES` |
| Area unit | add form | sqft (sq.ft), sqm (sq.m) | `AREA_UNITS` |
| Facing | add form, filters | north, east, west, south, north_east, north_west, south_east, south_west (shown North-East etc.) | `FACING` |
| Status | record, filters | Available, Token Pending, Under Offer, Sold, Leased, Blocked, Off-Market | `STATUS` |
| Furnishing | add form | full (Fully Furnished), semi (Semi Furnished), none (Unfurnished) | `FURNISH` |
| Fixtures | add form | Dining Table, Washing Machine, Cupboard, Sofa, Microwave, Stove, Fridge, Water Purifier, Gas Pipeline, Chimney, Modular Kitchen | `FIXTURES` |
| Counted items | add form | Fan, Light, AC, Wardrobe, TV, Bed, Geyser | `COUNTED_ITEMS` |
| Society amenities | add form | Power Backup, Lift, Gym, Swimming Pool, Intercom, Garden, Sports, Kids Area, CCTV, Gated Community, Club House, Community Hall, Regular Water Supply, Attached Balcony | `SOCIETY_AMENITIES` |
| Preferred tenants | add form (rent, residential) | family, bachelors, company | `TENANT_TYPES` |
| Bachelor preference | add form | both (Open for both), men (Men only), women (Women only) | `BACHELOR_PREF` |
| Maintenance | add form (rent) | included (Include in rent), separate (Separate) | `MAINTENANCE_MODE` |
| Deposit | add form (rent) | none, 1mo (1 month), 2mo (2 months), custom | `DEPOSIT_OPTIONS` |
| Lock-in | add form (rent) | none, 1mo (1 month), 6mo (6 months), custom | `LOCKIN_OPTIONS` |
| Painting charges | add form (rent) | none, as_per_cost (As per cost), 1mo (1 month), custom | `PAINTING_CHARGES` |
| Price includes | add form (sale) | PLC, Car Parking, Club Membership | `PRICE_INCLUDES` |
| Open sides | add form (plot) | 1, 2, 3, 4 | `OPEN_SIDES` |
| Consulting days | add form | none, 15d (15 days), 30d (30 days), custom | `CONSULTING_DAYS` |
| Consulting percent | record | none, 1 (1%), 2 (2%), custom | `CONSULTING_PERCENT` |
| Key / access | add form, record (Internal) | Keys in office, Call owner before visit, Owner lives there, Tenant lives there, With a broker, or "Other" typed text (a stored value not on the list is kept as typed) | `KEY_ACCESS` (picker `PickOrOther`) |
| Locality | add form (properties and owners), filters | not a fixed list. The firm's own localities are offered, "Add new" types one; an unlisted stored value is kept | `src/lib/suggest.js` `localities`; `ModuleFields.jsx` `locality` |
| Project / society | add form, calling, agreements | not fixed; the firm's own project names are suggested | `suggest.js` `projectNames` |

## Agreements
- **Kind:** rent, sale. Shown Rent / Sale on the form. Code: `src/components/Agreements.jsx`, `backend/src/services/agreements.ts`.
- **Status (stored, not picked):** active, ended, renewed. Filters: Ending soon (rent, active, ending within the soon window), Past (ended or renewed).
- **Flat details for a flat outside the catalogue:** property type = `SUBTYPES.residential`; configuration = all of `BHK`, as the add-property form; default Not known.
- **Default kind:** rent. **Firm can change:** no.

## Team and access
- **Roles:** owner (shown Owner; `admin` also shows Owner), manager (Manager), agent (Agent), superadmin (Delpat; platform only). Adding a team member offers only Agent and Manager (labels from `roleLabel`). Desk roles (admin, owner, manager) see the whole book. Code: `src/lib/permissions.js` `ROLE_LABELS`, `DESK_ROLES`; `src/modules/Team.jsx`; `src/modules/Admin.jsx`.
- **Account status:** active, suspended (a suspended member is signed out and gets no new work). Code: `Team.jsx`.
- **Duty status:** ACTIVE, OFF_DUTY, ON_LEAVE; the last two take no new leads when the firm has no rota. Code: `backend/src/services/workforce.ts` `ON_DUTY`.
- **Client role (Contacts):** Buyer, Tenant, Owner, Investor, Channel Partner. Code: `src/components/ModuleFields.jsx` `CLIENT_MODULE_SCHEMA`.

## Everything else with a fixed set
- **Message language:** English, Marathi (`src/data/vocabLocale.js` `MESSAGE_LANGUAGES`).
- **Page size:** 10, 20, 50, 100 (`src/components/primitives.jsx` `PAGE_SIZE_OPTIONS`).
- **Share-link expiry:** 7, 15, 30 days (`src/modules/Settings.jsx` `EXPIRY_DAYS`).
- **Working hours, response time, "gone cold after":** hour and number pickers in Settings > Response times.
- **Activity reach (reports):** answered, no_answer, unreachable, wrong_number, no_outcome, replied, messaged (one list, `src/data/callOutcomes.js` `CALL_REACH`; ActivityDay and AgentWork read it).
- **Import fields (mapping targets):** `src/lib/importSchema.js` `PROPERTY_FIELDS`, `LEAD_FIELDS`, `OWNER_FIELDS`; connection mapping targets `src/modules/Connections.jsx` `TARGETS`.
- **Brand colour presets:** `src/modules/Settings.jsx` and `src/modules/Admin.jsx` `COLOR_PRESETS`.

## Disagreements
Found while reading; not fixed here. The rest were fixed 1 Nov.

- **Owner source is free text** (`OWNER_MODULE_SCHEMA`). A lead's source is the firm's portal list (99acres and the like); an owner's comes from a cold-call sheet or an import, so those portals do not fit and a second list would be invented. Left as is.
- **`admin` and `owner` both read "Owner".** Deliberate: `admin` is a legacy alias that exists in code and on no real tenant (`src/lib/permissions.js` `ROLE_LABELS`).
- **Server-only legacy values** (owner `Callback`) are listed once in `scripts/check-vocabulary.mjs` `SERVER_ONLY_LEGACY`; the guard fails the build if the backend and web status lists otherwise differ.
