// For: a firm owner deciding whether to buy, watching on delpat.in. What they
// see: where enquiries land, a follow-up recorded, a listing and its photo
// link, the owner calling list, and how each agent's day went.
export default {
  title: 'A tour of the Real Estate CRM',
  summary: 'Leads, follow-ups, listings and your team, in one place.',
  as: 'owner', device: 'desk', start: '?screen=dashboard',
  steps: [
    { say: 'Each morning, the dashboard shows what needs attention today.', point: { role: 'button', name: /^Not contacted/ } },
    { say: 'Enquiries from the portals and your website arrive on their own.', point: { role: 'button', name: /^99acres/ }, zoom: 1.3 },
    { say: 'Open the follow-ups that are overdue.', click: { role: 'button', name: /^Follow-up overdue/ } },
    { say: 'Open the first one.', click: { css: 'tbody tr' } },
    { say: 'After a call, record what happened.', click: { role: 'button', name: 'Record call' } },
    { say: 'Pick how the call went.', choose: { css: 'select' }, option: 'Interested · scheduling a site visit', zoom: 1.4 },
    { say: 'Add a note.', type: { placeholder: 'What was said' }, text: 'Wants to visit on Saturday', zoom: 1.4 },
    { say: 'Save it.', click: { role: 'button', name: 'Save' }, zoom: 1.4 },
    { expect: { text: 'Wants to visit on Saturday' } },
    { say: 'Every call, message and visit stays on the lead.', point: { text: 'Wants to visit on Saturday' }, zoom: 1.3 },
    { say: 'Your listings are grouped by project.', click: { nav: 'Properties' } },
    { say: 'Open a project.', click: { text: 'Palm Grove Residency', exact: true } },
    { say: 'Open a flat.', click: { text: 'D-304', exact: true } },
    { say: 'Its photos carry your firm’s name, and one link sends them on WhatsApp.', point: { role: 'button', name: 'Copy photo link' }, zoom: 1.3 },
    { say: 'The calling list wins you new listings, project by project.', click: { nav: 'Calling' } },
    { say: 'And Performance shows how each agent’s day went.', click: { nav: 'Performance' } },
    { expect: { text: 'Needs attention' } },
  ],
  outro: 'Built by Delpat. Book a demo at delpat.in.',
}
