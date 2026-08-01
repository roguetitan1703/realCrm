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

import { useEffect, useState } from 'react'
import { api } from './api.js'

const FETCHERS = {
  property: (id) => api.getProperty(id).then(r => r?.property || null),
  lead: (id) => api.getLead(id).then(r => r?.lead || r?.record || null),
}

export function useRecord(store, kind, id) {
  const known = store.lookup(kind, id)
  const [state, setState] = useState({ loading: !known && !!id, error: null })

  useEffect(() => {
    if (!id || known) { setState({ loading: false, error: null }); return }
    const fetcher = FETCHERS[kind]
    if (!fetcher) { setState({ loading: false, error: `No fetcher for ${kind}` }); return }
    let live = true
    setState({ loading: true, error: null })
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
        const gone = /\b404\b|not found/i.test(err?.message || '')
        setState({ loading: false, error: gone ? 'not-found' : (err?.message || 'failed') })
      })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id, !!known])

  return { record: known, loading: state.loading, error: state.error }
}
