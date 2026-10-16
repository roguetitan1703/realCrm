// ============================================================================
// A RANGE ON PERFORMANCE AND MY WORK — how it is going, and who is slipping
// ============================================================================
// docs/specs/performance.md. A day answers "what happened today"; a range must
// answer something a sum of days cannot: whether the work is steady. So a range
// shows the days themselves (a bar per firm day), the totals against the period
// just before, and per agent how regularly they worked.
//
// TWO COUNTS, TWO WORDS. A person rung on three days is in three bars and is
// ONE of the range's different people. The chart says "each day", the total
// says "different people", and the two never share a label.
//
// Every bar is that day's own report (activityReport.ts, `days` on a range,
// grouped from the same facts), and tapping it opens that day.
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { useServerData } from '../lib/useServerData.js'
import Icon from './Icon.jsx'
import { fmt, word, shiftDay, spanOf } from './ActivityDay.jsx'

/** Every day from `from` to `to`, inclusive. */
export const daysOf = (from, to) => {
  const out = []
  if (!from || !to) return out
  for (let d = from; d <= to && out.length < 400; d = shiftDay(d, 1)) out.push(d)
  return out
}

/** People contacted, calls and picked up, by day, summed over `people`. */
export function seriesOf(people) {
  const by = {}
  for (const d of people.flatMap(p => p.days || [])) {
    const x = by[d.day] || (by[d.day] = { people: 0, calls: 0, answered: 0 })
    x.people += d.people; x.calls += d.calls; x.answered += d.answered
  }
  return by
}

/** The share who picked up, or null when nobody was contacted: no rate, not 0%. */
export const rateOf = (t) => (t && t.people > 0 ? t.n('contact', 'answered') / t.people : null)

/**
 * The period just before this one, of the same length: the same report, with
 * its range moved back by its own length. Null on a day.
 */
export function usePrevious({ side, data, person, dataAsOf }) {
  const from = data?.from || null
  const to = data?.day || null
  const n = from ? spanOf(from, to) : 0
  const { data: prev } = useServerData(
    () => (from ? api.getActivity({ side, from: shiftDay(from, -n), date: shiftDay(from, -1), person }) : Promise.resolve(null)),
    [side, from, to, person, dataAsOf], null)
  return from && prev?.from === shiftDay(from, -n) ? prev : null
}

/**
 * A change against the period before. Nothing while it is loading; "—" when
 * there was nothing before to compare with (unknown is not a default).
 * `points` reads a rate's change in percentage points.
 */
export function Change({ now, before, points = false, loading = false }) {
  if (loading) return <span className="pv-chg" />
  if (before == null || (!points && !(before > 0))) return <span className="pv-chg none">—</span>
  if (now == null) return <span className="pv-chg none">—</span>
  const d = points ? Math.round((now - before) * 100) : Math.round(((now - before) / before) * 100)
  if (d === 0) return <span className="pv-chg">Same</span>
  return <span className={'pv-chg ' + (d > 0 ? 'up' : 'down')}>{d > 0 ? '↑' : '↓'} {Math.abs(d)}{points ? ' pts' : '%'}</span>
}

const pctText = (r) => (r == null ? '—' : `${Math.round(r * 100)}%`)
const dayTitle = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const tick = (ymd) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** A clean top for the count axis: 1, 2, 5 × 10ⁿ. */
function niceMax(v) {
  if (v <= 4) return Math.max(1, Math.ceil(v))
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p
  return 10 * p
}

function useWidth() {
  const ref = useRef(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    setW(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

/** A column with a 4px rounded top and a square foot on the baseline. */
const column = (x0, x1, top, base) => {
  const r = Math.min(4, (x1 - x0) / 2, base - top)
  return `M${x0},${base}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x1 - r}Q${x1},${top} ${x1},${top + r}V${base}Z`
}

/**
 * The trend: a bar per day for the people contacted that day, and above it, in
 * its own band on its own scale, the share of them who picked up. Two bands,
 * one shared day axis: never two scales on one plot.
 */
export function Trend({ dates, byDay, onDay }) {
  const [ref, w] = useWidth()
  const [hover, setHover] = useState(null)
  const W = Math.max(w, 240)
  const padL = 38, padR = 8
  const rateTop = 6, rateH = 40, gap = 24, barH = 116, axisH = 20
  const barTop = rateTop + rateH + gap, base = barTop + barH, H = base + axisH
  const n = dates.length || 1
  const band = (W - padL - padR) / n
  const bw = Math.max(1, Math.min(24, band - 2))
  const max = niceMax(Math.max(0, ...dates.map(d => byDay[d]?.people || 0)))
  const cx = (i) => padL + i * band + band / 2
  const y = (v) => base - (v / max) * barH
  const ry = (r) => rateTop + rateH - r * rateH
  const rate = (d) => { const x = byDay[d]; return x && x.people > 0 ? x.answered / x.people : null }
  // The line breaks over a day with nobody contacted: there is no share there.
  const runs = []
  let run = []
  dates.forEach((d, i) => {
    const r = rate(d)
    if (r == null) { if (run.length) runs.push(run); run = [] } else run.push([cx(i), ry(r)])
  })
  if (run.length) runs.push(run)
  const every = Math.max(1, Math.ceil(54 / band))
  const dots = band >= 12
  const h = hover != null ? dates[hover] : null
  const hx = hover != null ? cx(hover) : 0
  const hd = h ? byDay[h] : null

  return (
    <div className="pv-tr">
      <div className="pv-tr-key">
        <span><i className="sw-bar" />People contacted each day</span>
        <span><i className="sw-line" />Picked up</span>
      </div>
      <div className="pv-tr-plot" ref={ref} onMouseLeave={() => setHover(null)}>
        {w > 0 && (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="People contacted each day, and the share who picked up">
            {/* the picked-up band */}
            <line className="pv-tr-grid" x1={padL} x2={W - padR} y1={ry(1)} y2={ry(1)} />
            <line className="pv-tr-grid" x1={padL} x2={W - padR} y1={ry(0)} y2={ry(0)} />
            <text className="pv-tr-ax" x={padL - 6} y={ry(1) + 4} textAnchor="end">100%</text>
            <text className="pv-tr-ax" x={padL - 6} y={ry(0) + 4} textAnchor="end">0%</text>
            {/* the people band */}
            <line className="pv-tr-grid" x1={padL} x2={W - padR} y1={y(max)} y2={y(max)} />
            <line className="pv-tr-grid" x1={padL} x2={W - padR} y1={y(max / 2)} y2={y(max / 2)} />
            <line className="pv-tr-base" x1={padL} x2={W - padR} y1={base} y2={base} />
            <text className="pv-tr-ax" x={padL - 6} y={y(max) + 4} textAnchor="end">{fmt(max)}</text>
            {max >= 2 && max % 2 === 0 && <text className="pv-tr-ax" x={padL - 6} y={y(max / 2) + 4} textAnchor="end">{fmt(max / 2)}</text>}
            <text className="pv-tr-ax" x={padL - 6} y={base + 4} textAnchor="end">0</text>
            {hover != null && <rect className="pv-tr-hl" x={padL + hover * band} y={rateTop} width={band} height={base - rateTop} />}
            {dates.map((d, i) => {
              const v = byDay[d]?.people || 0
              return v > 0 ? <path key={d} className="pv-tr-bar" d={column(cx(i) - bw / 2, cx(i) + bw / 2, y(v), base)} /> : null
            })}
            {runs.map((pts, k) => pts.length > 1
              ? <polyline key={k} className="pv-tr-line" points={pts.map(p => p.join(',')).join(' ')} />
              : null)}
            {dates.map((d, i) => {
              const r = rate(d)
              if (r == null || (!dots && hover !== i && !runs.some(p => p.length === 1 && p[0][0] === cx(i)))) return null
              return <circle key={d} className="pv-tr-dot" cx={cx(i)} cy={ry(r)} r={4} />
            })}
            {dates.map((d, i) => (i % every === 0 || i === dates.length - 1) && (i === dates.length - 1 || dates.length - 1 - i >= every) ? (
              <text key={d} className="pv-tr-ax" x={i === dates.length - 1 && band < 54 ? W - padR : cx(i)} y={H - 4}
                textAnchor={i === dates.length - 1 && band < 54 ? 'end' : 'middle'}>{tick(d)}</text>
            ) : null)}
            {/* one target per day, the whole height: hover reads it, a tap opens it */}
            {dates.map((d, i) => (
              <rect key={d} className="pv-tr-day" data-day={d} x={padL + i * band} y={0} width={band} height={base}
                role="button" tabIndex={0} aria-label={`${dayTitle(d)}: ${fmt(byDay[d]?.people || 0)} people contacted`}
                onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                onClick={() => onDay?.(d)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDay?.(d) } }} />
            ))}
          </svg>
        )}
        {h && (
          <div className="pv-tip" style={{ left: Math.min(Math.max(hx, 80), W - 80) }}>
            <b>{dayTitle(h)}</b>
            <span>{fmt(hd?.people || 0)} {word(hd?.people || 0, 'person', 'people')} contacted</span>
            <span>{fmt(hd?.calls || 0)} {word(hd?.calls || 0, 'call', 'calls')}</span>
            <span>{hd?.people ? `${fmt(hd.answered)} picked up · ${pctText(hd.answered / hd.people)}` : 'Nobody contacted'}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/** A small line of somebody's people contacted per day. */
export function Spark({ dates, byDay }) {
  const W = 84, H = 24, pad = 3
  const vals = dates.map(d => byDay[d]?.people || 0)
  const max = Math.max(1, ...vals)
  const x = (i) => pad + (dates.length > 1 ? (i / (dates.length - 1)) * (W - 2 * pad) : (W - 2 * pad) / 2)
  const y = (v) => H - pad - (v / max) * (H - 2 * pad)
  const last = vals.length - 1
  return (
    <svg className="pv-spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <line className="pv-spark-base" x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} />
      <polyline className="pv-spark-line" points={vals.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
      {last >= 0 && <circle className="pv-spark-dot" cx={x(last)} cy={y(vals[last])} r={2.5} />}
    </svg>
  )
}

/** Days in `dates` with at least one person contacted. */
export const workedDays = (dates, byDay) => dates.filter(d => (byDay[d]?.people || 0) > 0).length

/**
 * The range's totals, each against the period before: different people
 * contacted, calls, the share who picked up, and (for one person) days worked.
 */
export function Totals({ t, prev, loading, n, open, worked }) {
  const r = rateOf(t)
  const Fig = ({ big, label, sub, chg, onClick }) => (
    <button type="button" className="pv-tot-i" onClick={onClick}>
      <b>{big}</b><span>{label}</span>
      {sub && <em>{sub}</em>}
      {chg}
    </button>
  )
  return (
    <div className="pv-tot">
      <Fig big={fmt(t.people)} label={`different ${word(t.people, 'person', 'people')} contacted`}
        chg={<Change now={t.people} before={prev?.people} loading={loading} />} onClick={() => open('people')} />
      <Fig big={fmt(t.calls)} label={word(t.calls, 'call', 'calls')}
        chg={<Change now={t.calls} before={prev?.calls} loading={loading} />} onClick={() => open('call')} />
      <Fig big={pctText(r)} label="picked up" sub={`${fmt(t.n('contact', 'answered'))} of ${fmt(t.people)}`}
        chg={<Change now={r} before={prev ? rateOf(prev) : null} points loading={loading} />} onClick={() => open('contact', 'answered')} />
      {worked && <div className="pv-tot-i static"><b>{worked.n} of {worked.of}</b><span>days worked</span></div>}
      <span className="pv-tot-vs">On the {n} days before</span>
    </div>
  )
}

/** New leads in the range, and how many were called: "84 came in · 71 called". */
export function CameIn({ t, open }) {
  const came = t.n('came_in')
  if (!came) return null
  return (
    <div className="pv-came">
      <button type="button" onClick={() => open('came_in')}><b>{fmt(came)}</b> came in</button>
      <span aria-hidden="true">·</span>
      <button type="button" onClick={() => open('came_in', 'called')}><b>{fmt(t.n('came_in', 'called'))}</b> called</button>
    </div>
  )
}

/**
 * Agents over a range: one row each, by name. Regularity, not a ranking: their
 * days, how many they worked, how much a worked day holds, the share who
 * picked up, and the change on their own period before.
 */
export function RangeAgents({ people, dates, prev, loading, onOpenPerson }) {
  const before = new Map((prev?.people || []).map(p => [p.id, p]))
  return (
    <div className="pv-agents">
      <div className="pv-ag pv-rg pv-ag-head" aria-hidden="true">
        <span>Agent</span><span>Each day</span><span>Days worked</span><span>A worked day</span><span>Picked up</span><span>Change</span><span />
      </div>
      {people.map(p => {
        const byDay = seriesOf([p])
        const worked = workedDays(dates, byDay)
        const was = before.get(p.id)
        const wasPeople = was ? (was.counts || []).find(c => c.measure === 'people')?.n || 0 : (prev ? 0 : null)
        return (
          <button type="button" key={p.id} className={'pv-ag pv-rg' + (p.gone || p.duty === 'OFF_DUTY' ? ' off' : '')} onClick={() => onOpenPerson?.(p)}>
            <span className="pv-ag-name">{p.name || 'Someone who has left'}{p.duty === 'OFF_DUTY' && <span className="tt-tag">Off duty</span>}</span>
            <span className="pv-rg-spark"><Spark dates={dates} byDay={byDay} /></span>
            <span className="pv-ag-n" data-l="days worked"><b>{worked}</b> of {dates.length}</span>
            <span className="pv-ag-n" data-l="a worked day">{worked ? fmt(Math.round((p.t.people / worked) * 10) / 10) : '—'}</span>
            <span className="pv-ag-n" data-l="picked up">{pctText(rateOf(p.t))}</span>
            <span className="pv-ag-n pv-rg-chg" data-l="on the days before"><Change now={p.t.people} before={wasPeople} loading={loading} /></span>
            <Icon name="chevRight" size={15} className="pv-go" />
          </button>
        )
      })}
      {!people.length && <div className="detail-empty">Nobody on this side.</div>}
    </div>
  )
}

/** A section that is one line until it is tapped: Needs attention on a range. */
export function Folded({ title, n, children }) {
  const [open, setOpen] = useState(false)
  return (
    <section className={'panel pv-sec pv-fold' + (open ? ' open' : '')}>
      <button type="button" className="pv-fold-t" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{title}</span>
        {n > 0 && <span className="pv-count">{n}</span>}
        <Icon name={open ? 'chevUp' : 'chevDown'} size={15} className="pv-go" />
      </button>
      {open && children}
    </section>
  )
}
