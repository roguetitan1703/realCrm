import { useState } from 'react'
import { Panel, SectionHead, StageTag, Button, Input } from '../components/primitives.jsx'
import Icon from '../components/Icon.jsx'
import { theme, PROTECTED_STAGES } from '../data/theme.js'

// The palette is fixed per tenant theme (set once at onboarding) — shown for
// reference, not edited here. Everything else on this screen is live.
const SWATCHES = [
  ['Paper', '#F6F5F2'], ['Card', '#FFFFFF'], ['Ink', '#23231F'], ['Chrome', '#22242A'], ['Green', '#1E6F52'],
]

export default function Settings({ store, topBar }) {
  const { settings } = store.state
  const [firm, setFirm] = useState(settings.firmName)
  const [newStage, setNewStage] = useState('')
  const [newSource, setNewSource] = useState('')
  const [editing, setEditing] = useState(null)      // stage name currently being renamed
  const [draft, setDraft] = useState('')

  const firmDirty = firm.trim() && firm.trim() !== settings.firmName
  const lastClosedFree = settings.stages.filter(s => !s.startsWith('Closed')).length

  const startRename = (s) => { setEditing(s); setDraft(s) }
  const commitRename = () => {
    if (draft.trim() && draft.trim() !== editing) store.renameStage(editing, draft.trim())
    setEditing(null); setDraft('')
  }
  const addStage = () => { if (newStage.trim()) { store.addStage(newStage.trim()); setNewStage('') } }
  const addSource = () => { if (newSource.trim()) { store.addSource(newSource.trim()); setNewSource('') } }

  return (
    <>
      {topBar({ title: 'Settings' })}
      <div className="app-body" style={{ padding: '20px 22px 44px' }}>
        <div style={{ maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--chrome)', color: '#fff', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 13 }}>
            <Icon name="layers" size={22} style={{ color: '#7FD4B0' }} />
            <div>
              <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 15 }}>White-label — this is your brand, your data</div>
              <div style={{ fontSize: 12.5, color: 'var(--on-chrome-mut)' }}>Rename stages to how your team actually talks, add your own sources. Changes apply everywhere, instantly.</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, alignItems: 'start' }}>
            {/* ---- Brand ---- */}
            <Panel>
              <SectionHead title="Brand" />
              <div style={{ display: 'flex', gap: 15, alignItems: 'flex-end', marginBottom: 16 }}>
                <div style={{ width: 64, height: 64, borderRadius: 12, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--disp)', fontWeight: 700, fontSize: 22, flexShrink: 0 }}>{theme.brand.initials}</div>
                <div style={{ flex: 1 }}>
                  <div className="u-muted" style={{ fontSize: 11, marginBottom: 5 }}>Firm name</div>
                  <Input value={firm} onChange={e => setFirm(e.target.value)} placeholder="Your brokerage name"
                    onKeyDown={e => { if (e.key === 'Enter' && firmDirty) store.setFirmName(firm) }} />
                </div>
                <Button variant={firmDirty ? 'primary' : 'ghost'} disabled={!firmDirty} onClick={() => store.setFirmName(firm)}>Save</Button>
              </div>
              <div className="u-muted" style={{ fontSize: 11, marginBottom: 8 }}>Brand colours <span style={{ opacity: .7 }}>· set at onboarding</span></div>
              <div style={{ display: 'flex', gap: 10 }}>
                {SWATCHES.map(([n, c]) => (
                  <div key={n} style={{ textAlign: 'center' }}>
                    <div style={{ width: 46, height: 46, borderRadius: 8, border: '1px solid rgba(0,0,0,.08)', background: c }} />
                    <div className="u-muted" style={{ fontSize: 10, marginTop: 4 }}>{n}</div>
                  </div>
                ))}
              </div>
            </Panel>

            {/* ---- Pipeline stages ---- */}
            <Panel>
              <SectionHead title="Pipeline stages" right={`${settings.stages.length}`} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {settings.stages.map((s, i) => {
                  const protectedStage = PROTECTED_STAGES.includes(s)
                  const closed = s.startsWith('Closed')
                  const isEditing = editing === s
                  // reorder is bounded to the non-closed block
                  const canUp = i > 0 && !settings.stages[i - 1].startsWith('Closed') && !closed
                  const canDown = i < settings.stages.length - 1 && !settings.stages[i + 1].startsWith('Closed') && !closed
                  return (
                    <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card-2)', border: '1px solid var(--line-2)', borderRadius: 8, padding: '7px 9px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <button className="icon-mini" disabled={!canUp} onClick={() => store.moveStage(s, -1)} title="Move up"><Icon name="chevUp" size={12} /></button>
                        <button className="icon-mini" disabled={!canDown} onClick={() => store.moveStage(s, 1)} title="Move down"><Icon name="chevDown" size={12} /></button>
                      </div>
                      {isEditing ? (
                        <input className="input" style={{ flex: 1, height: 30, fontSize: 13 }} value={draft} autoFocus
                          onChange={e => setDraft(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setEditing(null); setDraft('') } }}
                          onBlur={commitRename} />
                      ) : (
                        <span style={{ flex: 1 }}><StageTag stage={s} /></span>
                      )}
                      {!protectedStage && !isEditing && (
                        <>
                          <button className="icon-mini" onClick={() => startRename(s)} title="Rename"><Icon name="edit" size={13} /></button>
                          <button className="icon-mini danger" disabled={lastClosedFree <= 1} onClick={() => { if (window.confirm(`Remove stage "${s}"? Leads currently in this stage will be moved to "${state.settings.stages[0] || 'New'}".`)) store.removeStage(s) }} title="Remove"><Icon name="x" size={13} /></button>
                        </>
                      )}
                      {protectedStage && <span className="u-muted" style={{ fontSize: 10.5, paddingRight: 4 }}>locked</span>}
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
                <input className="input" style={{ flex: 1, height: 34, fontSize: 13 }} value={newStage} placeholder="e.g. Token pending"
                  onChange={e => setNewStage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addStage() }} />
                <Button variant="ghost" size="sm" icon="plus" onClick={addStage}>Add</Button>
              </div>
              <div className="u-muted" style={{ fontSize: 11, marginTop: 8 }}>Renaming moves every lead on that stage. “Closed won / lost” are fixed.</div>
            </Panel>
          </div>

          {/* ---- Lead sources ---- */}
          <Panel>
            <SectionHead title="Lead sources" right={`${settings.sources.length}`} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, alignItems: 'center' }}>
              {settings.sources.map(s => (
                <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid var(--line)', borderRadius: 6, padding: '6px 8px 6px 13px', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' }}>
                  {s}
                  <button className="icon-mini danger" onClick={() => store.removeSource(s)} title={`Remove ${s}`}><Icon name="x" size={12} /></button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 7, marginTop: 12, maxWidth: 340 }}>
              <input className="input" style={{ flex: 1, height: 34, fontSize: 13 }} value={newSource} placeholder="e.g. Housing.com"
                onChange={e => setNewSource(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSource() }} />
              <Button variant="ghost" size="sm" icon="plus" onClick={addSource}>Add source</Button>
            </div>
          </Panel>

          {/* ---- System & Database Environment ---- */}
          <Panel>
            <SectionHead title="System & Database Environment" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '14px 18px' }}>
              <div>
                <div style={{ fontFamily: 'var(--disp)', fontWeight: 600, fontSize: 14.5 }}>Reset Database State</div>
                <div className="u-muted" style={{ fontSize: 12.5 }}>Wipes test records from the PostgreSQL database, restoring default baseline dataset.</div>
              </div>
              <Button variant="ghost" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }} onClick={store.resetDatabase}>
                Reset Database
              </Button>
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}
