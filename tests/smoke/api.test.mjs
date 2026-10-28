import test, { before } from 'node:test'
import assert from 'node:assert/strict'
import { TENANT, call, login, setup, AGENT, colleagueLead } from './helpers.mjs'

let owner, agent, other
before(async () => {
  owner = await setup()
  agent = await login(AGENT)
  other = await colleagueLead(owner)
})

test('signed out: reads and writes are refused with 401', async () => {
  for (const [m, p] of [['GET', '/workspace/pulse'], ['GET', '/workspace/today'], ['GET', '/leads'], ['GET', '/owners'],
                        ['POST', '/leads'], ['POST', '/owners'], ['POST', '/workspace/dedupe-check'], ['GET', '/team/users']]) {
    const r = await call(m, p, null, m === 'POST' ? {} : undefined)
    assert.equal(r.status, 401, `${m} ${p} signed out gave ${r.status}`)
  }
})

test('signed out: /workspace/resolve still works', async () => {
  const r = await call('GET', `/workspace/resolve?slug=${TENANT}`, null)
  assert.equal(r.status, 200)
})

test('agent: team/users and team/loads return only the agent', async () => {
  const u = await call('GET', '/team/users', agent)
  assert.equal(u.status, 200)
  assert.deepEqual((u.json.users || []).map(x => x.id), [AGENT.id])
  const l = await call('GET', '/team/loads', agent)
  assert.equal(l.status, 200)
  assert.deepEqual(Object.keys(l.json.loads), [AGENT.id])
})

test('agent: desk-summary counts only the agent own leads', async () => {
  const mine = await call('GET', '/leads/page?limit=1', agent)
  const ds = await call('GET', '/workspace/desk-summary', agent)
  assert.equal(ds.status, 200)
  assert.equal(ds.json.leads.total, mine.json.total)
})

test('agent: a colleague lead is not readable and not writable', async () => {
  assert.equal((await call('GET', `/leads/${other.id}`, agent)).status, 404)
  for (const [path, body] of [
    [`/records/${other.id}/actions/remark`, { text: 'smoke' }],
    [`/records/${other.id}/actions/contact-log`, { outcome: 'connected', channel: 'call', note: 'smoke' }],
    [`/records/${other.id}/actions/stage-change`, { new_stage_id: 'Interested' }],
    [`/records/${other.id}/actions/activity`, { type: 'meeting', outcome: 'interested' }],
  ]) {
    const r = await call('POST', path, agent, body)
    assert.ok([403, 404].includes(r.status), `POST ${path} gave ${r.status}`)
  }
  const patch = await call('PATCH', `/modules/leads/records/${other.id}`, agent, { stage: 'Interested' })
  assert.ok([403, 404].includes(patch.status), `PATCH record gave ${patch.status}`)
})

test('agent: owners bulk-assign, merge and imports are refused', async () => {
  assert.equal((await call('POST', '/owners/bulk-assign', agent, { ids: ['x'], agentId: AGENT.id })).status, 403)
  assert.equal((await call('POST', `/records/${other.id}/actions/merge`, agent, { duplicate_record_id: 'x' })).status, 403)
  assert.equal((await call('POST', '/imports', agent, {})).status, 403)
  assert.equal((await call('GET', '/imports', agent)).status, 403)
})

test('owner: bulk-assign with match and no expect is a 400', async () => {
  const r = await call('POST', '/owners/bulk-assign', owner, { match: {}, agentId: null })
  assert.equal(r.status, 400)
})

test('owner: bulk-assign with a wrong expect moves nothing (409)', async () => {
  const r = await call('POST', '/owners/bulk-assign', owner, { match: {}, agentId: null, expect: 1 })
  assert.equal(r.status, 409)
})
