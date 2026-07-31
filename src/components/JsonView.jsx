// A real payload viewer — expandable tree, typed values, one path format that
// matches the server's flattenPaths() exactly (dot-joined; an array shows only
// its first element, under key "0", because a provider sends N identical-shaped
// items and offering item.0…item.49 buries the field that matters).
//
// With `onPick`, a leaf is a button: click a field in a real received payload
// and it fills the mapping row that's listening. That is the whole fix for
// "select the payload at the map fields" — no dropdown of dot-paths typed from
// memory, the actual data IS the picker.
import { useState } from 'react'
import Icon from './Icon.jsx'

function typeOf(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

function Leaf({ path, value, picked, onPick }) {
  const t = typeOf(value)
  const shown = t === 'string' ? `"${value}"` : t === 'null' ? 'null' : String(value)
  const body = <span className={'jv-val jv-' + t}>{shown}</span>
  if (!onPick) return body
  return (
    <button type="button" className={'jv-leaf' + (picked ? ' picked' : '')} onClick={() => onPick(path, value)}>
      {body}
      {picked && <Icon name="check" size={12} className="jv-check" />}
    </button>
  )
}

function Node({ k, path, value, depth, picked, onPick, defaultOpen }) {
  const t = typeOf(value)
  const isObj = t === 'object'
  const isArr = t === 'array'
  // Called unconditionally, before the leaf early-return, so this instance's
  // hook order can never change even if a field's type differs across polls.
  const [open, setOpen] = useState(depth < defaultOpen)

  if (!isObj && !isArr) {
    return (
      <div className="jv-row" style={{ '--d': depth }}>
        {k != null && <span className="jv-key">{k}</span>}
        <Leaf path={path} value={value} picked={picked === path} onPick={onPick} />
      </div>
    )
  }

  const entries = isArr
    ? (value.length ? [['0', value[0]]] : [])
    : Object.entries(value)
  const extra = isArr && value.length > 1 ? value.length - 1 : 0

  return (
    <div className="jv-row jv-branch" style={{ '--d': depth }}>
      <button type="button" className="jv-toggle" onClick={() => setOpen(o => !o)}>
        <Icon name={open ? 'chevDown' : 'chevRight'} size={11} />
        {k != null && <span className="jv-key">{k}</span>}
        <span className="jv-brace">{isArr ? '[' : '{'}{!open ? '…' : ''}{!open ? (isArr ? ']' : '}') : ''}</span>
      </button>
      {open && (
        <div className="jv-children">
          {entries.map(([ck, cv]) => (
            <Node key={ck} k={ck} path={path ? `${path}.${ck}` : ck} value={cv}
              depth={depth + 1} picked={picked} onPick={onPick} defaultOpen={defaultOpen} />
          ))}
          {extra > 0 && <div className="jv-more">+{extra} more, same shape</div>}
          <div className="jv-brace jv-brace-close">{isArr ? ']' : '}'}</div>
        </div>
      )}
    </div>
  )
}

/**
 * data       the payload (object)
 * onPick     (path, value) => void — omit for a read-only viewer
 * picked     the currently-assigned path, highlighted if present
 * depth      how many levels start expanded (default: all — real lead
 *            payloads from a portal are a handful of flat fields, not a tree
 *            worth burying)
 */
export default function JsonView({ data, onPick, picked, depth = 6 }) {
  if (data === null || data === undefined) return <div className="jv-empty">No payload</div>
  const entries = typeof data === 'object' && !Array.isArray(data) ? Object.entries(data) : [['', data]]
  return (
    <div className="jv">
      <div className="jv-brace">{'{'}</div>
      <div className="jv-children">
        {entries.map(([k, v]) => (
          <Node key={k} k={k} path={k} value={v} depth={0} picked={picked} onPick={onPick} defaultOpen={depth} />
        ))}
      </div>
      <div className="jv-brace">{'}'}</div>
    </div>
  )
}
