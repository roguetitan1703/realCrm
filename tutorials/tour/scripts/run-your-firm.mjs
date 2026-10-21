// A prospect sees what the owner of a brokerage gets from their desk: the
// day at a glance, leads that arrive and find an agent, the team's week, the
// listings and the firm's own brand. Owner's desk, on a computer.
export default {
  id: 'run-your-firm',
  title: 'Running your firm from one screen',
  summary: 'Leads, agents, listings and your brand, in one place.',
  as: 'owner',
  device: 'desk',
  start: '?screen=dashboard',
  steps: [
    { chapter: 'Your day', say: 'This is the owner’s dashboard. Leads nobody has called, follow-ups that are late, and leads going cold.', point: { role: 'button', name: /^Follow-up overdue/ }, zoom: 1.25 },
    { say: 'Every lead is labelled with where it came from: listing sites, your website, referrals.', point: { role: 'button', name: /^Referral/ }, zoom: 1.25 },
    { chapter: 'Leads', click: { nav: 'Leads' } },
    { say: 'Enquiries arrive on their own, and each one goes straight to an agent.', point: { role: 'button', name: /^JH Justin$/ }, zoom: 1.25 },
    { say: 'You see what each buyer wants, their budget, where it stands, and who has it.', point: { role: 'button', name: /^Follow-Up$/ }, zoom: 1.25 },
    { say: 'Ready-made lists show who needs you. Here, every follow-up that is late.', click: { role: 'button', name: /^Follow-up overdue/ }, zoom: 1.25, after: 600 },
    { chapter: 'Your team', say: 'Performance shows how each agent is really doing.', click: { nav: 'Performance' } },
    { say: 'Look at the last seven days.', click: { role: 'button', name: 'Today' }, zoom: 1.25 },
    { click: { role: 'button', name: '7 days' }, zoom: 1.25, after: 800 },
    { say: 'Calls made each day, and how many people picked up.', point: { role: 'button', name: /^Thu, Oct 15/ } },
    { say: 'Who worked every day this week, and who is falling behind.', point: { role: 'button', name: /^Justin Harris/ }, zoom: 1.4 },
    { chapter: 'Listings', click: { nav: 'Properties' } },
    { say: 'Your listings, for sale and for rent, grouped by building.', point: { role: 'button', name: /^Halberd Lofts/ } },
    { say: 'Open a group to see every home in it.', click: { role: 'button', name: /^Halberd Lofts/ } },
    { click: { css: 'tbody tr:first-child td:nth-child(3)' }, after: 600 },
    { say: 'Every photo carries your firm’s name, so it stays yours when it is forwarded.', point: { text: 'Cover', exact: true }, zoom: 1.6 },
    { say: 'And it points out a client who is looking for a home like this one.', point: { text: 'Send to' }, zoom: 1.4 },
    { chapter: 'Your brand', say: 'The whole app wears your firm’s name, colour and logo. Not ours.', click: { nav: 'Settings' } },
    { point: { role: 'button', name: 'Use #1E6F52' }, zoom: 1.4, after: 600 },
  ],
  outro: 'Every lead answered, every agent in view, all under your own name.',
  cta: 'delpat.in',
}
