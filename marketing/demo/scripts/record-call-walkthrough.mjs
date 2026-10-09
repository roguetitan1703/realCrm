// For: a firm owner on delpat.in who wants to try it, not watch it. Run with
// `tutorial-videos snap record-call-walkthrough`: one snapshot before each
// action, played on the page as click-to-advance hotspots.
export default {
  title: 'Record a call',
  as: 'owner', device: 'desk', start: '?screen=dashboard',
  steps: [
    { say: 'Open the follow-ups that are overdue.', click: { role: 'button', name: /^Follow-up overdue/ } },
    { say: 'Open a lead.', click: { css: 'tbody tr' } },
    { say: 'After the call, record it.', click: { role: 'button', name: 'Record call' } },
    { say: 'Pick how it went.', choose: { css: 'select' }, option: 'Interested · scheduling a site visit' },
    { say: 'Add what was said.', type: { placeholder: 'What was said' }, text: 'Wants to visit on Saturday' },
    { say: 'Save it.', click: { role: 'button', name: 'Save' } },
    { expect: { text: 'Wants to visit on Saturday' } },
  ],
  outro: 'Saved on the lead, for whoever calls next.',
}
