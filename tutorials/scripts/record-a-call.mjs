// An agent calls a new lead from their phone and records how it went, in one
// thumb, between calls. Agent's phone.
export default {
  id: 'record-a-call',
  title: 'Call a lead and record how it went',
  summary: 'From your phone, straight from your to-do list.',
  as: 'agent',
  device: 'phone',
  start: '?screen=today',
  steps: [
    { say: 'Tap the phone icon next to the lead', click: { role: 'button', name: 'Call Riya Kapoor' } },
    { say: 'Tap Yes, continue. Your phone dials them.', click: { role: 'button', name: 'Yes, continue' } },
    { say: 'After the call, choose how it went', choose: { css: 'select' }, option: 'Interested · scheduling a site visit' },
    { say: 'Add a short note', type: { placeholder: 'Add a remark…' }, text: 'Wants a 2 BHK in Hinjewadi. Visit on Saturday.' },
    { say: 'Tap Save', click: { role: 'button', name: 'Save', exact: true } },
    // Called, Riya is no longer waiting on the to-do list.
    { expect: { gone: 'Riya Kapoor' } },
  ],
  outro: 'The call and your note are on the lead, and your manager sees them.',
}
