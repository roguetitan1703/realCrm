// For: the product page on delpat.in. Not a video: run with `tutorial-videos
// snap page-snippets` to save each screen below as a live snapshot (real
// markup, real text), cropped to the part the page talks about.
export default {
  title: 'Product page snippets',
  as: 'owner', device: 'desk', start: '?screen=dashboard',
  steps: [
    { walk: false, point: { css: '.dash-kpis' }, snap: 'dashboard', crop: { css: '.app-body' }, pad: 0, maxH: 340, alt: 'The dashboard: leads not contacted, follow-ups overdue, callbacks due, and leads by source',
      cutouts: [{ at: { css: '.kpi' }, name: 'kpi', count: 4 }] },
    { walk: false, click: { nav: 'Leads' } },
    { walk: false, point: { css: 'tbody tr' }, snap: 'leads', crop: { css: '.list-body' }, pad: 0, maxW: 900, maxH: 470, alt: 'The leads list: requirement, budget, stage, source, agent and next follow-up',
      marks: [
        { at: { text: 'Interested', exact: true }, label: 'Stage, with the last remark' },
        { at: { text: 'Referral', exact: true }, label: 'Where the lead came from' },
      ],
      cutouts: [{ at: { css: 'tbody tr' }, name: 'lead-row', count: 4 }, { at: { css: '.stage' }, name: 'stage' }] },
    { walk: false, click: { nav: 'Calling' } },
    { walk: false, point: { css: '.list-body' }, snap: 'calling', crop: { css: '.list-body' }, pad: 0, maxW: 800, maxH: 470, alt: 'The owner calling list, grouped by project',
      marks: [
        { at: { text: '19 to call' }, label: 'Owners still to call' },
        { at: { role: 'button', name: 'Assign', nth: 3 }, label: 'Hand a project to an agent' },
      ],
      cutouts: [{ at: { css: '.projcard' }, name: 'project', count: 6, parts: { toCall: { css: '.pj-dot.avail' }, assign: { css: '.pj-assign' } } }] },
    { walk: false, click: { nav: 'Properties' } },
    { walk: false, click: { text: 'Palm Grove Residency', exact: true } },
    { walk: false, click: { text: 'D-304', exact: true } },
    { walk: false, point: { role: 'button', name: 'Copy photo link' }, snap: 'listing', crop: { css: '.app-body' }, pad: 0, maxW: 1040, maxH: 450, alt: 'A listing with its watermarked photos and the Copy photo link button',
      marks: [
        { at: { css: '.app-body img' }, label: 'Your firm’s name on every photo' },
        { at: { role: 'button', name: 'Copy photo link' }, label: 'One link, photos only' },
      ],
      cutouts: [
        { at: { css: '.app-body img' }, name: 'photo', count: 4 },
        { at: { role: 'button', name: 'Copy photo link' }, name: 'copy-link' },
        { at: { role: 'button', name: 'WhatsApp' }, name: 'whatsapp' },
      ] },
    { walk: false, click: { nav: 'Performance' } },
    { walk: false, point: { css: '.pv' }, snap: 'performance', crop: { css: '.pv' }, pad: 12, maxW: 900, maxH: 520, alt: 'Team performance: calls, pickups and missed follow-ups per agent',
      marks: [
        { at: { text: 'people contacted' }, label: 'The whole team' },
        { at: { text: 'Agents', exact: true }, label: 'And each agent' },
      ],
      cutouts: [
        { at: { css: '.pv-sum' }, name: 'perf-summary' },
        { at: { css: '.pv-donut-svg' }, name: 'perf-donut' },
        { at: { css: '.pv-legend' }, name: 'perf-legend' },
        { at: { css: 'button.pv-ag' }, name: 'perf-agent', count: 3 },
      ] },
    { expect: { text: 'Needs attention' } },
  ],
}
