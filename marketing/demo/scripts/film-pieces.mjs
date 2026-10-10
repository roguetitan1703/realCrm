// For: the product film (films/product-film.mjs). Components a film enlarges
// well past their size on screen, snapped with their photos kept at 6x the
// size they are shown at (`images`), so they stay sharp in the film. Not a
// video: `tutorial-videos snap film-pieces --no-reset` (it changes nothing).
export default {
  title: 'Film pieces',
  as: 'owner', device: 'desk', start: '?screen=properties',
  images: 6,
  steps: [
    { walk: false, click: { text: 'Palm Grove Residency', exact: true } },
    { walk: false, click: { text: 'D-304', exact: true } },
    { walk: false, point: { role: 'button', name: 'Copy photo link' }, snap: 'listing', alt: 'A listing with its photos',
      cutouts: [{ at: { css: '.app-body img' }, name: 'photo', count: 4 }] },
    { expect: { role: 'button', name: 'Copy photo link' } },
  ],
}
