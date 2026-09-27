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
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion'
import { loadFont as loadDisplay } from '@remotion/google-fonts/SpaceGrotesk'
import { loadFont as loadSans } from '@remotion/google-fonts/IBMPlexSans'

const { fontFamily: DISPLAY } = loadDisplay('normal', { weights: ['500', '600'], subsets: ['latin'] })
const { fontFamily: SANS } = loadSans('normal', { weights: ['400', '500', '600'], subsets: ['latin'] })

export const FPS = 30
export const INTRO_MS = 3000
export const OUTRO_MS = 3400
const W = 1920, H = 1080

// The product's own palette: charcoal, linen, ochre.
const C = { ink: '#23231F', muted: '#77756E', linen: '#F6F5F2', bg: '#ECE8DF', accent: '#B7791F', accentSoft: 'rgba(183,121,31,.18)' }

// The screen sits inset on the backdrop at rest and fills the frame when the
// camera moves in. MOVE is how long the camera takes to get somewhere.
const INSET = 0.86, MOVE = 900

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)
const lerp = (a, b, p) => a + (b - a) * p
// 0 → 1 over [a, a+d], then 1 → 0 over [b, b+d].
const window01 = (r, a, b, d = 250) => clamp((r - a) / d) * (1 - clamp((r - b) / d))

// WHERE THE CAMERA IS at time r: zoom and the CSS point it is centred on.
// Each step moves it to that step's zoom and target; after the last step it
// comes back out. A move that starts before the previous one finished starts
// from wherever that one had got to.
function cameraAt(r, tl) {
  const vp = tl.viewport
  const rest = { z: 1, x: vp.width / 2, y: vp.height / 2 }
  const keys = tl.steps.map(s => ({ t: s.tStart, to: s.box ? { z: s.zoom, x: s.box.x + s.box.w / 2, y: s.box.y + s.box.h / 2 } : rest }))
  const last = tl.steps[tl.steps.length - 1]
  if (last) keys.push({ t: last.tEnd, to: rest })
  let cur = rest
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]
    if (r < k.t) break
    const until = Math.min(r, keys[i + 1]?.t ?? Infinity)
    const p = ease(clamp((until - k.t) / MOVE))
    cur = {
      z: Math.exp(lerp(Math.log(cur.z), Math.log(k.to.z), p)),
      x: lerp(cur.x, k.to.x, p),
      y: lerp(cur.y, k.to.y, p),
    }
  }
  return cur
}

// The screen's rectangle on the video for a camera: scale k (video px per CSS
// px) and its top-left. Centred on the target, but never showing past the
// screen's edge once it is bigger than the frame.
function place(cam, vp) {
  const k = (W / vp.width) * INSET * cam.z
  const w = vp.width * k, h = vp.height * k
  const fit = (size, frame, c) => (size <= frame ? (frame - size) / 2 : clamp(frame / 2 - c * k, frame - size, 0))
  return { k, w, h, x: fit(w, W, cam.x), y: fit(h, H, cam.y) }
}

// Where the cursor's tip rests for a step: the middle of the target, or the
// start of a field it types into.
const aim = (s) => (s.kind === 'type'
  ? { x: s.box.x + Math.min(s.box.w * 0.3, 70), y: s.box.y + s.box.h / 2 }
  : { x: s.box.x + s.box.w / 2, y: s.box.y + s.box.h / 2 })

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
    <svg width="44" height="60" viewBox="0 0 22 30" style={{ position: 'absolute', left: x - 3, top: y - 2, transform: `scale(${press})`, transformOrigin: '3px 2px', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,.35))' }}>
      <path d="M1.5 1.5 L1.5 23 L7 18 L11 27 L14.5 25.5 L10.6 16.8 L18 16.8 Z" fill="#141414" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

function Intro({ tl, ms }) {
  const out = 1 - clamp((ms - (INTRO_MS - 700)) / 500)
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

export function Tutorial({ id, timeline: tl }) {
  const frame = useCurrentFrame()
  const ms = (frame / FPS) * 1000
  if (!tl) return null
  const r = ms - INTRO_MS
  const rr = clamp(r, 0, tl.duration)
  const vp = tl.viewport

  const cam = cameraAt(rr, tl)
  const pl = place(cam, vp)
  const toVideo = (p) => ({ x: pl.x + p.x * pl.k, y: pl.y + p.y * pl.k })
  const shot = frameAt(rr, tl.frames)

  // The screen arrives: scaled up slightly and faded in as the intro leaves.
  const arrive = ease(clamp((ms - (INTRO_MS - 500)) / 700))
  const inScreen = r >= -500 && r <= tl.duration

  // The step on screen now, for the caption, the ring and the progress bar.
  const step = [...tl.steps].reverse().find(s => rr >= s.tStart)
  const last = tl.steps[tl.steps.length - 1]
  const captionOn = step && r >= 0 && r < last.tEnd + 400

  const cur = toVideo(cursorAt(rr, tl))
  const act = step && (step.kind !== 'point') ? rr - step.tAct : -1
  const press = act >= 0 && act < 240 ? 1 - 0.18 * Math.sin((act / 240) * Math.PI) : 1
  const ripple = act >= 0 && act < 600 ? act / 600 : null
  const cursorOpacity = clamp(r / 400) * (1 - clamp((r - tl.duration + 200) / 300))

  let ring = null
  if (step?.box) {
    const until = step.kind === 'type' ? step.tEnd - 350 : step.tAct + 450
    const o = window01(rr, step.tStart + 200, until)
    if (o > 0) {
      const pad = 6
      const tl0 = toVideo({ x: step.box.x - pad, y: step.box.y - pad })
      ring = { o, x: tl0.x - pl.x, y: tl0.y - pl.y, w: (step.box.w + pad * 2) * pl.k, h: (step.box.h + pad * 2) * pl.k, dim: step.spotlight }
    }
  }

  // The caption moves to the top when the target is low enough to sit under it.
  let captionTop = false
  if (step?.box) captionTop = toVideo({ x: 0, y: step.box.y + step.box.h }).y > H - 200
  const cIn = step ? ease(clamp((rr - step.tStart) / 350)) : 0
  const done = tl.steps.filter(s => rr >= s.tAct).length
  const progress = lerp(0, 1, done / Math.max(1, tl.total))

  return (
    <AbsoluteFill style={{ background: `radial-gradient(1200px 700px at 85% 0%, rgba(183,121,31,.10), transparent 60%), ${C.bg}`, fontFamily: SANS, overflow: 'hidden' }}>
      {inScreen || r > tl.duration ? (
        <div style={{
          position: 'absolute', left: pl.x, top: pl.y, width: pl.w, height: pl.h,
          borderRadius: 18 * (1 - clamp((cam.z - 1) / 0.25)) + 2, overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(35,35,31,.22), 0 0 0 1px rgba(35,35,31,.08)',
          opacity: arrive, transform: `scale(${0.96 + 0.04 * arrive})`,
          // Out of focus under the closing card, so the words are all there is to read.
          filter: r > tl.duration ? `blur(${14 * ease(clamp((r - tl.duration) / 600))}px)` : undefined,
        }}>
          <Img src={staticFile(`rec/${id}/${shot.file}`)} style={{ width: '100%', height: '100%', display: 'block' }} />
          {ring && (
            <div style={{
              position: 'absolute', left: ring.x, top: ring.y, width: ring.w, height: ring.h, borderRadius: 12,
              border: `3px solid ${C.accent}`, opacity: ring.o,
              boxShadow: `0 0 0 6px ${C.accentSoft}${ring.dim ? ', 0 0 0 4000px rgba(24,22,18,.30)' : ''}`,
            }} />
          )}
        </div>
      ) : null}

      {ripple !== null && cursorOpacity > 0 && (
        <div style={{
          position: 'absolute', left: cur.x - (10 + 40 * ripple), top: cur.y - (10 + 40 * ripple),
          width: 2 * (10 + 40 * ripple), height: 2 * (10 + 40 * ripple), borderRadius: '50%',
          border: `3px solid ${C.accent}`, opacity: 0.8 * (1 - ripple),
        }} />
      )}
      {cursorOpacity > 0 && <div style={{ opacity: cursorOpacity }}><Cursor x={cur.x} y={cur.y} press={press} /></div>}

      {captionOn && (
        <div style={{ position: 'absolute', left: 0, right: 0, [captionTop ? 'top' : 'bottom']: 54, display: 'flex', justifyContent: 'center' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 22, maxWidth: 1400,
            background: 'rgba(35,35,31,.94)', color: C.linen, borderRadius: 18, padding: '22px 34px 22px 24px',
            boxShadow: '0 18px 50px rgba(0,0,0,.28)',
            opacity: cIn, transform: `translateY(${(1 - cIn) * (captionTop ? -16 : 16)}px)`,
          }}>
            <div style={{ flex: 'none', minWidth: 58, height: 58, borderRadius: 14, background: C.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontSize: 30, fontWeight: 600 }}>{step.n}</div>
            <div style={{ fontSize: 36, fontWeight: 500, lineHeight: 1.25 }}>{step.say}</div>
          </div>
        </div>
      )}

      {r >= 0 && r <= tl.duration + 300 && (
        <div style={{ position: 'absolute', left: 0, bottom: 0, height: 6, width: W * progress, background: C.accent, opacity: 1 - clamp((r - tl.duration) / 300) }} />
      )}

      {ms < INTRO_MS && <Intro tl={tl} ms={ms} />}
      {r > tl.duration && <Outro tl={tl} ms={r - tl.duration} />}
    </AbsoluteFill>
  )
}
