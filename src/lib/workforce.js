/**
 * WHO CAN BE GIVEN WORK — the browser's reading of the server's one answer
 * (backend/src/services/workforce.ts). The server sends `canTakeWork` on every
 * agent: a login in this firm, not deleted, status active. Every picker and
 * both rotas read it from here, so a person the server would refuse is never
 * offered.
 */

export const canWork = (a) => a?.canTakeWork === true

/** Why someone on a rota gets nothing, in the words the owner would use. */
export const notWorkableReason = (a) => {
  if (!a || a.departed) return 'Left the team'
  if (a.suspended) return 'Suspended'
  return 'No login'
}

/** The server refuses a non-workable target with 422 not_workable. */
export const isNotWorkable = (err) =>
  err?.status === 422 && (err?.body?.code === 'not_workable' || err?.body?.error === 'not_workable')

/** The refusal in words, naming the person the server named. */
export const notWorkableText = (err) =>
  `${err?.body?.name || 'That person'} can no longer be given work. Pick someone else.`

/**
 * An assignment the server refused. A not_workable refusal means the team
 * changed since this screen loaded, so the team is re-read and the pickers stop
 * offering that person. Returns true when it was that refusal.
 */
export const assignFailed = (store, err, fallback = 'Could not assign') => {
  if (isNotWorkable(err)) {
    store.toast(notWorkableText(err), 'warn')
    store.reloadServer?.(true)
    return true
  }
  store.toast(err?.message || fallback, 'warn')
  return false
}
