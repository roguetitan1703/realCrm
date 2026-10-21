import { api } from '../lib/api.js'
import { useServerData } from '../lib/useServerData.js'
import { Button } from '../components/primitives.jsx'
import { AgentWork, TeamBoard } from '../components/AgentWork.jsx'

// ============================================================================
// PERFORMANCE — how each person's work is going (owner and managers)
// ============================================================================
// The board first: one card per person, for today, 7 or 30 days. A card opens
// that person's page, which is the page they see of themselves as "My work",
// with the desk's two actions on it: hand their work on, open their leads.
//
// Team is for managing people (who can sign in, suspend, sessions). This is
// for reading how the work is going. They were one page, and the numbers
// crowded out the people.
export default function Performance({ store, go, sel, topBar }) {
  const { state } = store
  const { data: ownerSummary, loading } = useServerData(() => api.getOwnersSummary(), [state.dataAsOf], null, '/owners/summary')
  const { data: desk } = useServerData(() => api.getDeskSummary(), [state.dataAsOf], null, '/workspace/desk-summary')
  const hasCalling = (ownerSummary?.summary?.queue?.total || 0) > 0
  const settled = !!ownerSummary || !loading
  const person = sel?.person
  // The days live in the URL (`day` the last, `from` the first), so an agent
  // opened from last week opens on last week.
  const day = sel?.day || null
  const from = sel?.from || null
  const toLeads = (leadFilters) => go('leads', { leadFilters, leadOpen: false, leadId: undefined })

  if (person) {
    const who = (state.agents || []).find(a => a.id === person)
    const name = who?.name || 'Teammate'
    const canHand = who && ['agent', 'manager'].includes(who.role || 'agent')
    return (
      <>
        {topBar({ eyebrow: 'Performance', title: name, onBack: () => go('performance', { person: undefined, day: day || undefined, from: from || undefined }) })}
        <div className="app-body pagewrap perf">
          {!settled ? <div className="ad-wait tall" aria-busy="true" /> : (
            <AgentWork store={store} person={person} title={name} heading={false} mode="drill" hasCalling={hasCalling}
              date={day} from={from} onRange={(r) => go('performance', { person, day: r.day || undefined, from: r.from || undefined })}
              book={desk?.perAgent?.[person]} ownerBook={desk?.perAgentCalls?.[person]}
              onBook={(seg) => toLeads(seg ? { agent: [person], seg } : { agent: [person] })}
              actions={<>
                <Button size="sm" onClick={() => toLeads({ agent: [person] })}>Their leads</Button>
                {canHand && <Button size="sm" onClick={() => store.openModal({ kind: 'reassign', fromId: person })}>Reassign</Button>}
              </>} />
          )}
        </div>
      </>
    )
  }

  return (
    <>
      {topBar({ title: 'Performance' })}
      <div className="app-body pagewrap perf">
        {!settled ? <div className="ad-wait tall" aria-busy="true" /> : (
          <TeamBoard store={store} hasCalling={hasCalling} onOpenPerson={(c) => go('performance', { person: c.id, day: day || undefined, from: from || undefined })}
            date={day} from={from} onRange={(r) => go('performance', { day: r.day || undefined, from: r.from || undefined })}
            books={desk?.perAgent || {}} onBook={(id, seg) => toLeads({ agent: [id], seg })} />
        )}
      </div>
    </>
  )
}
