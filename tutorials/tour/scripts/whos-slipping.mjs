// For owners and managers already on the CRM: the new week view of the
// Performance screen, and how to spot the agent who is falling behind.
// Owner's desk, on a computer.
export default {
  id: 'whos-slipping',
  title: "New: see who's falling behind",
  summary: 'Your team’s week, day by day, on the Performance screen.',
  as: 'owner',
  device: 'desk',
  start: '?screen=performance',
  steps: [
    { say: 'Switch Performance to the last seven days.', click: { role: 'button', name: 'Today' }, zoom: 1.4 },
    { click: { role: 'button', name: '7 days' }, zoom: 1.4 },
    { say: 'Each bar is a day of calls.', point: { role: 'button', name: /^Thu, Oct 15/ }, zoom: 1.25 },
    { say: 'Each agent shows days worked, and the change on last week.', point: { role: 'button', name: /^Justin Harris/ }, zoom: 1.4 },
    { say: 'Click an agent to open their week.', click: { role: 'button', name: /^Justin Harris/ }, zoom: 1.4 },
    { say: 'Days worked, calls, and who picked up, against last week.', point: { text: 'days worked' }, zoom: 1.5 },
    { say: 'Falling behind? Reassign their leads right here.', point: { role: 'button', name: 'Reassign' }, zoom: 1.5 },
  ],
}
