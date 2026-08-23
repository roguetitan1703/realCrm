import { useEffect, useMemo, useState } from 'react'
import { ListLayout } from '../layouts/layouts.jsx'
import { ModuleListView, ModuleCards, ModuleTable, SelectDropdown } from '../components/collections.jsx'
import { ModuleDetail } from '../components/ModuleDetail.jsx'
import { Button, Timeline, Avatar, CappedList } from '../components/primitives.jsx'
import { asList, thumbTint, initials, unitLabel, budgetRange, whenLabel, followUpLabel, followUpOverdue, followUpAction, nextStepOf } from '../lib/format.js'
import { matchesForLead } from '../lib/matching.js'
import { useRecord } from '../lib/useRecord.js'
import { canEditLead, canAssignLead, canDeleteRecord } from '../lib/permissions.js'
import { LEAD_STATUSES } from '../data/leadStatus.js'
import { useServerList } from '../lib/serverList.js'
import { api } from '../lib/api.js'
import Icon from '../components/Icon.jsx'
import { LEADS_DEF } from './definitions.jsx'

// A scheduled appointment's action reads like "Site Visit — Anita Rao", so the
// type is a prefix rather than its own field. Matched loosely because the
// label is user-facing text that has changed spelling before.
function isSiteVisit(followUp) {
  return /site\s*visit/i.test(followUp?.action || '')
}

/**
 * Every number beside the list, under the same filters the list is under.
 *
 * `params` is the filter bag, not just a refresh token. It took no arguments —
 * so picking an agent moved the rows and left the pills, the status counts and
 * the Type split all describing the whole desk. Each facet's own dimension is
 * dropped server-side, so choosing "No reply" narrows the status counts while
 * the segment pills keep showing what switching to another one would give you.
 *
 * The previous counts are kept while a new bag is in flight. Blanking them
 * makes every pill flash to 0 on each keystroke, which reads as the filter
 * having emptied the list.
 */
function useLeadsSummary(dataAsOf, params) {
  const [counts, setCounts] = useState({})
  const key = JSON.stringify(params || {})
  useEffect(() => {
    let live = true
    api.getLeadsSummary(params).then(r => { if (live && r?.success) setCounts(r.summary) }).catch(() => {})
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataAsOf, key])
  return counts
}

/**
 * Leads is a ROUTER and holds no hooks of its own — same reason as Properties:
 * returning the record takeover from the middle of the list component rendered
 * fewer hooks than the list did, and React threw on the way back.
 */
export default function Leads(props) {
  const { store, go, sel, setSel, topBar, phone } = props
  if (sel.leadOpen && sel.leadId) {
    return <LeadRecord store={store} go={go} sel={sel} setSel={setSel} topBar={topBar} phone={phone} />
  }
  return <LeadList {...props} />
}

function LeadList({ store, go, sel, setSel, topBar, phone }) {
  const { state } = store

  // ── ONE FILTER, IN THE URL ────────────────────────────────────────────────
  // Segment, stage, intent, the panel's fields and the sort were five separate
  // useStates on this component. That made every one of them invisible to the
  // URL, to history, to a reload — and, because <Leads> swaps this whole
  // component out for the record when a row is opened, to the trip into a lead
  // and back. Filter the book, open a lead, come back: the list was unfiltered
  // and nothing on screen said why.
  //
  // They live in `sel.leadFilters` now, which nav.js mirrors into the query
  // string. Reloading keeps the view, back restores it, and the filtered list
  // is a link somebody can send. `q`, the page and the selection stay local on
  // purpose: a history entry per keystroke is not navigation.
  const f = sel.leadFilters || {}
  const seg = f.seg || 'all'
  const intent = f.intent || 'all'
  const stage = f.stage || 'all'
  const sortKey = f.sortKey || 'activity'
  const sortDir = f.sortDir || 'asc'
  const flt = useMemo(() => {
    const o = {}
    for (const k of ['source', 'locality', 'agent', 'flag']) if (f[k]?.length) o[k] = f[k]
    return o
  }, [JSON.stringify(f)])

  const [q, setQ] = useState('')
  const [view, setView] = useState('list')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  // Which rows are checked, on the page currently shown. A Set of lead ids.
  const [selected, setSelected] = useState(new Set())

  // Any filter change is a new first page and drops a selection made against
  // rows that are about to be replaced.
  const patchFilters = (patch) => {
    setSel(s => {
      const next = { ...(s.leadFilters || {}), ...patch }
      for (const k of Object.keys(next)) {
        const v = next[k]
        if (v === undefined || v === null || v === 'all' || (Array.isArray(v) && !v.length)) delete next[k]
      }
      return { ...s, leadFilters: Object.keys(next).length ? next : undefined }
    })
    setPage(1)
    setSelected(new Set())
  }

  const setFltP = (v) => patchFilters({
    source: v?.source, locality: v?.locality, agent: v?.agent, flag: v?.flag,
  })
  const setQP = (v) => { setQ(v); setPage(1); setSelected(new Set()) }
  const setSortKeyP = (v) => patchFilters({ sortKey: v })
  const setSortDirP = (v) => patchFilters({ sortDir: v })
  const setSegP = (v) => patchFilters({ seg: v })
  // The Agent control is single-value on screen and an array in the URL — the
  // server has taken a comma list since the panel offered multi-select, and a
  // link somebody sent with two agents in it still has to open.
  const setAgentP = (v) => patchFilters({ agent: v === 'all' ? undefined : [v] })
  const setIntentP = (v) => patchFilters({ intent: v })
  const setStageP = (v) => patchFilters({ stage: v })
  const setPageSizeP = (v) => { setPageSize(v); setPage(1) }
  const setPageP = (v) => { setPage(v); setSelected(new Set()) }

  const role = state.role
  const canAssign = canAssignLead(role)
  // Two agents in the URL is a link from before this was one control; it shows
  // as All rather than silently claiming to be one of them.
  const agentSel = (f.agent?.length === 1) ? f.agent[0] : 'all'

  // One page from the server. The agent's own-pipeline scope is applied in the
  // query, not by filtering an array here — a filter the client applies is a
  // display choice, not a permission.
  const source = useServerList(
    (params) => api.listLeads({
      page: params.page,
      limit: params.limit,
      q: params.q,
      segment: seg === 'all' ? undefined : seg,
      intent: intent === 'all' ? undefined : intent,
      stage: stage === 'all' ? undefined : stage,
      // The filter panel's own fields. useServerList spreads them into `params`;
      // they used to stop here, so Source / Locality / Sales Executive / Needs
      // attention changed the chip and nothing else.
      source: params.source, locality: params.locality,
      agent: params.agent, flag: params.flag,
      // Ordering is done in SQL, so the sort headers have to reach SQL. They
      // did not: clicking one flipped the arrow and re-fetched the same order.
      sortKey: params.sortKey, sortDir: params.sortDir,
    }),
    { filters: flt, search: q, sortKey, sortDir, page, pageSize, accumulate: !!phone },
    [state.dataAsOf, seg, intent, stage],
  )

  // THE ONE BAG BOTH REQUESTS ARE BUILT FROM. The rows and the counts have to
  // be the same question asked twice, and the only way to guarantee that is for
  // neither to assemble its own parameters.
  const filterParams = useMemo(() => ({
    q: q || undefined,
    segment: seg === 'all' ? undefined : seg,
    intent: intent === 'all' ? undefined : intent,
    stage: stage === 'all' ? undefined : stage,
    source: flt.source, locality: flt.locality, agent: flt.agent, flag: flt.flag,
  }), [q, seg, intent, stage, flt])

  const onOpen = (l) => go('leads', { leadId: l.id, leadOpen: true })
  // The KPI strip used to sit above these pills reading Total / Overdue /
  // Unassigned — the same three numbers the pills now carry, one row apart,
  // each filtering a different way. Two controls for one question.

  // B2 — sub-segments. The buckets live on LEADS_DEF (definitions.jsx) so the
  // pattern belongs to the module standard, not to this screen. Counts are of
  // what the agent can actually see, so an agent's "Overdue 3" is their three.
  // Pill counts come from Postgres. They used to be `records.filter(...).length`
  // over every lead in the firm, which is the same number only while the whole
  // collection is in the browser. No `?? counts.total` fallback — a segment
  // with a real zero shows 0, not the grand total borrowed from another pill.
  const counts = useLeadsSummary(state.dataAsOf, filterParams)
  // A ZERO PILL STAYS ON SCREEN, DIMMED AND UNCLICKABLE. Hiding it reflows the
  // row on every filter touch, so the pill a thumb is reaching for moves; and a
  // pile that is empty under the current filters is an answer, not an absence.
  // The one you are standing in never disables itself — you have to be able to
  // leave a segment that has just emptied.
  const segs = (LEADS_DEF.segments || []).map(sg => ({
    key: sg.key,
    label: sg.label,
    tone: sg.tone,
    on: seg === sg.key,
    count: counts[sg.key] ?? 0,
    disabled: (counts[sg.key] ?? 0) === 0 && seg !== sg.key,
    onClick: () => setSegP(sg.key),
  }))

  const bulkAssign = () => store.openModal({
    kind: 'bulkAssign',
    leadIds: [...selected],
    onDone: () => setSelected(new Set()),
  })

  // Deleting a selection is the one bulk action with nothing to undo, so it
  // states the number and makes you type nothing but still confirms. The
  // server re-checks permission per record, so a selection that spans leads
  // this person may not delete removes the ones they may and reports the rest
  // rather than failing whole.
  const canDelete = canDeleteRecord(role)
  const bulkDelete = async () => {
    const n = selected.size
    if (!window.confirm(`Delete ${n} lead${n === 1 ? '' : 's'} permanently? This cannot be undone.`)) return
    try {
      const res = await api.bulkDeleteLeads([...selected])
      if (res?.success) {
        setSelected(new Set())
        store.toast(
          res.skipped
            ? `${res.deleted} deleted · ${res.skipped} skipped (not yours to delete)`
            : `${res.deleted} lead${res.deleted === 1 ? '' : 's'} deleted`,
          res.skipped ? 'warn' : 'ok')
        store.reloadServer?.()
      } else {
        store.toast(res?.message || 'Could not delete', 'warn')
      }
    } catch (err) {
      store.toast(err.message || 'Could not delete', 'warn')
    }
  }

  const { header, toolbar, body } = ModuleListView({
    def: LEADS_DEF, source, store, onOpen,
    // Source and Locality come from the desk's own rows with their counts, not
    // from the firm's configured list and not from whatever the browser holds.
    facets: counts,
    filters: flt, onFilters: setFltP,
    search: q, onSearch: setQP,
    sortKey, onSortKey: setSortKeyP, sortDir, onSortDir: setSortDirP,
    segments: segs, view, onView: setView, phone,
    // The toolbar becomes the selection bar rather than a second band appearing
    // above it — see FilterBar. An agent's table never gains checkboxes at all
    // (ModuleTable's `selectable` is already gated on canAssign).
    selection: (canAssign && selected.size > 0) ? {
      count: selected.size,
      actions: [
        { label: 'Bulk assign', icon: 'userPlus', onClick: bulkAssign },
        ...(canDelete ? [{ label: 'Delete', icon: 'trash', tone: 'danger', onClick: bulkDelete }] : []),
      ],
      onClear: () => setSelected(new Set()),
    } : null,
    page, onPage: setPageP, pageSize, onPageSize: setPageSizeP,
    leftAddon: (
      <div className="leads-dd-row">
        <SelectDropdown
          label="Type" value={intent} onChange={setIntentP}
          options={[
            { value: 'all', label: 'All' },
            { value: 'buy', label: 'Sale', count: counts.byIntent?.buy ?? 0 },
            { value: 'rent', label: 'Rent', count: counts.byIntent?.rent ?? 0 },
          ]}
        />
        <SelectDropdown
          label="Status" value={stage} onChange={setStageP}
          options={[
            { value: 'all', label: 'All' },
            ...LEAD_STATUSES.map(s => ({ value: s, label: s, count: counts.byStage?.[s] ?? 0 })),
          ]}
        />
        {/* WHOSE LEADS — a top-level control, not a row inside the filter
            panel. "Show me Binod's desk" is the question a manager asks before
            any other, and it was two clicks deep beside Source and Locality.
            The options and their counts come from the data (an agent who has
            been deactivated still shows while they hold leads), searchable
            because a firm can carry 25, and height-capped so a long list
            scrolls inside the popover rather than off the screen. */}
        {canAssign && (
          <SelectDropdown
            label="Agent" value={agentSel} onChange={setAgentP} searchable
            options={[
              { value: 'all', label: 'All' },
              ...(counts.byAgent || []).map(a => ({
                value: a.value,
                label: a.value === state.activeAgentId ? 'Me' : a.label,
                count: a.count,
              })),
            ]}
          />
        )}
      </div>
    ),
    cta: { label: 'New lead', onClick: () => store.openModal({ kind: 'newLead' }) },
    renderTable: (list, v) => v === 'grid'
      ? <ModuleCards def={LEADS_DEF} rows={list} store={store} onOpen={onOpen} phone={phone} />
      : <ModuleTable def={LEADS_DEF} rows={list} store={store} onOpen={onOpen} sortKey={sortKey} sortDir={sortDir} onSort={setSortKeyP}
          selectable={canAssign} selectedIds={selected} onSelectionChange={setSelected} />,
  })

  return (
    <>
      {topBar({
        title: 'Leads',
        // Bulk import is desk work and has no phone screen, so the phone chrome
        // must not offer a route to one.
        actions: phone ? null : <Button variant="secondary" size="sm" icon="layers" onClick={() => go('import', { kind: 'clients' })}>Import</Button>
      })}
      {header}
      <ListLayout toolbar={toolbar}>{body}</ListLayout>
    </>
  )
}

// The listings worth showing this lead. The server narrows the book to
// candidates; matching.js still does the scoring and the fit reasons, so the
// answers are the ones the product has always given.
function useLeadMatches(lead) {
  const [cands, setCands] = useState([])
  useEffect(() => {
    if (!lead?.id) { setCands([]); return }
    let live = true
    api.getLeadMatches(lead.id).then(r => { if (live) setCands(r?.data || []) }).catch(() => { if (live) setCands([]) })
    return () => { live = false }
  }, [lead?.id])
  return lead ? matchesForLead(lead, cands) : []
}

// WHEN A SITTING HAPPENED. One instant if it was one moment, its span if the
// person kept clicking — "22 Aug, 10:27 – 11:28 pm". whenLabel is the one
// answer to "when", so the opening is read through it and the close adds only
// the time, or the row would say the date twice.
function sessionSpan(e) {
  const open = whenLabel(e.at)
  if (!e.lastAt || e.lastAt === e.at) return open
  const a = new Date(e.at), b = new Date(e.lastAt)
  if (isNaN(a.getTime()) || isNaN(b.getTime()) || b.getTime() - a.getTime() < 60000) return open
  return `${open} – ${b.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`
}

// The clock time of one payload inside its sitting. The date is on the session
// header above it; repeating it on every line says nothing new.
function payloadTime(iso) {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
}

// What one payload said: what they wanted, for how much, and which project it
// was on. Locality is deliberately absent — it is the same on every line of a
// lead that has one, and a value repeated down a column is a column that reads
// as noise. It is a Details field, where the whole set is shown once. Each
// field may already be a list.
function payloadLine(req) {
  return [
    asList(req?.config).join(' · '),
    budgetRange(req),
    asList(req?.interest).join(' · '),
  ].filter(x => x && x !== '—').join('   ')
}

function LeadRecord({ store, go, sel, setSel, topBar, phone }) {
  // The lead this screen is showing — fetched on its own if we don't already
  // hold it. This used to be a find() over every lead in the firm, which meant
  // a deep link from a notification sat on "Opening lead details…" until the
  // whole collection had downloaded, and said it forever if it never did.
  const { record: l, loading, error } = useRecord(store, 'lead', sel.leadId)
  // Above the early return: a hook cannot be called conditionally, and the
  // "record not loaded yet" branch below is exactly such a condition.
  const matches = useLeadMatches(l)
  // A record we cannot open is a dead end, not a screen — and the message it
  // used to park on ("This lead no longer exists") asserted a cause it does not
  // know. An id reaches here from a link someone pasted, a lead a colleague
  // deleted, or another firm's URL; only the last of those is now caught before
  // the fetch (see bootNav), and none of them are worth stranding someone on.
  // Land on the list, which is the thing they can actually act on.
  useEffect(() => {
    if (error !== 'not-found') return
    store.toast('Lead not found')
    setSel(s => ({ ...s, leadOpen: false, leadId: undefined }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])
  if (!l) {
    return (
      <>
        {topBar({ title: 'Lead', eyebrow: 'Leads', onBack: () => setSel(s => ({ ...s, leadOpen: false })) })}
        {loading
          ? <div className="list-spin" role="status" aria-label="Loading"><span /></div>
          : <div className="detail-missing">{error === 'not-found' ? null : 'Could not open this lead.'}</div>}
      </>
    )
  }
  const a = store.agentById(l.agentId)
  const back = () => setSel(s => ({ ...s, leadOpen: false }))
  const role = store.state.role
  const userId = store.state.activeAgentId
  const editable = canEditLead(role, userId, l)

  // The next-best-action banner is gone. With a follow-up scheduled it
  // restated the follow-up card sitting directly beneath it; without one it
  // said "Contact this lead", which is a label, not a recommendation. A banner
  // that is either a duplicate or a truism is noise on the one screen an agent
  // reads all day.

  // merged property list: shortlisted pinned first, then system matches
  const shortlistIds = l.shortlist || []
  // Server first, browser cache only as a fallback. This was `store.lookup`
  // alone — a read of whatever the listings page had paged into memory — so on
  // any desk with more inventory than one page, a shortlisted property resolved
  // to undefined and was dropped by the filter(Boolean) below. The section then
  // said "No shortlisted or matching inventory yet" over a lead that had four.
  const byId = (id) => (l.shortlistProps || []).find(p => p.id === id) || store.lookup('property', id)
  const fbMap = l.feedback || {}
  // NO FIT SCORE. "90% match" was a number the desk could not inspect and
  // could not argue with — an agent who disagreed with it had nothing to point
  // at. Nothing replaces it: the row already says what the listing is, and the
  // matcher's job is to decide which four appear, not to grade them.
  const propRows = [
    ...shortlistIds.map(byId).filter(Boolean).map(p => ({ p, shortlisted: true, line: quotedShort(p) })),
    ...matches.filter(m => !shortlistIds.includes(m.id)).map(m => ({ p: m, shortlisted: false, line: quotedShort(m) })),
  ].sort((a, b) => (fbMap[a.p.id]?.verdict === 'rejected' ? 1 : 0) - (fbMap[b.p.id]?.verdict === 'rejected' ? 1 : 0))

  const openEdit = () => store.openModal({ kind: 'editRecord', moduleId: 'leads', recordId: l.id })
  // One way to open any channel, so the record screen and the list rows reach
  // the client through the same confirm-and-log flow.
  const contact = (channel) => store.openModal({
    kind: 'contact', channel, name: l.name, phone: l.phone, email: l.email,
    recordType: 'lead', recordId: l.id,
  })
  // Rail: the follow-up card, which is the only thing that changes per lead.
  // A REJECTED OR CLOSED LEAD IS NOT WAITING ON ANYTHING. Rejecting does not
  // clear an appointment booked before anyone knew, so this card went on
  // offering "Log visit" for a person who had said no.
  const nextStep = nextStepOf(l)
  const followUpCard = (
    <div className="fu-card">
      <div className="fu-head">Next follow-up</div>
      {nextStep ? (
        <div className="fu-active">
          <div>
            <div className="fu-title">{followUpAction(nextStep)}</div>
            {/* PAST DUE IS THE DATE'S OWN PROBLEM, not a separate badge. As a
                word in the header signals it named no subject and pushed the
                action row onto a second line to say it; here it sits on the
                only line in the record that carries the moment it is about, and
                costs no layout at all. Same treatment as the desk list's Next
                follow-up column, and the same `.fu-when.is-late` the callback
                card in Owners already uses — so one lead cannot look late on
                one screen and fine on the other.

                followUpLabel, not `date · time`: those two are what the person
                typed and what a scheduler wrote months ago — "This Sunday" long
                after that Sunday. The label reads the stored instant, which is
                also the only thing followUpOverdue can judge. */}
            <div className={'fu-when' + (followUpOverdue(nextStep) ? ' is-late' : '')}>
              {followUpLabel(nextStep)}
            </div>
          </div>
          {/* Log visit stays — it is the work, and it carries proof. The
              plain "Done" that sat here for everything else is gone with its
              twin in the phone menu: it closed the follow-up and recorded
              nothing, which is why a completed call and a completed callback
              looked like different species. Log the call from the Call button
              and this closes itself. */}
          {isSiteVisit(nextStep) ? (
            <button className="btn btn-primary btn-sm fu-done" onClick={() => store.openModal({ kind: 'visitProof', leadId: l.id })}>
              Log visit
            </button>
          ) : null}
        </div>
      ) : <div className="detail-empty">No follow-up scheduled.</div>}
      <Button variant="secondary" size="sm" block icon="calendar" onClick={() => store.openModal({ kind: 'scheduleFollowUp', leadId: l.id })}>
        {nextStep ? 'Reschedule follow-up' : 'Schedule follow-up'}
      </Button>
    </div>
  )

  // The phone's copy of the one line off the follow-up card: what is booked and
  // when, red once its moment has gone. No buttons — Log visit is already a
  // full-width button in the action bar below when a visit is booked, and
  // Reschedule is in the action menu. Information only, or it becomes the third
  // place offering the same two actions.
  const nextUp = nextStep ? (
    <div className={'rh-next' + (followUpOverdue(nextStep) ? ' is-late' : '')}>
      <span className="rh-next-tag">{followUpOverdue(nextStep) ? 'Overdue' : 'Next'}</span>
      <span className="rh-next-body">{followUpAction(nextStep)} · {followUpLabel(nextStep)}</span>
    </div>
  ) : null

  const sections = [
    // WHAT THEY ASKED FOR, EACH TIME THEY ASKED.
    //
    // A repeat enquiry used to survive only as a note — "[Repeat enquiry via
    // 99acres]" and a sentence — so the newer requirement was unreachable by
    // any filter, match or report. This is the same history as data.
    //
    // Sessions, not payloads: on the live desk one man opened four listings
    // between 18:05 and 18:10 and that is ONE enquiry — the count says one, and
    // the four are the lines inside it. Counting the clicks would have said he
    // enquired four times and taken his budget from whichever flat he opened
    // last.
    //
    // The section only exists once there is more than one, because "1 enquiry"
    // is every lead and a panel saying so is a panel about nothing.
    ...((l.enquiries || []).length > 1 ? [{
      id: 'enquiries',
      title: `${l.enquiries.length} enquiries`,
      render: () => (
        <div className="enq-list">
          {l.enquiries.map((e, i) => (
            <div key={e.id} className={'enq-sess' + (i ? ' relrow-div' : '')}>
              <div className="enq-when">
                <span>{sessionSpan(e)}</span>
                {/* HOW MANY LISTINGS THIS SITTING WAS MADE OF, in the desk's
                    own word for them. It read "4 listings", which is the
                    inventory's word for a flat we hold — these are the
                    enquiries the person sent, and the payload lines under this
                    are what it is counting. */}
                {e.payloadCount > 1 && <span className="enq-n">{e.payloadCount} enquiries in this visit</span>}
              </div>
              {/* One line per payload, each keeping its own time, portal and
                  figures. The session's own requirement is the SPAN across
                  them and cannot say which listing carried which budget —
                  four clicks at ₹24,999 / ₹25,000 / ₹29,999 are a person
                  looking around ₹25–30k, and flattening them loses both the
                  range and the projects. */}
              {e.payloads?.length ? e.payloads.map((pl, j) => (
                <div key={e.id + ':' + j} className="enq-pl">
                  <span className="enq-pl-when mono-num">{payloadTime(pl.at)}</span>
                  {pl.source && <span className="enq-pl-src">{pl.source}</span>}
                  <span className="enq-pl-req">{payloadLine(pl.req) || 'No requirement sent'}</span>
                </div>
              )) : (
                // A session whose payloads have been purged (raw bodies are
                // kept 30 days) still knows what was asked across it. Say that,
                // rather than an empty sitting.
                <div className="enq-pl">
                  <span className="enq-pl-req">{payloadLine(e.req) || 'No requirement sent'}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      ),
    }] : []),
    {
      id: 'inventory',
      title: 'Matched & shortlisted inventory',
      right: <button className="btn btn-secondary btn-sm" onClick={() => store.openModal({ kind: 'attachProp', leadId: l.id })}><Icon name="plus" size={14} /> Attach property</button>,
      render: () => propRows.length === 0
        ? <div className="detail-empty">No shortlisted or matching inventory yet. Attach one to get started.</div>
        : <CappedList items={propRows} step={6} noun="properties">{(row, i) => {
            const fb = (l.feedback || {})[row.p.id]
            const rejected = fb?.verdict === 'rejected'
            return (
              <div key={row.p.id} className={'invrow' + (i ? ' relrow-div' : '') + (rejected ? ' invrow-rej' : '')}>
                <div className="invrow-thumb" style={{ background: thumbTint(row.p.id) }}><Icon name="building" size={20} strokeWidth={1.4} /></div>
                <button className="invrow-main" onClick={() => go('properties', { propId: row.p.id, propOpen: true })}>
                  <div className="invrow-title">
                    <span className={rejected ? 'invrow-strike' : ''}>{row.p.society}</span>
                    {/* Agent-side only — the unit no. is never in a client message,
                        but here it's what distinguishes two flats in one society. */}
                    {unitLabel(row.p) && <span className="unit-tag">{unitLabel(row.p)}</span>}
                    {fb?.verdict === 'liked' && <span className="fit ok fit-tight">👍 Liked</span>}
                    {rejected && <span className="fit no fit-tight">👎 {fb.reason}</span>}
                    {!fb && row.shortlisted &&
                      <span className="fit ok fit-tight"><Icon name="check" size={11} />Shortlisted</span>}
                  </div>
                  {/* Joined, not templated. Hardcoding the separators printed a
                      trailing " · " whenever a property had no price, which on
                      imported inventory is most of them. */}
                  <div className="relrow-sub">{[row.p.type, row.p.locality, row.line].filter(Boolean).join(' · ')}</div>
                </button>
                <Button variant="secondary" size="sm" onClick={() => store.openWhatsApp(row.p.id, l.id)} icon="wa">Share Match</Button>
              </div>
            )
          }}</CappedList>,
    },
    {
      id: 'timeline',
      title: 'Inquiry interaction timeline',
      render: () => <Timeline events={l.timeline} agents={store.state.agents} currentUserId={store.state.activeAgentId}
        onEditRemark={(eventId, text, outcome) => store.editRemark('lead', l.id, eventId, text, outcome)} />,
    },
  ]

  return (
    <>
      {topBar({ eyebrow: 'Leads', title: l.name, onBack: back })}
      <div className="app-body">
        <ModuleDetail
          // On a phone Edit is carried by the action button (PhoneActions), so
          // it is deliberately absent here — otherwise the header's action bar
          // would offer it a second time, next to the two things you actually
          // came to do. On the desk it stays in the header where it always was.
          def={LEADS_DEF} record={l} store={store} phone={phone}
          onEdit={(!phone && editable) ? openEdit : undefined}
          avatar={<Avatar agent={{ initials: initials(l.name), avatar: '' }} size="lg" />}
          // NO OVERDUE FLAG HERE. A word on its own said nothing about what
          // was overdue, and on a phone it wrapped the header's action row onto
          // a second line to say it. The follow-up card in the record carries
          // the date and what the follow-up is for, which is the answer someone
          // opening the record actually wants.
          // Reaching a client is the whole reason this page gets opened, and
          // both ways of doing it were once only in the action button — two taps
          // and a menu to read, for the thing every visit starts with. So they
          // stay here, on the record, full width, on the phone as well as the
          // desk. Editing is the opposite: rare, and it moved to the action
          // button, so the phone's action bar is these two and nothing else.
          // Email joins them when the lead has one — same confirm-and-log path,
          // so an email is recorded on the timeline exactly like a call is.
          primary={[
            // A BOOKED SITE VISIT OUTRANKS EVERYTHING — ON A PHONE. The
            // appointment card carries "Log visit" and the rail it sits in is
            // not drawn on a phone, so the one action the agent is standing
            // outside the building to perform was reachable only through the
            // overflow sheet, while Call and WhatsApp sat across the screen in
            // full.
            //
            // PHONE ONLY, though. Unconditional, it put a second identical Log
            // visit in the header of the desk record, a few pixels above the
            // one on the appointment card — same label, same modal, two buttons
            // for one action. The card's is the better of the two on a desk
            // because it sits under the appointment it closes; this one exists
            // solely to stand in for a card that isn't there.
            ...(phone && isSiteVisit(l.followUp)
              ? [{ label: 'Log visit', icon: 'camera', onClick: () => store.openModal({ kind: 'visitProof', leadId: l.id }) }]
              : []),
            ...(l.phone ? [
              { label: 'Call', icon: 'phone', onClick: () => contact('call') },
              { label: 'WhatsApp', icon: 'wa', tone: 'wa', onClick: () => contact('wa') },
            ] : []),
            // Email steps aside for Log visit. The row is three across on a
            // 390px screen; a fourth wraps, and a wrapped action row pushes the
            // record's own identity down the page. Email is the least urgent of
            // the four by a distance — it is still on the action button — and
            // this only happens on the phone, while a visit is actually booked.
            // The desk row never gains a fourth button, so it never loses one.
            ...(l.email && !(phone && isSiteVisit(l.followUp))
              ? [{ label: 'Email', icon: 'mail', onClick: () => contact('email') }] : []),
          ]}
          railTop={followUpCard}
          nextUp={nextUp}
          sections={sections}
          actionCtx={{ onClose: back }}
        />
      </div>
    </>
  )
}

function followFrom(f, l) {
  const type = f.action === 'site' ? 'Site visit' : f.action === 'meeting' ? 'Meeting' : 'Call'
  const dateLabel = f.quick === 'today' ? 'Today' : f.quick === 'tomorrow' ? 'Tomorrow' : f.quick === 'weekend' ? 'This weekend' : (f.date || 'Scheduled')
  return { action: `${type} — ${l.name}`, date: dateLabel, time: f.time || '11:00 am' }
}

// compact, quiet money string for a property row (deal-aware)
function quotedShort(p) {
  // A property with no price has no price line. Template-stringing an absent
  // priceLabel produced the literal word "undefined", which then rendered as a
  // fact on the record: "2 BHK Apartment · Pune · undefined". Same shape as the
  // budget dash — a missing value dressed up as a value.
  if (!p?.priceLabel) return ''
  return p.deal === 'rent' ? `${p.priceLabel}` : `${p.priceLabel}${p.negotiable ? ' · neg.' : ''}`
}
