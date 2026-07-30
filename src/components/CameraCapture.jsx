import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'

// ============================================================================
// 📸 CameraCapture — LIVE camera only, never the gallery
// ============================================================================
// The spec is explicit and the reason is the whole feature: a visit selfie has
// to be taken at the property, now. So this opens the camera stream directly
// with getUserMedia and grabs a frame from it.
//
// It deliberately does NOT use <input type="file" capture>. That attribute is
// only a *hint* — every major mobile browser still lets the user back out to
// the photo picker, which would make an old or borrowed photo submittable and
// quietly defeat the point. A live MediaStream has no such escape hatch.
//
// Rear camera is the default: agents photograph the property with the client,
// and 'environment' is what a phone should open for that. The flip control is
// there because some agents do take an actual selfie with the client.
// ============================================================================

export default function CameraCapture({ onCapture, onError }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [facing, setFacing] = useState('environment')
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false

    async function start() {
      stop()
      setReady(false)
      setErr('')
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('This browser cannot open the camera. Use the app on your phone to log a visit.')
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
        // The effect can be torn down while getUserMedia is still resolving;
        // without this the stream leaks and the camera light stays on.
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setReady(true)
      } catch (e) {
        const msg = e?.name === 'NotAllowedError'
          ? 'Camera access is off for this site. Turn it on in your browser settings to log a visit.'
          : e?.name === 'NotFoundError'
            ? 'No camera found on this device.'
            : e?.message || 'The camera could not be opened.'
        if (!cancelled) { setErr(msg); onError?.(msg) }
      }
    }

    function stop() {
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    start()
    return () => { cancelled = true; stop() }
  }, [facing])

  const shoot = () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    const ctx = canvas.getContext('2d')
    // The front camera preview is mirrored so it feels like a mirror; the
    // saved frame must not be, or text in the shot comes out backwards.
    if (facing === 'user') {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(b => b && onCapture(b), 'image/jpeg', 0.92)
  }

  if (err) {
    return (
      <div className="cam-err">
        <Icon name="alert" />
        <p>{err}</p>
      </div>
    )
  }

  return (
    <div className="cam">
      <div className="cam-stage">
        <video
          ref={videoRef}
          playsInline
          muted
          className={'cam-video' + (facing === 'user' ? ' cam-mirror' : '')}
        />
        {!ready && <div className="cam-loading">Opening camera…</div>}
      </div>
      <div className="cam-bar">
        <button
          type="button"
          className="cam-flip"
          onClick={() => setFacing(f => (f === 'user' ? 'environment' : 'user'))}
          aria-label="Switch camera"
        >
          <Icon name="refresh" />
        </button>
        <button
          type="button"
          className="cam-shutter"
          onClick={shoot}
          disabled={!ready}
          aria-label="Take photo"
        />
        <span className="cam-hint">Live photo only</span>
      </div>
    </div>
  )
}
