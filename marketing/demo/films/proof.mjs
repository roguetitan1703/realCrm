// For: deciding whether the reel engine (one camera, one world, live UI) is
// the way the product film is made. Fifteen seconds of it, on the demo firm's
// real screens (record-call-walkthrough and page-snippets snapshots).
//
//   tutorial-videos film proof --config marketing/demo/tutorials.config.mjs
export default {
  title: 'Reel proof',
  lines: [
    { id: 'a', say: 'Every enquiry, call and listing, in one place.' },
    { id: 'b', say: 'Open what is overdue, make the call, and record how it went.', gap: 300 },
    { id: 'c', say: 'It stays on the lead, for whoever calls next.', gap: 3700 },
  ],
  // The product, laid out in one space: the screens the camera works on at
  // depth 0, the rest further back.
  actors: {
    list: { page: 'record-call-walkthrough/wt-02.html', x: 0, y: 0 },
    dash: { page: 'record-call-walkthrough/wt-01.html', x: -1800, y: -1000 },
    lead: { page: 'record-call-walkthrough/wt-04.html', x: 1800, y: 1000 },
    calling: { page: 'page-snippets/calling.html', x: 1800, y: -1000, z: -500, ry: -8 },
    listing: { page: 'page-snippets/listing.html', x: -1800, y: 1000, z: -500, ry: 8 },
    perf: { page: 'page-snippets/performance.html', x: 0, y: -2100, z: -900 },
  },
  targets: {
    name: { actor: 'list', at: { css: 'tbody tr:first-child .name' } },
    row: { actor: 'list', at: { css: 'tbody tr:first-child' } },
    overdue: { actor: 'dash', at: { role: 'button', name: /^Follow-up overdue/ } },
    record: { actor: 'lead', at: { role: 'button', name: 'Record call' } },
    overlay: { actor: 'lead', at: { css: '.overlay' } },
    modal: { actor: 'lead', at: { css: '.modal' } },
    outcome: { actor: 'lead', at: { css: '.modal select' } },
    remark: { actor: 'lead', at: { css: '.modal textarea' } },
    save: { actor: 'lead', at: { css: '.lc-foot .btn-primary' } },
  },
  shots: [
    // A name types in, close enough to read the letters; the camera pulls
    // back through its row and its list to the whole product.
    { at: 0, camera: 'name', fill: 0.34, move: 'cut' },
    { at: 150, type: 'name', cps: 11 },
    { at: '@a:call', camera: 'row', fill: 0.92, move: 'push' },
    { at: '@a:listing', camera: 'list', fill: 0.9, move: 'push' },
    { at: '@a:one', camera: 'world', fill: 0.95, move: 'push', dur: 1600, ry: -6 },
    { at: '@a:place', title: ['In one place.'], until: '@a.end+700' },

    // Dive into the overdue count, click it, whip to the list it opens. The
    // line is quick; the actions keep their own rhythm under it, each one
    // settled before the camera moves on.
    { at: '@b:open', camera: 'dash', fill: 0.92, move: 'push', dur: 900 },
    { at: '@b.start+800', camera: 'overdue', fill: 0.5, move: 'push', dur: 800 },
    { at: '@b.start+1350', click: 'overdue' },
    { at: '@b.start+1600', camera: 'row', fill: 0.8, move: 'whip' },
    { at: '@b.start+2250', click: 'row' },

    // The lead: record the call, in place, in one shot.
    { at: '@b.start+2500', camera: 'record', fill: 0.14, move: 'whip' },
    { at: '@b.start+3150', click: 'record' },
    { at: '@b.start+3270', open: 'overlay', from: 'record', grow: 'modal' },
    { at: '@b.start+3700', camera: 'modal', fill: 0.82, move: 'glide' },
    { at: '@b.start+4500', click: 'outcome' },
    { at: '@b.start+5400', choose: 'outcome', option: 'Interested' },
    { at: '@b.start+5400', enable: 'save' },
    { at: '@b.start+5750', click: 'remark' },
    { at: '@b.start+5900', type: 'remark', text: 'Wants to visit on Saturday', cps: 18 },
    { at: '@c:stays', click: 'save' },
    { at: '@c:stays', press: 'save' },
    { at: '@c:stays+350', close: 'overlay', grow: 'modal' },

    // Back out to the product.
    { at: '@c:lead', camera: 'lead', fill: 0.9, move: 'push' },
    { at: '@c:next', camera: 'world', fill: 0.95, move: 'push', dur: 1600, ry: 6 },
  ],
}
