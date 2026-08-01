// ============================================================================
// 📖 Server-backed list state
// ============================================================================
// Every list screen used to be handed the module's ENTIRE collection and slice
// it in the browser: filter, search, sort and "pagination" were all array work
// over data already downloaded in full. That is why one launch shipped ~10MB and
// why page 2 never touched the network — the pager was real UI over a boundary
// that did not exist.
//
// This is the other half. A screen keeps exactly the state it always kept
// (filters, search, sort, page) and this turns that state into one request for
// the page being shown. Three things it has to get right, none optional:
//
//   • Type-ahead is debounced, so a search is one request when the typing stops
//     rather than one per keystroke.
//   • Responses are sequenced. Two requests in flight can land out of order, and
//     the older one would otherwise overwrite the newer with stale rows.
//   • Rows from the previous query stay on screen while the next one loads. A
//     list that blanks on every keystroke is worse than one that lags.

import { useEffect, useRef, useState } from 'react'

const SEARCH_DEBOUNCE = 300

/**
 * @param fetcher  (params) => Promise<{ data, total, pages }> — the module's own
 *                 API call. Called with { page, limit, q, ...filters }.
 * @param query    { filters, search, sortKey, sortDir, page, pageSize, accumulate }
 *                 `accumulate` is the phone's "load more": each page is appended
 *                 to what is already on screen instead of replacing it.
 * @param deps     extra values that invalidate the current result (e.g. the
 *                 change token from the live-refresh pulse).
 */
export function useServerList(fetcher, query, deps = []) {
  const { filters, search, sortKey, sortDir, page = 1, pageSize = 20, accumulate = false } = query || {}

  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: null })
  const seq = useRef(0)
  const rowsRef = useRef([])

  // Debounce only the search box. A filter or a page tap is a decision already
  // made — waiting 300ms to honour it just feels broken.
  const [debouncedSearch, setDebouncedSearch] = useState(search || '')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search || ''), SEARCH_DEBOUNCE)
    return () => clearTimeout(t)
  }, [search])

  const filterKey = JSON.stringify(filters || {})
  const depKey = JSON.stringify(deps)

  useEffect(() => {
    const mine = ++seq.current
    setState(s => ({ ...s, loading: true, error: null }))

    Promise.resolve(fetcher({
      page, limit: pageSize, q: debouncedSearch || undefined,
      sortKey, sortDir, ...(filters || {}),
    }))
      .then(res => {
        if (mine !== seq.current) return   // a newer query already answered
        const rows = res?.data || []
        const merged = accumulate && page > 1 ? [...rowsRef.current, ...rows] : rows
        rowsRef.current = merged
        setState({ rows: merged, total: res?.total ?? merged.length, loading: false, error: null })
      })
      .catch(err => {
        if (mine !== seq.current) return
        // Keep whatever is on screen. A dropped request is not a reason to throw
        // away rows the user is reading.
        setState(s => ({ ...s, loading: false, error: err?.message || 'Could not load' }))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, debouncedSearch, sortKey, sortDir, page, pageSize, accumulate, depKey])

  // A changed query starts the list over, so an accumulated phone list does not
  // keep page 1 of the old filter under page 1 of the new one.
  useEffect(() => { rowsRef.current = [] }, [filterKey, debouncedSearch, sortKey, sortDir, pageSize])

  return state
}
