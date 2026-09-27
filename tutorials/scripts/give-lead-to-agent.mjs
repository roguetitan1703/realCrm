// A manager finds the leads nobody is working and gives one to an agent.
// Owner's or manager's desk, on a computer.
export default {
  id: 'give-lead-to-agent',
  title: 'Give an unassigned lead to an agent',
  summary: 'Find the leads nobody is working, and hand one over.',
  as: 'owner',
  device: 'desk',
  start: '?screen=dashboard',
  steps: [
    { say: 'Open Leads from the sidebar', click: { nav: 'Leads' } },
    { say: 'Open the Agent filter', click: { role: 'button', name: /^Agent/ }, zoom: 1.5 },
    { say: 'Choose Unassigned', click: { role: 'button', name: /^Unassigned/ }, zoom: 1.5, after: 400 },
    { say: "Click the lead's Sales executive", click: { in: 'Kavya Menon', css: '.own-btn' }, zoom: 1.25 },
    { say: 'Pick the agent to give it to', click: { role: 'button', name: 'Sana', exact: true }, zoom: 1.25, after: 600 },
    // Given away, it leaves the Unassigned list.
    { expect: { gone: 'Kavya Menon' } },
  ],
  outro: 'Sana has the lead now, and it is off the unassigned list.',
}
