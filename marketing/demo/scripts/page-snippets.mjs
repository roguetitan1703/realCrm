// For: the product page on delpat.in. Not a video: run with `tutorial-videos
// snap page-snippets` to save each screen below as a live snapshot (real
// markup, real text), cropped to the part the page talks about.
export default {
  title: 'Product page snippets',
  as: 'owner', device: 'desk', start: '?screen=dashboard',
  steps: [
    { walk: false, point: { css: '.dash-kpis' }, snap: 'dashboard', crop: { css: '.app-body' }, pad: 0, maxH: 340, alt: 'The dashboard: leads not contacted, follow-ups overdue, callbacks due, and leads by source' },
    { walk: false, click: { nav: 'Leads' } },
    { walk: false, point: { css: 'tbody tr' }, snap: 'leads', crop: { css: '.list-body' }, pad: 0, maxW: 900, maxH: 470, alt: 'The leads list: requirement, budget, stage, source, agent and next follow-up' },
    { walk: false, click: { nav: 'Calling' } },
    { walk: false, point: { css: '.list-body' }, snap: 'calling', crop: { css: '.list-body' }, pad: 0, maxW: 800, maxH: 470, alt: 'The owner calling list, grouped by project' },
    { walk: false, click: { nav: 'Properties' } },
    { walk: false, click: { text: 'Palm Grove Residency', exact: true } },
    { walk: false, click: { text: 'D-304', exact: true } },
    { walk: false, point: { role: 'button', name: 'Copy photo link' }, snap: 'listing', crop: { css: '.app-body' }, pad: 0, maxW: 1040, maxH: 450, alt: 'A listing with its watermarked photos and the Copy photo link button' },
    { walk: false, click: { nav: 'Performance' } },
    { walk: false, point: { css: '.pv' }, snap: 'performance', crop: { css: '.pv' }, pad: 12, maxW: 900, maxH: 520, alt: 'Team performance: calls, pickups and missed follow-ups per agent' },
    { expect: { text: 'Needs attention' } },
  ],
}
