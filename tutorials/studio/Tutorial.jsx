// ============================================================================
// A TUTORIAL VIDEO, COMPOSED FROM A RECORDING AND ITS TIMELINE
// ============================================================================
// record.mjs left two things in public/rec/<id>/: the screen, as frames at 2x
// with the time each was painted, and timeline.json, each step with what it
// says and where its target sat. Everything the viewer's eye is led by is
// drawn here from those numbers: the camera that zooms onto the step, the
// cursor, the ring and dimming around the target, the caption, the progress.
//
// Times are milliseconds of the recording (r). The video is an intro card,
// then the recording, then a closing card.
// ============================================================================
import { useMemo } from 'react'
import { AbsoluteFill, Html5Audio, Img, Sequence, staticFile, useCurrentFrame } from 'remotion'
import { loadFont as loadDisplay } from '@remotion/google-fonts/SpaceGrotesk'
import { loadFont as loadSans } from '@remotion/google-fonts/IBMPlexSans'

const { fontFamily: DISPLAY } = loadDisplay('normal', { weights: ['500', '600'], subsets: ['latin'] })
const { fontFamily: SANS } = loadSans('normal', { weights: ['400', '500', '600'], subsets: ['latin'] })

export const FPS = 30
// The cards last long enough for their spoken line, and never less than this.
const INTRO_MIN = 3000, OUTRO_MIN = 3400
export const introMs = (tl) => Math.max(INTRO_MIN, (tl.voice?.intro?.ms || 0) + 1300)
export const outroMs = (tl) => Math.max(OUTRO_MIN, (tl.voice?.outro?.ms || 0) + 1500)
const W = 1920, H = 1080

// The product's own palette: charcoal, linen, ochre.
const C = { ink: '#23231F', muted: '#77756E', linen: '#F6F5F2', bg: '#ECE8DF', accent: '#B7791F', accentSoft: 'rgba(183,121,31,.18)' }

// The screen sits inset on the backdrop at rest and fills the frame when the
// camera moves in. MOVE is how long the camera takes to get somewhere.
const INSET = 0.86, MOVE = 1050

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)
const lerp = (a, b, p) => a + (b - a) * p
// 0 → 1 over [a, a+d], then 1 → 0 over [b, b+d].
const window01 = (r, a, b, d = 250) => clamp((r - a) / d) * (1 - clamp((r - b) / d))

// THE CAMERA IS A RECTANGLE OF THE SCREEN, in the page's CSS pixels, that
// fills the video frame. It used to be a zoom and a centre point, clamped to
// the screen's edge on every frame; crossing from "centred" to "clamped"
// mid-zoom pushed the picture back and forth by a pixel or two, which read as
// shake. Now each move is planned once, as a rectangle already inside the
// screen, and the camera only ever glides from one rectangle to the next.
const restScale = (vp) => Math.min(W / vp.width, H / vp.height) * INSET

function viewFor(vp, z, cx, cy) {
  const w = W / restScale(vp) / z, h = (w * H) / W
  const fit = (size, span, c) => (size <= span ? clamp(c - size / 2, 0, span - size) : span / 2 - size / 2)
  return { x: fit(w, vp.width, cx), y: fit(h, vp.height, cy), w, z }
}
const restView = (vp) => viewFor(vp, 1, vp.width / 2, vp.height / 2)

// One planned rectangle per step. A target already comfortably in view at
// the same zoom does not move the camera: re-centring on every click is what
// makes a screen recording feel seasick.
function plan(tl) {
  const vp = tl.viewport
  let prev = restView(vp)
  const keys = []
  for (const s of tl.steps) {
    const b = s.box
    let to = !b || s.zoom === 1 ? restView(vp) : viewFor(vp, s.zoom, b.x + b.w / 2, b.y + b.h / 2)
    if (b && s.zoom === prev.z && s.zoom !== 1) {
      const m = prev.w * 0.08, h = (prev.w * H) / W
      const inside = b.x > prev.x + m && b.x + b.w < prev.x + prev.w - m && b.y > prev.y + m && b.y + b.h < prev.y + h - m
      if (inside) to = prev
    }
    keys.push({ t: s.tStart, to })
    prev = to
  }
  const last = tl.steps[tl.steps.length - 1]
  if (last) keys.push({ t: last.tEnd, to: restView(vp) })
  return keys
}

function cameraAt(r, tl, keys) {
  let cur = restView(tl.viewport)
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]
    if (r < k.t) break
    if (k.to === cur) continue
    const until = Math.min(r, keys[i + 1]?.t ?? Infinity)
    const p = ease(clamp((until - k.t) / MOVE))
    // Width in log space so zooming in and out feel equally paced; the
    // centre moves in a straight line.
    const hc = (cur.w * H) / W, ht = (k.to.w * H) / W
    const cx = lerp(cur.x + cur.w / 2, k.to.x + k.to.w / 2, p)
    const cy = lerp(cur.y + hc / 2, k.to.y + ht / 2, p)
    const w = Math.exp(lerp(Math.log(cur.w), Math.log(k.to.w), p))
    cur = p >= 1 ? k.to : { x: cx - w / 2, y: cy - (w * H) / W / 2, w, z: k.to.z }
  }
  return cur
}

// Where a step's target is at time r: the recorder read it several times
// while the step played, so the ring follows a button that grows or moves.
function boxAt(s, r) {
  const bs = s.boxes?.length ? s.boxes : s.box ? [{ t: s.tStart, ...s.box }] : []
  if (!bs.length) return null
  if (r <= bs[0].t) return bs[0]
  for (let i = 1; i < bs.length; i++) {
    if (r <= bs[i].t) {
      const a = bs[i - 1], b = bs[i], p = (r - a.t) / Math.max(1, b.t - a.t)
      return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p) }
    }
  }
  return bs[bs.length - 1]
}

// Where the cursor's tip rests for a step: the middle of the target as it was
// when pressed, or the start of a field it types into.
const aim = (s) => {
  const b = boxAt(s, s.tAct)
  return s.kind === 'type'
    ? { x: b.x + Math.min(b.w * 0.3, 70), y: b.y + b.h / 2 }
    : { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

function cursorAt(r, tl) {
  let from = { x: tl.viewport.width * 0.7, y: tl.viewport.height * 0.75 }
  for (const s of tl.steps) {
    if (!s.box) continue
    const to = aim(s)
    const a = s.tStart + 150, b = s.tAct - 250
    if (r < a) return from
    if (r < b) {
      const p = ease(clamp((r - a) / (b - a)))
      // A slight arc, the way a hand moves a mouse, not a ruler.
      const dx = to.x - from.x, dy = to.y - from.y, bow = Math.sin(Math.PI * p) * 0.12
      return { x: lerp(from.x, to.x, p) - dy * bow, y: lerp(from.y, to.y, p) + dx * bow }
    }
    from = to
  }
  return from
}

function frameAt(r, frames) {
  let lo = 0, hi = frames.length - 1
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (frames[mid].t <= r) lo = mid; else hi = mid - 1 }
  return frames[lo]
}

function Cursor({ x, y, press }) {
  return (
    <svg width="44" height="60" viewBox="0 0 22 30" style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${x - 3}px, ${y - 2}px) scale(${press})`, transformOrigin: '3px 2px', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,.35))' }}>
      <path d="M1.5 1.5 L1.5 23 L7 18 L11 27 L14.5 25.5 L10.6 16.8 L18 16.8 Z" fill="#141414" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

function Intro({ tl, ms, len }) {
  const out = 1 - clamp((ms - (len - 700)) / 500)
  const up = (delay) => ({ opacity: clamp((ms - delay) / 500) * out, transform: `translateY(${(1 - ease(clamp((ms - delay) / 600))) * 24}px)` })
  const secs = Math.round(tl.duration / 1000)
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      <div style={{ ...up(100), fontFamily: SANS, fontSize: 24, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: C.accent }}>How to</div>
      <div style={{ ...up(250), fontFamily: DISPLAY, fontSize: 84, fontWeight: 600, color: C.ink, letterSpacing: '-.02em', marginTop: 18, maxWidth: 1500, lineHeight: 1.08 }}>{tl.title}</div>
      <div style={{ ...up(450), fontFamily: SANS, fontSize: 34, color: C.muted, marginTop: 24 }}>{tl.summary}</div>
      <div style={{ ...up(650), fontFamily: SANS, fontSize: 24, fontWeight: 500, color: C.ink, marginTop: 44, display: 'flex', gap: 14, alignItems: 'center' }}>
        <span>{tl.total} steps</span><span style={{ width: 6, height: 6, borderRadius: 3, background: C.accent }} /><span>{secs} seconds</span>
      </div>
    </AbsoluteFill>
  )
}

function Outro({ tl, ms }) {
  const p = ease(clamp(ms / 600))
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', background: `rgba(236,232,223,${0.82 * p})` }}>
      <div style={{ opacity: p, transform: `scale(${0.9 + 0.1 * p})`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <svg width="112" height="112" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r="28" fill={C.accent} />
          <path d="M17 29 L25 37 L40 21" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray="40" strokeDashoffset={40 * (1 - ease(clamp((ms - 250) / 500)))} />
        </svg>
        <div style={{ fontFamily: DISPLAY, fontSize: 76, fontWeight: 600, color: C.ink, marginTop: 30 }}>Done</div>
        {tl.outro && <div style={{ fontFamily: SANS, fontSize: 34, color: C.muted, marginTop: 14, maxWidth: 1300 }}>{tl.outro}</div>}
      </div>
    </AbsoluteFill>
  )
}

const f = (ms) => Math.round((ms / 1000) * FPS)

export function Tutorial({ id, timeline: tl }) {
  const frame = useCurrentFrame()
  const ms = (frame / FPS) * 1000
  const keys = useMemo(() => (tl ? plan(tl) : []), [tl])
  if (!tl) return null
  const INTRO = introMs(tl)
  const r = ms - INTRO
  const rr = clamp(r, 0, tl.duration)
  const vp = tl.viewport, dsf = tl.dsf || 2
  const phone = tl.device === 'phone'

  const cam = cameraAt(rr, tl, keys)
  const k = W / cam.w   // video pixels per CSS pixel
  const toVideo = (p, c = cam) => ({ x: (p.x - c.x) * (W / c.w), y: (p.y - c.y) * (W / c.w) })
  const shot = frameAt(rr, tl.frames)

  // The screen arrives: scaled up slightly and faded in as the intro leaves.
  const arrive = ease(clamp((ms - (INTRO - 500)) / 700))

  // The step on screen now, for the caption, the ring and the progress bar.
  const i = tl.steps.findLastIndex(s => rr >= s.tStart)
  const step = tl.steps[i]
  const last = tl.steps[tl.steps.length - 1]

  const cur = toVideo(cursorAt(rr, tl))
  const act = step && step.kind !== 'point' ? rr - step.tAct : -1
  const press = act >= 0 && act < 240 ? 1 - 0.18 * Math.sin((act / 240) * Math.PI) : 1
  const ripple = act >= 0 && act < 600 ? act / 600 : null
  const cursorOpacity = clamp(r / 400) * (1 - clamp((r - tl.duration + 200) / 300))

  let ring = null
  const box = step && boxAt(step, rr)
  if (box) {
    let until = step.kind === 'type' ? step.tEnd - 350 : step.tAct + 450
    if (step.goneAt) until = Math.min(until, step.goneAt - 150)
    const o = window01(rr, step.tStart + 200, until)
    if (o > 0) {
      const pad = 6
      const a = toVideo({ x: box.x - pad, y: box.y - pad })
      ring = { o, x: a.x, y: a.y, w: (box.w + pad * 2) * k, h: (box.h + pad * 2) * k, dim: step.spotlight }
    }
  }

  // THE CAPTION. It fades out just before the next one comes in rather than
  // being swapped under the viewer's eye, and it sits at the top for a step
  // whose target would be under it, decided once per step so it never jumps.
  let caption = null
  if (step && r >= 0) {
    const end = tl.steps[i + 1]?.tStart ?? last.tEnd + 500
    const o = ease(clamp((rr - step.tStart - 60) / 320)) * (1 - clamp((rr - (end - 200)) / 200))
    const low = step.box && toVideo({ x: 0, y: step.box.y + step.box.h }, cameraAt(step.tAct, tl, keys)).y > H - 210
    if (o > 0) caption = { o, top: !!low }
  }
  const done = tl.steps.filter(s => rr >= s.tAct).length
  const progress = done / Math.max(1, tl.total)
  const s = k / dsf   // image pixels to video pixels
  const radius = phone ? 52 : 16

  return (
    <AbsoluteFill style={{ background: `radial-gradient(1200px 700px at 85% 0%, rgba(183,121,31,.10), transparent 60%), ${C.bg}`, fontFamily: SANS, overflow: 'hidden' }}>
      {r >= -500 && (
        <AbsoluteFill style={{ opacity: arrive, transform: `scale(${0.96 + 0.04 * arrive})` }}>
          {/* Moved by one transform, never by layout: sub-pixel and smooth. */}
          <div style={{
            position: 'absolute', left: 0, top: 0, width: vp.width * dsf, height: vp.height * dsf,
            transformOrigin: '0 0', transform: `translate(${-cam.x * k}px, ${-cam.y * k}px) scale(${s})`,
            borderRadius: radius / s, overflow: 'hidden',
            boxShadow: `${phone ? `0 0 0 ${14 / s}px #1E1E1B, ` : ''}0 ${30 / s}px ${80 / s}px rgba(35,35,31,.24), 0 0 0 ${1 / s}px rgba(35,35,31,.08)`,
            // Out of focus under the closing card, so the words are all there is to read.
            filter: r > tl.duration ? `blur(${(14 * ease(clamp((r - tl.duration) / 600))) / s}px)` : undefined,
          }}>
            <Img src={staticFile(`rec/${id}/${shot.file}`)} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
          {ring && (
            <div style={{
              position: 'absolute', left: 0, top: 0, width: ring.w, height: ring.h, borderRadius: 12,
              transform: `translate(${ring.x}px, ${ring.y}px)`,
              border: `3px solid ${C.accent}`, opacity: ring.o,
              boxShadow: `0 0 0 6px ${C.accentSoft}${ring.dim ? ', 0 0 0 4000px rgba(24,22,18,.28)' : ''}`,
            }} />
          )}
        </AbsoluteFill>
      )}

      {ripple !== null && cursorOpacity > 0 && (
        <div style={{
          position: 'absolute', left: 0, top: 0, width: 2 * (10 + 40 * ripple), height: 2 * (10 + 40 * ripple), borderRadius: '50%',
          transform: `translate(${cur.x - (10 + 40 * ripple)}px, ${cur.y - (10 + 40 * ripple)}px)`,
          border: `3px solid ${C.accent}`, opacity: 0.8 * (1 - ripple),
        }} />
      )}
      {cursorOpacity > 0 && <div style={{ opacity: cursorOpacity }}><Cursor x={cur.x} y={cur.y} press={press} /></div>}

      {caption && (
        <div style={{ position: 'absolute', left: 0, right: 0, [caption.top ? 'top' : 'bottom']: 54, display: 'flex', justifyContent: 'center' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 22, maxWidth: 1400,
            background: 'rgba(35,35,31,.94)', color: C.linen, borderRadius: 18, padding: '22px 34px 22px 24px',
            boxShadow: '0 18px 50px rgba(0,0,0,.28)',
            opacity: caption.o, transform: `translateY(${(1 - caption.o) * (caption.top ? -14 : 14)}px)`,
          }}>
            <div style={{ flex: 'none', minWidth: 58, height: 58, borderRadius: 14, background: C.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontSize: 30, fontWeight: 600 }}>{step.n}</div>
            <div style={{ fontSize: 36, fontWeight: 500, lineHeight: 1.25 }}>{step.say}</div>
          </div>
        </div>
      )}

      {r >= 0 && r <= tl.duration + 300 && (
        <div style={{ position: 'absolute', left: 0, bottom: 0, height: 6, width: W, transformOrigin: '0 0', transform: `scaleX(${progress})`, background: C.accent, opacity: 1 - clamp((r - tl.duration) / 300) }} />
      )}

      {ms < INTRO && <Intro tl={tl} ms={ms} len={INTRO} />}

      {/* The narration: the title over the intro, each step's line as the
          step begins, and the closing line over the closing card. */}
      {tl.voice?.intro && <Sequence from={f(450)}><Html5Audio src={staticFile(`rec/${id}/${tl.voice.intro.file}`)} /></Sequence>}
      {tl.steps.map(st => st.voice && (
        <Sequence key={st.n} from={f(INTRO + st.tStart + (tl.voice?.at ?? 150))}>
          <Html5Audio src={staticFile(`rec/${id}/${st.voice.file}`)} />
        </Sequence>
      ))}
      {tl.voice?.outro && <Sequence from={f(INTRO + tl.duration + 350)}><Html5Audio src={staticFile(`rec/${id}/${tl.voice.outro.file}`)} /></Sequence>}
      {r > tl.duration && <Outro tl={tl} ms={r - tl.duration} />}
    </AbsoluteFill>
  )
}
