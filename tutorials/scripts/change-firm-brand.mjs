// The owner makes the desk carry the firm's own name, colour and logo.
// Owner's desk, on a computer.
export default {
  id: 'change-firm-brand',
  title: "Put your firm's name, colour and logo on the desk",
  summary: 'Everyone on your team sees them, on every screen.',
  as: 'owner',
  device: 'desk',
  start: '?screen=dashboard',
  steps: [
    { say: 'Open Settings from the sidebar', click: { nav: 'Settings' } },
    { say: 'Change the firm name', type: { placeholder: 'Your consultancy name' }, text: 'Harbourline Homes', clear: true, zoom: 1.5 },
    { say: 'Click Save', click: { role: 'button', name: 'Save', exact: true }, zoom: 1.5 },
    { say: "Pick your firm's colour", click: { role: 'button', name: 'Use #0F766E' }, zoom: 1.5, after: 800 },
    { say: 'Upload your logo', upload: { text: 'Upload logo', exact: true }, file: 'harbourline-logo.svg', zoom: 1.5, after: 900 },
    { expect: { text: 'Replace logo' } },
  ],
  outro: 'The new name, colour and logo are live for your whole team.',
}
