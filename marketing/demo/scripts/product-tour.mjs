// For: a firm owner deciding whether to buy, watching on delpat.in. A promo,
// not a tutorial: one line over each shot, chapters, a branded close. What
// they see: where enquiries land, a follow-up recorded, a listing and its
// photo link, the owner calling list, and how each agent's day went.
//
// A step with no `say` joins the line before it, so "record how it went"
// covers the outcome, the note and Save in one sentence.
export default {
  title: 'Real Estate CRM',
  summary: 'Every enquiry, call and listing, in one place.',
  as: 'owner', device: 'desk', start: '?screen=dashboard',
  steps: [
    { chapter: 'Today', say: 'Every morning, your dashboard shows what needs doing today.', point: { role: 'button', name: /^Not contacted/ } },
    { say: 'Enquiries from 99acres, MagicBricks, Housing.com and your website arrive on their own.', point: { role: 'button', name: /^99acres/ }, zoom: 1.3 },

    { chapter: 'Follow-ups', say: 'Open the overdue follow-ups, and pick up the first lead.', click: { role: 'button', name: /^Follow-up overdue/ } },
    { click: { css: 'tbody tr' } },
    { say: 'After the call, record how it went and what was said.', click: { role: 'button', name: 'Record call' } },
    { choose: { css: 'select' }, option: 'Interested · scheduling a site visit', zoom: 1.4 },
    { type: { placeholder: 'What was said' }, text: 'Wants to visit on Saturday', zoom: 1.4 },
    { click: { role: 'button', name: 'Save' }, zoom: 1.4 },
    { expect: { text: 'Wants to visit on Saturday' } },
    { say: 'It stays on the lead, for whoever picks it up next.', point: { text: 'Wants to visit on Saturday' }, zoom: 1.3 },

    { chapter: 'Listings', say: 'Listings are grouped by project, down to the flat.', click: { nav: 'Properties' } },
    { click: { text: 'Palm Grove Residency', exact: true } },
    { click: { text: 'D-304', exact: true } },
    { say: 'Photos carry your firm’s name, and one link sends them on WhatsApp.', point: { role: 'button', name: 'Copy photo link' }, zoom: 1.3 },

    { chapter: 'Your team', say: 'The calling list wins you new listings, project by project.', click: { nav: 'Calling' } },
    { say: 'And Performance shows how each agent’s day went.', click: { nav: 'Performance' } },
    { expect: { text: 'Needs attention' } },
  ],
  outro: 'Book a demo at delpat.in.',
  cta: 'delpat.in/real-estate-crm',
}
