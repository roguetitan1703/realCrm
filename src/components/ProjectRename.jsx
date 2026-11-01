// RENAME PROJECTS — "merge projects" (docs/specs/projects.md §5, Work OS #155).
// The owner or manager ticks project cards on Properties or Calling, picks the
// name to keep (one of the spellings, or typed), and every property and
// calling row on those cards takes it. Undo from the toast, and for 30 days
// from the card the rename landed on.
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useServerData } from '../lib/useServerData.js'
import { capitaliseWords } from '../lib/format.js'
import { isDeskRole } from '../lib/permissions.js'
import { Button, Field } from './primitives.jsx'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/** "41 properties and 12 owners", leaving out a side with none. */
export function renameCountText(properties, owners) {
  const bits = [properties ? plural(properties, 'property', 'properties') : null, owners ? plural(owners, 'owner', 'owners') : null].filter(Boolean)
  return bits.join(' and ')
}

/** Put a rename back. Rows changed since are kept, and the toast says how many. */
export function undoProjectRename(store, id) {
  return api.undoProjectRename(id)
    .then(r => {
      store.settled?.()
      store.toast(r?.kept ? `Rename undone · ${r.kept} changed since, kept` : 'Rename undone')
    })
    .catch(e => store.toast(e?.body?.message || 'Could not undo the rename.', 'warn'))
}

/** The renames that can still be undone, for the cards (desk only). */
export function useUndoableRenames(store) {
  const desk = isDeskRole(store.state.role)
  const { data } = useServerData(
    () => (desk ? api.listProjectRenames().then(r => r?.data || []) : Promise.resolve([])),
    [store.state.dataAsOf, desk], [])
  // The newest rename landing on a card is the one its Undo undoes.
  return (norm) => (norm ? (data || []).find(r => r.toNorm === norm) || null : null)
}

export function RenameProjectsModal({ store, Modal, keys = [], onDone }) {
  const [choice, setChoice] = useState(null) // a spelling, or '' for a typed name
  const [typed, setTyped] = useState('')
  const [preview, setPreview] = useState(null)
  const [first, setFirst] = useState(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState('')
  const to = choice === '' ? typed.replace(/\s+/g, ' ').trim() : (choice || '')

  // The spellings on the picked cards, once, with the commonest as the default.
  useEffect(() => {
    let live = true
    api.previewProjectRename(keys, keys[0])
      .then(r => { if (!live) return; setFirst(r); setChoice(r?.spellings?.[0]?.name?.replace(/\s+/g, ' ').trim() || '') })
      .catch(e => { if (live) setFailed(e?.body?.message || 'Could not read these projects.') })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // What THIS name would change — rows already spelt exactly so are not counted.
  useEffect(() => {
    if (!to) { setPreview(null); return }
    let live = true
    const t = setTimeout(() => {
      api.previewProjectRename(keys, to)
        .then(r => { if (live) setPreview(r) })
        .catch(e => { if (live) setFailed(e?.body?.message || 'Could not read these projects.') })
    }, choice === '' ? 300 : 0)
    return () => { live = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to])

  const options = [...new Set((first?.spellings || []).map(s => s.name.replace(/\s+/g, ' ').trim()).filter(Boolean))]
  const rowsOf = (name) => (first?.spellings || []).filter(s => s.name.replace(/\s+/g, ' ').trim() === name)
    .reduce((a, s) => ({ p: a.p + s.properties, o: a.o + s.owners }), { p: 0, o: 0 })
  const ready = preview && preview.to === to
  const n = ready ? preview.properties + preview.owners : 0
  const counts = ready ? renameCountText(preview.properties, preview.owners) : ''

  const confirm = () => {
    setBusy(true)
    api.renameProjects(keys, to, { properties: preview.properties, owners: preview.owners })
      .then(r => {
        store.closeModal()
        onDone?.()
        store.settled?.()
        store.toast(`Renamed to ${r.to}`, undefined, r.renameId ? { label: 'Undo', run: () => undoProjectRename(store, r.renameId) } : undefined)
      })
      .catch(e => {
        setBusy(false)
        if (e?.status === 409 && e.body) {
          setPreview(p => ({ ...p, properties: e.body.properties ?? p.properties, owners: e.body.owners ?? p.owners }))
          setFailed(e.body.message || 'The projects changed.')
          return
        }
        setFailed(e?.body?.message || 'Could not rename. Try again.')
      })
  }

  return (
    <Modal title={keys.length > 1 ? `Rename ${keys.length} projects` : 'Rename project'} onClose={store.closeModal} width={460}>
      {!first && !failed && <div className="list-spin" role="status" aria-label="Loading"><span /></div>}
      {first && (
        <>
          <div className="imp-map-label" style={{ marginBottom: 6 }}>New name</div>
          <div className="confirm-lines" role="radiogroup">
            {options.map(name => {
              const c = rowsOf(name)
              return (
                <label key={name} className="confirm-line confirm-pick">
                  <input type="radio" name="proj-to" checked={choice === name} onChange={() => { setChoice(name); setFailed('') }} />
                  <span style={{ flex: 1 }}>{name}</span>
                  <span className="u-muted" style={{ fontSize: 12 }}>{renameCountText(c.p, c.o)}</span>
                </label>
              )
            })}
            <label className="confirm-line confirm-pick">
              <input type="radio" name="proj-to" checked={choice === ''} onChange={() => { setChoice(''); setFailed('') }} />
              <span>Other name</span>
            </label>
          </div>
          {choice === '' && (
            <Field label="Name">
              <input className="input" autoFocus value={typed} maxLength={120}
                onChange={e => { setTyped(capitaliseWords(e.target.value)); setFailed('') }} />
            </Field>
          )}
        </>
      )}
      {failed && <div className="field-err" role="alert" style={{ color: 'var(--danger, #b42318)', fontSize: 13, marginTop: 8 }}>{failed}</div>}
      <div className="lc-foot">
        <Button onClick={store.closeModal}>Cancel</Button>
        <Button variant="primary" style={{ flex: 1, minWidth: 0, justifyContent: 'center', whiteSpace: 'normal', height: 'auto', minHeight: 38, lineHeight: 1.3, textAlign: 'center' }}
          disabled={busy || !ready || !n} onClick={confirm}>
          {busy ? 'Renaming…' : !to ? 'Rename' : !ready ? 'Counting…' : n ? `Rename ${counts} to '${to}'` : 'Nothing to rename'}
        </Button>
      </div>
    </Modal>
  )
}
