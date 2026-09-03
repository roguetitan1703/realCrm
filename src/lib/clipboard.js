// ============================================================================
// 📋 PUTTING TEXT ON THE CLIPBOARD
// ============================================================================
// Copying was written seven times, once per button, and every one of them had
// the same two faults.
//
// 1. `navigator.clipboard?.writeText(t).then(...)` THROWS when there is no
//    clipboard. The optional chain guards the property, not the call: with
//    `navigator.clipboard` undefined the expression is `undefined`, and
//    `.then` on undefined is a TypeError — which is not a rejected promise, so
//    the `.catch` beside it never runs. The button did nothing, said nothing,
//    and copied nothing. And it is undefined in exactly the case that matters:
//    the API is secure-context only, so any desk reached over plain http (a
//    phone pointed at a laptop on the same wifi) has none.
//
// 2. Two sites did not wait for the write at all — Admin's workspace
//    credentials flipped to "Copied" on the next line, whatever happened. A
//    confirmation that fires regardless is how somebody pastes the previous
//    contents of their clipboard into a client's chat believing it is the
//    thing they just copied.
//
// So: one function, it never throws, and it resolves to whether the text is
// actually on the clipboard. Every caller shows "Copied" on true and says so
// on false. The fallback is the old textarea + execCommand trick, which is
// deprecated and still the only thing that works without a secure context.
// ============================================================================

/**
 * Put `text` on the clipboard.
 * @returns {Promise<boolean>} true only if the write actually happened.
 */
export async function copyText(text) {
  const s = String(text ?? '')
  if (!s) return false

  // The real API, where it exists. Can still reject — a browser may refuse
  // outside a user gesture, or the user may have denied the permission.
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(s)
      return true
    }
  } catch (e) { /* fall through and try the old way */ }

  return legacyCopy(s)
}

/**
 * The pre-Clipboard-API path. Deprecated everywhere and still the only thing
 * available without a secure context, which is where our agents' phones are
 * when they test against a dev machine.
 */
function legacyCopy(s) {
  if (typeof document === 'undefined') return false
  const ta = document.createElement('textarea')
  ta.value = s
  // Off-screen but focusable, and NOT display:none — a hidden element cannot
  // be selected, which is the whole mechanism. readOnly stops iOS opening the
  // keyboard over whatever the person was reading.
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '-1000px'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  const restore = document.activeElement
  try {
    ta.select()
    // iOS ignores select() on a readonly field; the range is what it honours.
    ta.setSelectionRange(0, s.length)
    return document.execCommand('copy')
  } catch (e) {
    return false
  } finally {
    document.body.removeChild(ta)
    if (restore && typeof restore.focus === 'function') restore.focus()
  }
}
