import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import PhotoViewer from '../components/PhotoViewer.jsx'
import { PublicShell, Gone } from './Public.jsx'

// ============================================================================
// AN OLD PHOTO LINK — /<firm>/photos/<project>-<code> (7.5, then §A.4)
// ============================================================================
// Who opens it: a buyer or tenant, from a WhatsApp message sent before shared
// links existed. They want to look at the place.
//
// Photo links are no longer made; a home goes out through Send. The ones
// already in people's chats resolve on the fly (listing-pages.md §A.4): a home
// in the catalogue goes to its catalogue page, any other says it is no longer
// available and offers the catalogue. Never a dead end. Until the server
// answers that way, a link it still serves shows its photos as before.
//
// Mounted on its own (main.jsx), like /admin: no workspace, no sign-in.
export default function Gallery({ slug, refId }) {
  const [state, setState] = useState({ loading: true, data: null, failed: null })

  useEffect(() => {
    let live = true
    api.publicGallery(slug, refId)
      .then(r => {
        if (!live) return
        const to = r?.redirect || r?.redirectUrl
        if (to) { window.location.replace(to); return }
        setState({ loading: false, data: r?.success && (r.media || []).length ? r : null, failed: r?.success ? null : r })
      })
      .catch((e) => { if (live) setState({ loading: false, data: null, failed: e?.body || { offline: e instanceof TypeError } }) })
    return () => { live = false }
  }, [slug, refId])

  const d = state.data
  useEffect(() => {
    if (d) document.title = [d.project, d.firm?.name].filter(Boolean).join(' · ')
  }, [d])

  if (state.loading) {
    return (
      <div className="gv" aria-busy="true">
        <div className="gv-wrap"><div className="gv-bar gv-bar-wait" /><div className="gv-stage gv-stage-wait" /></div>
      </div>
    )
  }
  if (!d) {
    const f = state.failed || {}
    const firm = f.firm || null
    return (
      <PublicShell firm={firm} tenant={slug}>
        <Gone tenant={slug} firm={firm} offline={!!f.offline}
          title="This home is no longer available"
          catalogueUrl={f.catalogueUrl || `/${slug}/homes`} />
      </PublicShell>
    )
  }

  return (
    <div className="gv" style={d.firm.color ? { '--gv-accent': d.firm.color } : undefined}>
      <div className="gv-wrap">
        <header className="gv-bar">
          {d.firm.logoUrl
            ? <img className="gv-logo" src={d.firm.logoUrl} alt="" />
            : <span className="gv-mono">{(d.firm.name || '?').trim().slice(0, 1).toUpperCase()}</span>}
          <span className="gv-firm">{d.firm.name}</span>
        </header>
        {d.project && <h1 className="gv-title">{d.project}</h1>}
        <PhotoViewer media={d.media} title={d.project} />
      </div>
    </div>
  )
}
