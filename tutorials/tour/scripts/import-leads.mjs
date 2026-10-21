// For an owner already on the CRM: bring in leads from a spreadsheet (an open
// house sign-in sheet, an old CRM's export), fix the rows that could not come
// in and bring those in too, and undo an import. Owner's desk, on a computer.
// The sheet has twelve buyers, three with no usable phone number (the one
// thing a lead must have); open-house-fixed.csv is the downloaded file with
// the numbers added. Each run adds these phone numbers to the firm: re-record
// on a rebuilt demo firm, or with new numbers in both files.
export default {
  id: 'import-leads',
  title: 'Import your leads from a spreadsheet',
  summary: 'Bring a whole list in, fix what didn’t fit, undo a mistake.',
  as: 'owner',
  device: 'desk',
  start: '?screen=import',
  steps: [
    { say: 'Have your leads in a spreadsheet? Open Import, and choose Leads and contacts.', chapter: 'Import a list', click: { role: 'button', name: /^Leads & contacts/ }, zoom: 1.3 },
    { say: 'Drop in the file.', upload: { text: 'Drop your Excel or CSV here' }, file: 'open-house-leads.csv', zoom: 1.2, after: 1200 },
    { say: 'Your columns are matched for you. Check them, then check the file.', point: { text: 'Match your columns' }, zoom: 1.2 },
    { click: { role: 'button', name: 'Check the file' }, zoom: 1.4, after: 1200 },
    { say: 'Every row is checked before anything is saved. Nine are ready, and three can’t come in yet.', point: { role: 'button', name: /^New 9/ }, zoom: 1.4 },
    { say: 'Click to see why. These three have no phone number.', click: { role: 'button', name: /^Cannot import 3/ }, zoom: 1.4, after: 800 },
    { say: 'Import the nine that are ready.', click: { role: 'button', name: /^Import 9/ }, zoom: 1.4 },
    { expect: { text: 'Import complete' } },
    { say: 'Now download the three that didn’t import. Each row says why.', chapter: 'Fix the rows that didn’t fit', click: { role: 'button', name: 'Download the rows that did not import' }, zoom: 1.3, after: 600 },
    { say: 'Add the missing numbers, and bring the same file back in.', click: { role: 'button', name: 'Import another file' }, zoom: 1.3 },
    { click: { role: 'button', name: /^Leads & contacts/ }, zoom: 1.3 },
    { upload: { text: 'Drop your Excel or CSV here' }, file: 'open-house-fixed.csv', zoom: 1.2, after: 1200 },
    { click: { role: 'button', name: 'Check the file' }, zoom: 1.4, after: 1200 },
    { say: 'All three are ready now. Import them.', point: { role: 'button', name: /^New 3/ }, zoom: 1.4 },
    { click: { role: 'button', name: /^Import 3/ }, zoom: 1.4 },
    { expect: { text: 'Import complete' } },
    { say: 'Imported something by mistake? Every import is kept in History.', chapter: 'Undo an import', click: { role: 'button', name: 'View history' }, zoom: 1.3, after: 600 },
    { say: 'Undo it, and every record it added is taken out again.', click: { role: 'button', name: /Undo import/ }, zoom: 1.4, after: 1200 },
    { expect: { text: 'Undone' } },
  ],
  outro: 'Your whole list is in, and any import can be undone.',
}
