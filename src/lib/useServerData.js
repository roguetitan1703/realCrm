// ============================================================================
// 📥 One server read, held for as long as a screen needs it
// ============================================================================
// The counterpart to useServerList (pages) and useRecord (one record by id):
// this is for the reads that are neither — a project header, the buyers matched
// to one listing, the desk counters. Every one of those used to be a filter or
// a reduce over a collection the browser had downloaded in full.
//
// Deliberately small. It fetches when its deps change, ignores a response that
// a newer request has already superseded, and reports failure as failure rather
// than as an empty result — a screen that says "no buyers" when the request
// actually failed is lying about the data.

import { useEffect, useRef, useState } from 'react'

export function useServerData(fetcher, deps = [], initial = null) {
  const [state, setState] = useState({ data: initial, loading: true, error: null })
  const seq = useRef(0)

  useEffect(() => {
    const mine = ++seq.current
    setState(s => ({ ...s, loading: true, error: null }))
    Promise.resolve(fetcher())
      .then(data => {
        if (mine !== seq.current) return
        setState({ data, loading: false, error: null })
      })
      .catch(err => {
        if (mine !== seq.current) return
        setState({ data: initial, loading: false, error: err?.message || 'Could not load' })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
