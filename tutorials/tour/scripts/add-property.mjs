// For an agent or owner already on the CRM: add a new listing with its
// photos, then send the photos to a buyer. Desk, on a computer.
export default {
  id: 'add-property',
  title: 'Add a property with photos, and share it',
  summary: 'From a new listing to a link in your buyer’s hands.',
  as: 'owner',
  device: 'desk',
  start: '?screen=properties',
  steps: [
    { say: 'To add a new listing, open Properties and click Add property.', click: { role: 'button', name: 'Add property' }, zoom: 1.3 },
    { say: 'Pick the kind of home, and say where it is.', click: { role: 'button', name: 'Townhouse', exact: true }, zoom: 1.4 },
    { type: { placeholder: 'Skyline Heights' }, text: 'Cedar Row Townhomes', zoom: 1.4 },
    { type: { placeholder: 'Wakad' }, text: 'Mueller', zoom: 1.4 },
    { say: 'Add the bedrooms and the size.', click: { role: 'button', name: '3 bed', exact: true }, zoom: 1.4 },
    { type: { placeholder: '0' }, text: '1850', zoom: 1.4 },
    { click: { role: 'button', name: 'Next: Price & terms' }, zoom: 1.3 },
    { say: 'Add the asking price.', type: { placeholder: '95,00,000' }, text: '625000', zoom: 1.4 },
    { click: { role: 'button', name: 'Next: Details & media' }, zoom: 1.3 },
    { say: 'Drop in your photos.', upload: { text: 'Browse files', exact: true }, file: ['home-1.jpg', 'home-2.jpg', 'home-3.jpg'], zoom: 1.3, after: 1500 },
    { say: 'Save, and it joins your listings.', click: { role: 'button', name: 'Save property' }, zoom: 1.3, after: 1200 },
    { click: { role: 'button', name: /^Cedar Row Townhomes/ }, zoom: 1.3 },
    { click: { css: 'tbody tr:first-child td:nth-child(3)' }, after: 800 },
    { say: 'Every photo already carries your firm’s name.', point: { text: 'Cover', exact: true }, zoom: 1.6 },
    { say: 'Copy the photo link, and send it to a buyer.', click: { text: 'Copy photo link' }, zoom: 1.4, after: 800 },
  ],
  outro: 'Your new listing is ready to share.',
}
