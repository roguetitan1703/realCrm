// For an owner already on the CRM: bring in leads from a spreadsheet (an open
// house sign-in sheet, an old CRM's export). Owner's desk, on a computer.
export default {
  id: 'import-leads',
  title: 'Import your leads from a spreadsheet',
  summary: 'Bring a whole list in at once, ready to call.',
  as: 'owner',
  device: 'desk',
  start: '?screen=import',
  steps: [
    { say: 'Have your leads in a spreadsheet? Open Import, and choose Leads and contacts.', click: { role: 'button', name: /^Leads & contacts/ }, zoom: 1.3 },
    { say: 'Drop in the file.', upload: { text: 'Drop your Excel or CSV here' }, file: 'buyers.csv', zoom: 1.2, after: 1200 },
    { say: 'Your columns are matched for you. Check them, then check the file.', point: { text: 'Match your columns' }, zoom: 1.2 },
    { click: { role: 'button', name: 'Check the file' }, zoom: 1.4, after: 1200 },
    { say: 'You see every row before anything is saved: eight new buyers, no repeats.', point: { role: 'button', name: /^New 8/ }, zoom: 1.4 },
    { say: 'Import them, and they’re on your Leads list, ready to call.', click: { role: 'button', name: /^Import 8 records/ }, zoom: 1.4 },
    { expect: { text: '8 of 8' } },
    { point: { role: 'button', name: 'Import another file' }, zoom: 1.2, after: 1500 },
  ],
  outro: 'Your whole list is in, in under a minute.',
}
