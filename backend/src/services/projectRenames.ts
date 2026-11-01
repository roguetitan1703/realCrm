/**
 * RENAME PROJECTS — "merge projects" (Work OS #155, docs/specs/projects.md §6).
 *
 * A project is not stored; it is the `project` text grouped by projectNorm().
 * Typos ("godrej Hill retrate") are their own key and their own card, with the
 * flats and the calling rows split between them. Merging two cards is
 * therefore a rename of the text: pick the cards, pick the name, and every
 * property and calling-list row carrying any of those keys gets that name.
 * Properties are not merged into one another; leads' `req.interest` is what
 * the enquiry said and is not touched (D3).
 *
 * A property holds the name in four places (project, config.society,
 * config.project, the title before " - "). Each copy is rewritten only where
 * ITS OWN key is in the picked set, so a row whose society names another
 * project keeps that contradiction for a person to settle rather than having
 * one more copy guessed at.
 *
 * Every changed row is saved with what it held before and what was written,
 * so Undo puts back only the rows still holding what the rename wrote; a row
 * changed since is kept and counted, as revertImport does.
 */
import { randomBytes } from 'crypto';
import { sql } from './db.js';
import { getContext } from './context.js';
import { audit } from './audit.js';
import { projectNorm, PROJECT_KEY, type ActorCtx } from './store.js';
import { ForbiddenError, isDeskRole } from '../lib/permissions.js';

/** How long a rename can be undone (D6). */
export const UNDO_DAYS = 30;
const MAX_NAME = 120;

export class RenameError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, any> = {}) { super(message); }
}

/** The workspace for a WRITE comes from the request and nowhere else: a
 *  fallback tenant here would rename a demo firm's rows on a real firm's say. */
function writeTenant(): string {
  const c = getContext();
  if (!c?.tenantId) throw new ForbiddenError('No workspace on this request.');
  if (!isDeskRole(c.role)) throw new ForbiddenError('Only an owner or a manager can rename projects.');
  return c.tenantId;
}

/** Spaces trimmed and collapsed; nothing else. Capitalising typed names is
 *  the form's job (capitaliseWords), as with every other typed field. */
export function cleanName(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

type PropRow = { id: string; project: string | null; society: string | null; cfgProject: string | null; title: string | null };
type OwnerRow = { id: string; project: string | null };
type Change =
  | { t: 'p'; id: string; before: Omit<PropRow, 'id'>; after: Omit<PropRow, 'id'> }
  | { t: 'o'; id: string; before: { project: string | null }; after: { project: string | null } };

/** The keys to rename, as projectNorm computes them in SQL, so membership is
 *  decided by the same expression the cards group on. The target's own key is
 *  in the set too: its odd spellings take the chosen one. */
async function normsOf(q: any, keys: string[], to: string): Promise<{ picked: string[]; all: string[] }> {
  const rows = await q`
    SELECT DISTINCT ${projectNorm(sql`k`)} AS n, false AS target FROM unnest(${keys}::text[]) AS x(k)
    UNION ALL SELECT ${projectNorm(sql`${to}::text`)}, true`;
  const picked = (rows as any[]).filter(r => !r.target).map(r => r.n).filter(Boolean);
  const target = (rows as any[]).find(r => r.target)?.n;
  return { picked, all: [...new Set([...picked, target].filter(Boolean))] };
}

/** Every row the rename would change, with its before and after. One read
 *  for the preview and the write, so the count confirmed is the count moved. */
async function plan(q: any, t: string, keys: string[], to: string, lock: boolean) {
  const { picked, all } = await normsOf(q, keys, to);
  if (picked.length < 1) throw new RenameError(400, 'Pick at least one project.');
  const forUpdate = lock ? sql`FOR UPDATE` : sql``;
  const props = await q`
    SELECT id, project, config->>'society' AS society, config->>'project' AS cfg_project, title,
           ${projectNorm(PROJECT_KEY)} AS kn,
           ${projectNorm(sql`project`)} AS pn,
           ${projectNorm(sql`config->>'society'`)} AS sn,
           ${projectNorm(sql`config->>'project'`)} AS cn,
           ${projectNorm(sql`split_part(coalesce(title, ''), ' - ', 1)`)} AS tn,
           position(' - ' in coalesce(title, '')) AS dash
      FROM crm_properties
     WHERE tenant_id = ${t} AND ${projectNorm(PROJECT_KEY)} IN ${sql(all)}
     ORDER BY id ${forUpdate}`;
  const owners = await q`
    SELECT id, project, ${projectNorm(sql`project`)} AS pn
      FROM crm_owners
     WHERE tenant_id = ${t} AND ${projectNorm(sql`project`)} IN ${sql(all)}
     ORDER BY id ${forUpdate}`;
  const inSet = (n: string | null) => !!n && all.includes(n);

  const changes: Change[] = [];
  // What the dialog shows: each spelling on the picked cards, with its rows.
  const spellings = new Map<string, { name: string; norm: string; properties: number; owners: number }>();
  const spell = (name: string, norm: string, k: 'properties' | 'owners') => {
    const s = spellings.get(name) || { name, norm, properties: 0, owners: 0 };
    s[k]++; spellings.set(name, s);
  };
  for (const r of props as any[]) {
    spell(r.project || String(r.title || '').split(' - ')[0], r.kn, 'properties');
    const before = { project: r.project, society: r.society, cfgProject: r.cfg_project, title: r.title };
    const after = { ...before, project: to };
    if (inSet(r.sn)) after.society = to;
    if (inSet(r.cn)) after.cfgProject = to;
    if (inSet(r.tn) && r.title) after.title = r.dash > 0 ? `${to}${String(r.title).slice(r.dash - 1)}` : to;
    const same = before.project === after.project && before.society === after.society
      && before.cfgProject === after.cfgProject && before.title === after.title;
    if (!same) changes.push({ t: 'p', id: r.id, before, after });
  }
  for (const r of owners as any[]) {
    spell(r.project, r.pn, 'owners');
    if (r.project !== to) changes.push({ t: 'o', id: r.id, before: { project: r.project }, after: { project: to } });
  }
  return {
    picked,
    changes,
    spellings: [...spellings.values()].sort((a, b) => (b.properties + b.owners) - (a.properties + a.owners)),
    properties: changes.filter(c => c.t === 'p').length,
    owners: changes.filter(c => c.t === 'o').length,
  };
}

function readInput(body: any): { keys: string[]; to: string } {
  const keys = Array.isArray(body?.keys) ? [...new Set(body.keys.map((k: any) => String(k ?? '')).filter(Boolean))] as string[] : [];
  const to = cleanName(body?.to);
  if (!keys.length) throw new RenameError(400, 'Pick at least one project.');
  if (keys.length > 50) throw new RenameError(400, 'Pick at most 50 projects at a time.');
  if (!to) throw new RenameError(400, 'Give the name to keep.');
  if (to.length > MAX_NAME) throw new RenameError(400, `A project name is at most ${MAX_NAME} characters.`);
  return { keys, to };
}

/** POST /properties/projects/rename/preview → what a rename would do. */
export async function previewRename(body: any) {
  const t = writeTenant();
  const { keys, to } = readInput(body);
  const p = await plan(sql, t, keys, to, false);
  return { to, spellings: p.spellings, properties: p.properties, owners: p.owners };
}

/**
 * POST /properties/projects/rename { keys, to, expect: { properties, owners } }.
 * One transaction: the rows, their timeline events, the rename record. If the
 * rows have moved since the preview, nothing is written and the new counts
 * come back (409), as bulk-assign does with `expect`.
 */
export async function renameProjects(body: any, ctx: ActorCtx) {
  const t = writeTenant();
  const { keys, to } = readInput(body);
  const expect = body?.expect;
  if (!expect || !Number.isFinite(Number(expect.properties)) || !Number.isFinite(Number(expect.owners))) {
    throw new RenameError(400, 'expect { properties, owners } is required');
  }
  const author = getContext()?.userId ?? ctx.actorId ?? 'System';
  const id = `prn_${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;

  const out = await sql.begin(async (tx: any) => {
    const p = await plan(tx, t, keys, to, true);
    if (p.properties !== Number(expect.properties) || p.owners !== Number(expect.owners)) {
      throw new RenameError(409, `The projects now hold ${p.properties} properties and ${p.owners} owners to rename. Nothing was renamed.`,
        { properties: p.properties, owners: p.owners });
    }
    if (!p.changes.length) return { properties: 0, owners: 0, changes: p.changes, picked: p.picked };
    await applyRows(tx, t, p.changes, 'after');
    await tx`
      INSERT INTO crm_project_renames (id, tenant_id, kind, to_name, from_keys, rows, actor_id)
      VALUES (${id}, ${t}, 'rename', ${to}, ${p.picked}::text[], ${sql.json(p.changes as any)}, ${ctx.actorId ?? null})`;
    await timeline(tx, t, p.changes, author, id, 'rename');
    return { properties: p.properties, owners: p.owners, changes: p.changes, picked: p.picked };
  });
  if (!out.changes.length) return { renameId: null, to, properties: 0, owners: 0 };
  audit({
    tenant_id: t, actor_type: ctx.actorType || 'user', actor_id: ctx.actorId ?? null,
    actor_label: ctx.actorLabel ?? null, action: 'project.renamed', target_type: 'project', target_id: id,
    summary: `${out.properties} propert${out.properties === 1 ? 'y' : 'ies'} and ${out.owners} owner(s) renamed to ${to}`,
    metadata: { renameId: id, to, fromKeys: out.picked, properties: out.properties, owners: out.owners },
    ip: ctx.ip, user_agent: ctx.userAgent,
  });
  return { renameId: id, to, properties: out.properties, owners: out.owners };
}

/** Write each row's `before` or `after`, in two statements. With `onlyIf`,
 *  a row is written only while it still holds `onlyIf` (Undo). Returns the
 *  ids written. */
async function applyRows(tx: any, t: string, changes: Change[], side: 'before' | 'after', onlyIf?: 'before' | 'after'): Promise<Set<string>> {
  const done = new Set<string>();
  const ps = changes.filter(c => c.t === 'p') as Extract<Change, { t: 'p' }>[];
  const os = changes.filter(c => c.t === 'o') as Extract<Change, { t: 'o' }>[];
  if (ps.length) {
    const v = ps.map(c => c[side]);
    const g = onlyIf ? ps.map(c => c[onlyIf]) : null;
    // config keys are set when the target value is a string and removed when
    // it is null; a row whose config was null stays null if neither key is set.
    const rows = await tx`
      UPDATE crm_properties p SET
        project = v.project,
        title = v.title,
        config = CASE WHEN v.soc IS NULL AND v.cp IS NULL AND (p.config IS NULL OR NOT (p.config ? 'society' OR p.config ? 'project')) THEN p.config
                 ELSE (coalesce(p.config, '{}'::jsonb) - 'society' - 'project')
                      || jsonb_strip_nulls(jsonb_build_object('society', v.soc, 'project', v.cp)) END,
        updated_at = NOW()
      FROM unnest(${ps.map(c => c.id)}::text[], ${v.map(x => x.project)}::text[], ${v.map(x => x.title)}::text[],
                  ${v.map(x => x.society)}::text[], ${v.map(x => x.cfgProject)}::text[],
                  ${g ? g.map(x => x.project) : ps.map(() => null)}::text[], ${g ? g.map(x => x.title) : ps.map(() => null)}::text[],
                  ${g ? g.map(x => x.society) : ps.map(() => null)}::text[], ${g ? g.map(x => x.cfgProject) : ps.map(() => null)}::text[])
           AS v(id, project, title, soc, cp, gp, gt, gs, gc)
      WHERE p.tenant_id = ${t} AND p.id = v.id
        ${onlyIf ? sql`AND p.project IS NOT DISTINCT FROM v.gp AND p.title IS NOT DISTINCT FROM v.gt
                       AND p.config->>'society' IS NOT DISTINCT FROM v.gs AND p.config->>'project' IS NOT DISTINCT FROM v.gc` : sql``}
      RETURNING p.id`;
    for (const r of rows as any[]) done.add(r.id);
  }
  if (os.length) {
    const rows = await tx`
      UPDATE crm_owners o SET project = v.project, updated_at = NOW()
        FROM unnest(${os.map(c => c.id)}::text[], ${os.map(c => c[side].project)}::text[],
                    ${onlyIf ? os.map(c => c[onlyIf].project) : os.map(() => null)}::text[]) AS v(id, project, gp)
       WHERE o.tenant_id = ${t} AND o.id = v.id
         ${onlyIf ? sql`AND o.project IS NOT DISTINCT FROM v.gp` : sql``}
      RETURNING o.id`;
    for (const r of rows as any[]) done.add(r.id);
  }
  return done;
}

/** One timeline event per row, one INSERT (as recordAssignment does). The old
 *  name stays on the record's history. */
async function timeline(tx: any, t: string, changes: Change[], author: string, renameId: string, kind: 'rename' | 'undo') {
  if (!changes.length) return;
  const now = new Date().toISOString();
  const rows = changes.map((c, i) => ({
    id: `evt_${Date.now()}_${i}_${randomBytes(3).toString('hex')}`,
    record_id: c.id,
    type: kind === 'rename' ? 'project_renamed' : 'project_rename_undone',
    title: kind === 'rename' ? 'Project renamed' : 'Project rename undone',
    description: kind === 'rename' ? `Was "${c.before.project ?? ''}"` : `Back to "${c.before.project ?? ''}"`,
    author,
    timestamp: now,
    metadata: sql.json({ renameId, from: c.before.project ?? null, to: c.after.project ?? null }) as any,
    tenant_id: t,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    await tx`INSERT INTO crm_timeline_events ${sql(rows.slice(i, i + 500) as any[],
      'id', 'record_id', 'type', 'title', 'description', 'author', 'timestamp', 'metadata', 'tenant_id')}`;
  }
}

/**
 * GET /properties/projects/renames — the renames that can still be undone:
 * the last 30 days, not undone, and not followed by a later rename that
 * changed any of the same rows (undo that one first).
 */
export async function listUndoableRenames() {
  const c = getContext();
  if (!c?.tenantId || !isDeskRole(c.role)) return [];
  const rows = await sql`
    SELECT r.id, r.to_name, r.from_keys, r.created_at,
           ${projectNorm(sql`r.to_name`)} AS to_norm,
           (SELECT count(*) FROM jsonb_array_elements(r.rows) e WHERE e->>'t' = 'p')::int AS properties,
           (SELECT count(*) FROM jsonb_array_elements(r.rows) e WHERE e->>'t' = 'o')::int AS owners
      FROM crm_project_renames r
     WHERE r.tenant_id = ${c.tenantId} AND r.undone_at IS NULL
       AND r.created_at > NOW() - make_interval(days => ${UNDO_DAYS}::int)
       AND NOT EXISTS (${laterOverlap(sql`r`)})
     ORDER BY r.created_at DESC`;
  return (rows as any[]).map(r => ({
    id: r.id, to: r.to_name, toNorm: r.to_norm, fromKeys: r.from_keys,
    properties: r.properties, owners: r.owners, at: r.created_at,
  }));
}

/** A later, live rename in the same firm that changed one of `r`'s rows. */
const laterOverlap = (r: any) => sql`
  SELECT 1 FROM crm_project_renames l
   WHERE l.tenant_id = ${r}.tenant_id AND l.undone_at IS NULL AND l.created_at > ${r}.created_at
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(l.rows) le, jsonb_array_elements(${r}.rows) re
                  WHERE le->>'t' = re->>'t' AND le->>'id' = re->>'id')`;

/** POST /properties/projects/renames/:id/undo → { restored, kept }. */
export async function undoRename(id: string, ctx: ActorCtx) {
  const t = writeTenant();
  const author = getContext()?.userId ?? ctx.actorId ?? 'System';
  const out = await sql.begin(async (tx: any) => {
    const [r] = await tx`
      SELECT r.* FROM crm_project_renames r
       WHERE r.id = ${id} AND r.tenant_id = ${t} FOR UPDATE`;
    if (!r) throw new RenameError(404, 'Not found');
    if (r.undone_at) throw new RenameError(409, 'This rename has already been undone.');
    if (new Date(r.created_at).getTime() < Date.now() - UNDO_DAYS * 86400000) {
      throw new RenameError(409, `A rename can be undone for ${UNDO_DAYS} days.`);
    }
    const [later] = await tx`SELECT 1 AS x FROM crm_project_renames r WHERE r.id = ${id} AND r.tenant_id = ${t} AND EXISTS (${laterOverlap(sql`r`)})`;
    if (later) throw new RenameError(409, 'A later rename changed these rows. Undo that one first.');
    const changes = (r.rows || []) as Change[];
    const restored = await applyRows(tx, t, changes, 'before', 'after');
    await tx`UPDATE crm_project_renames SET undone_at = NOW() WHERE id = ${id} AND tenant_id = ${t}`;
    await timeline(tx, t, changes.filter(c => restored.has(c.id)), author, id, 'undo');
    return { restored: restored.size, kept: changes.length - restored.size, to: r.to_name };
  });
  audit({
    tenant_id: t, actor_type: ctx.actorType || 'user', actor_id: ctx.actorId ?? null,
    actor_label: ctx.actorLabel ?? null, action: 'project.rename_undone', target_type: 'project', target_id: id,
    summary: `Rename to ${out.to} undone: ${out.restored} row(s) restored, ${out.kept} kept`,
    metadata: { renameId: id, restored: out.restored, kept: out.kept },
    ip: ctx.ip, user_agent: ctx.userAgent,
  });
  return { restored: out.restored, kept: out.kept };
}
