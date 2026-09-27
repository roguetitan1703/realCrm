// A manager adds a new sales agent, then puts them in the lead pool so new
// leads start reaching them. Owner's desk, on a computer.
export default {
  id: 'add-agent-to-lead-pool',
  title: 'Add a sales agent and give them leads',
  summary: 'Create their sign-in, then add them to the lead pool.',
  as: 'owner',
  device: 'desk',
  start: '?screen=dashboard',
  steps: [
    { say: 'Open Team from the sidebar', click: { nav: 'Team' } },
    { say: 'Click Add teammate', click: { role: 'button', name: 'Add teammate' } },
    { say: 'Type their full name', type: { placeholder: 'e.g. Kiran Patil' }, text: 'Priya Shah', zoom: 1.6 },
    { say: 'Leave the access on Sales agent', point: { text: 'Sales agent', exact: true }, zoom: 1.6 },
    { say: 'Add their mobile number', type: { placeholder: '98xxx xxxxx' }, text: '9955570101', zoom: 1.6 },
    { say: 'Click Add to team', click: { role: 'button', name: 'Add to team' }, zoom: 1.6 },
    { say: 'Copy the User ID and temporary password, and send them to Priya', click: { role: 'button', name: 'Copy' }, zoom: 1.6, after: 1600 },
    { say: 'Click Done', click: { role: 'button', name: 'Done' }, zoom: 1.6, waitEnabled: true },
    { say: 'Now open Settings', click: { nav: 'Settings' } },
    { say: 'Open Assigning', click: { role: 'button', name: 'Assigning' } },
    { say: 'Tick Priya to add them to the lead pool', click: { role: 'checkbox', name: /Priya/ }, zoom: 1.5 },
    { say: 'Click Save changes', click: { role: 'button', name: 'Save changes' }, zoom: 1.5 },
    // Proof the video shows something that worked. In test mode this is the test.
    { expect: { role: 'checkbox', name: /Priya/, checked: true } },
    { expect: { text: 'No changes' } },
  ],
  outro: 'Priya can sign in now, and new leads will reach them in turn.',
}
