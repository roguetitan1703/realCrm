// For: delpat.in/real-estate-crm and anywhere the product is introduced. A
// firm owner who has not seen it learns, in about a minute, what it does for
// them. Not a recording: motion-graphics scenes built from the real app's
// components on the invented demo firm (cut by `tutorial-videos extract` from
// the page-snippets and record-call-walkthrough snapshots). Every line says
// only what the product does today.
//
//   tutorial-videos film product-film --config marketing/demo/tutorials.config.mjs
//   → out/product-film-aurora.mp4 and out/product-film-mono.mp4
export default {
  title: 'Real Estate CRM by Delpat',
  uses: ['page-snippets', 'record-call-walkthrough', 'film-pieces'],
  scenes: [
    {
      kind: 'title', kicker: 'Real Estate CRM by Delpat',
      headline: ['Every enquiry, call and listing,', 'in one place.'],
      image: 'screens/dashboard.png',
      say: 'Every enquiry, call and listing, in one place.',
    },
    {
      kind: 'scatter', eyebrow: 'The problem',
      headline: ['Most firms run on', 'four inboxes and a notebook.'],
      items: ['99acres', 'MagicBricks', 'Housing.com', 'WhatsApp', 'Walk-ins', 'Excel sheets', 'A notebook', 'Missed calls'],
      into: { base: 'page-snippets', cutout: 'lead-row-1', show: 760, label: 'One list' },
      say: 'Most firms run on four inboxes and a notebook, and some enquiries are never called.',
    },
    {
      kind: 'stack', eyebrow: 'Leads', base: 'page-snippets',
      headline: ['Every enquiry', 'becomes a lead.'],
      sources: ['99acres', 'MagicBricks', 'Housing.com', 'Your website'],
      rows: ['lead-row-1', 'lead-row-2', 'lead-row-3', 'lead-row-4'], show: 720,
      tiles: ['kpi-1', 'kpi-3'],
      focus: { cutout: 'stage', in: 'lead-row-1', label: 'Stage, with the last remark' },
      say: 'Enquiries from the portals and your website arrive as leads, and go to your agents in turn.',
    },
    {
      kind: 'tiles', eyebrow: 'Today', base: 'page-snippets',
      headline: ['What needs doing,', 'every morning.'],
      tiles: ['kpi-1', 'kpi-2', 'kpi-3', 'kpi-4'],
      say: 'Every morning, the dashboard shows who has not been contacted, which follow-ups are overdue, and which leads are going cold.',
    },
    {
      kind: 'screens', eyebrow: 'Record a call', base: 'record-call-walkthrough',
      // The current capture's end screen was taken mid-save; stop on the last
      // stage until the walkthrough is snapped again (after a reset).
      end: false,
      say: 'Open an overdue follow-up, make the call, and record how it went. It stays on the lead, for whoever picks it up next.',
    },
    {
      kind: 'fan', eyebrow: 'Listings', base: 'page-snippets',
      headline: ['Your firm’s name', 'on every photo.'],
      // From film-pieces: the photos kept sharp enough to enlarge.
      photos: ['photo-1', 'photo-2', 'photo-3', 'photo-4'], photosBase: 'film-pieces',
      // Where the firm's name sits on the first photo, in its CSS px.
      watermark: { x: 2.5, y: 3.5, w: 40, h: 10.5 }, watermarkLabel: 'Your firm’s name',
      button: 'copy-link', send: 'whatsapp', gatherLabel: 'One link. Photos only.',
      say: 'Listing photos carry your firm’s name. One link sends them on WhatsApp, without the price or the flat number.',
    },
    {
      kind: 'grid', eyebrow: 'Calling owners', base: 'page-snippets',
      headline: ['Win listings,', 'project by project.'],
      cards: ['project-1', 'project-2', 'project-3', 'project-4', 'project-5', 'project-6'],
      // Palm Grove Residency; its parts as measured by `extract`.
      focus: {
        card: 'project-6',
        parts: [
          { part: 'toCall', label: 'Owners still to call' },
          { part: 'assign', label: 'Hand it to an agent' },
        ],
      },
      say: 'The calling list wins you new listings, project by project. Hand a whole project to an agent in one step.',
    },
    {
      kind: 'board', eyebrow: 'For the owner', base: 'page-snippets',
      headline: ['See who is', 'working the book.'],
      summary: 'perf-summary', donut: 'perf-donut', legend: 'perf-legend',
      agents: ['perf-agent-1', 'perf-agent-2', 'perf-agent-3'], agentsLabel: 'Agent by agent',
      say: 'And you see how each agent’s day went: calls, pickups, and what came of them.',
    },
    {
      kind: 'device', eyebrow: 'On the phone',
      headline: ['Built for agents', 'between calls.'],
      image: 'screens/phone-today.png', note: 'Installs from the browser. No app store.',
      // Parts of the phone screen, as fractions of its width and height.
      parts: [
        { x: 0.03, y: 0.15, w: 0.23, h: 0.028, label: 'Overdue first', side: 'left' },
        { x: 0.856, y: 0.183, w: 0.11, h: 0.07, label: 'One tap to call', side: 'right' },
        { x: 0.03, y: 0.74, w: 0.33, h: 0.028, label: 'Then callbacks due', side: 'left' },
      ],
      say: 'Agents get their day as one list on the phone, installed from the browser.',
    },
    {
      kind: 'close', kicker: 'Real Estate CRM by Delpat',
      headline: ['Book a demo.'], cta: 'delpat.in/real-estate-crm',
      orbit: [['page-snippets', 'stage'], ['page-snippets', 'kpi-1'], ['page-snippets', 'photo-1'], ['page-snippets', 'whatsapp'], ['page-snippets', 'project-6'], ['page-snippets', 'kpi-2'], ['page-snippets', 'copy-link'], ['page-snippets', 'photo-3']],
      say: 'Book a demo at delpat.in.',
    },
  ],
}
