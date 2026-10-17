// A prospect sees what an agent does all day from their phone: the to-do
// list, a call logged in a few taps, and the lead's history. Agent's phone.
// Targets pick the first row, not a named buyer: there's no reset between
// takes, and every logged call takes a row off the list.
export default {
  id: 'agent-day',
  title: "An agent's day, on the phone",
  summary: 'Who to call, what to say, and nothing forgotten.',
  as: 'agent',
  device: 'phone',
  start: '?screen=today',
  steps: [
    { chapter: 'To do', say: 'For your agents, the phone is the to-do list. Overdue first, then today, then what is coming up.', point: { role: 'button', name: /Overdue$/ } },
    { chapter: 'Calls', say: 'One tap calls the buyer.', click: { role: 'button', name: /^Call / } },
    { click: { role: 'button', name: 'Yes, continue' } },
    { say: 'After the call, pick how it went, and add a note.', choose: { css: 'select' }, option: 'Interested · scheduling a site visit' },
    { type: { placeholder: 'Add a remark…' }, text: 'Wants to tour on Saturday morning.' },
    { say: 'Save, and the follow-up is done. It leaves the list.', click: { role: 'button', name: 'Save', exact: true }, after: 600 },
    { chapter: 'History', say: 'Tap a buyer to see everything that has happened with them.', click: { role: 'button', name: /Overdue$/ } },
    { say: 'Homes that fit what they asked for are right here, ready to share.', point: { text: 'Shortlisted and matching' } },
    { say: 'And every call, message and change is kept, for whoever picks the buyer up next.', click: { text: 'Inquiry interaction timeline' }, after: 600 },
  ],
  outro: 'Your agents always know who to call next.',
  cta: 'delpat.in',
}
