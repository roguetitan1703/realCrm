/**
 * A SLIDING-WINDOW LIMIT, in this process's memory — for the pages anyone can
 * open without signing in (routes/public.ts). One API process serves each
 * environment, so memory is the whole truth; a restart forgets, which costs an
 * attacker nothing they did not already have and costs a real buyer nothing.
 *
 * `hit(key, max, windowMs)` records one use and says whether it is allowed.
 * Keys are bucket + IP (+ phone, for the enquiry form). Old entries are swept
 * on a timer so the map cannot grow without end.
 */
const buckets = new Map<string, number[]>();

export function hit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (buckets.get(key) || []).filter(t => now - t < windowMs);
  if (list.length >= max) { buckets.set(key, list); return false; }
  list.push(now);
  buckets.set(key, list);
  return true;
}

/** Has this key already used up its allowance, without spending one? */
export function spent(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  return (buckets.get(key) || []).filter(t => now - t < windowMs).length >= max;
}

const sweep = setInterval(() => {
  const now = Date.now();
  for (const [k, list] of buckets) {
    const keep = list.filter(t => now - t < 60 * 60 * 1000);
    if (keep.length) buckets.set(k, keep); else buckets.delete(k);
  }
}, 5 * 60 * 1000);
sweep.unref?.();
