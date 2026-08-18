// ============================================================================
// 🔎 One record, on demand
// ============================================================================
// The desk holds every lead and every property in memory, so opening a record
// has always been `collection.find(r => r.id === id)` — free, but only because
// something already paid ~10MB to download the collection. There are 27 of those
// lookups across the app and they are the single largest reason the whole book
// has to be in the browser at all.
//
// This is the replacement. A screen asks for the record it is showing; the store
// answers from cache (or, while they still exist, from the in-memory collection)
// and otherwise fetches that one record. A miss is a normal outcome.
//
// It deliberately does NOT report "loading" for a cache hit, so a record you
// already have renders on the first frame rather than flashing a spinner.

import { useEffect, useRef, useState } from 'react'
import { api } from './api.js'

const FETCHERS = {
  property: (id) => api.getProperty(id).then(r => r?.property || null),
  lead: (id) => api.getLead(id).then(r => r?.lead || r?.record || null),
}

/**
 * A CACHE HIT IS ONLY GOOD UNTIL SOMETHING IS WRITTEN.
 *
 * This effect was gated on `!!known`, so once a record was in the cache it was
 * never asked for again — for the life of the tab. Every server-derived change
 * to an open record was therefore invisible until a manual browser refresh:
 * a site visit logged with its photo, GPS fix and outcome went to the database
 * and the timeline underneath it kept showing the history from before the
 * visit. The write had worked every time; the screen was reading a snapshot.
 *
 * `mutationTick` is the counter every server-backed LIST already watches
 * (dispatched by `settled()` after a confirmed write). A record screen now
 * watches it too, so one token moves the whole desk forward. Refetching is
 * silent — `known` keeps rendering while the request is in flight, so a saved
 * remark does not blink the record out and back.
 */
export function useRecord(store, kind, id) {
  const known = store.lookup(kind, id)
  const tick = store.state.mutationTick || 0
  const [state, setState] = useState({ loading: !known && !!id, error: null })
  // What we last fetched, and the write-counter we fetched it at. Adopting a
  // cache hit counts as having fetched it — otherwise opening a record the
  // list already paged in would cost a request the cache exists to avoid.
  const seen = useRef({ key: '', tick: -1 })

  useEffect(() => {
    if (!id) { setState({ loading: false, error: null }); return }
    const key = `${kind}:${id}`
    if (seen.current.key !== key) seen.current = { key, tick: known ? tick : -1 }
    if (known && seen.current.tick === tick) { setState({ loading: false, error: null }); return }
    const fetcher = FETCHERS[kind]
    if (!fetcher) { setState({ loading: false, error: `No fetcher for ${kind}` }); return }
    seen.current = { key, tick }
    let live = true
    // Only a record we have nothing to show for gets a spinner.
    if (!known) setState({ loading: true, error: null })
    fetcher(id)
      .then(rec => {
        if (!live) return
        if (rec) store.cacheRecords(kind, [rec])
        // A real 404 is a deleted record, not a failure — the screen says
        // "Not found", which is the truth.
        setState({ loading: false, error: rec ? null : 'not-found' })
      })
      // A 404 means the record is gone, which is a different thing to say than
      // "something went wrong" — the request worked, the record gave the answer.
      .catch(err => {
        if (!live) return
        const gone = /404|not found/i.test(err?.message || '')
        setState({ loading: false, error: gone ? 'not-found' : (err?.message || 'failed') })
      })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id, tick])

  return { record: known, loading: state.loading, error: state.error }
}
