// White-label config — swapping a tenant = editing THIS object only.
export const theme = {
  brand: {
    firmName: 'Bhumi Propcity',
    city: 'Pune',
    deskLine: 'Pune · Sales desk',
    officeLine: 'Pune · Head office',
    initials: 'BP',
  },
  // Design tokens live in styles.css (:root). These are the data-signal maps
  // the app reads for stage/status/source — kept here so a tenant can retune them.
  stages: ['New', 'Contacted', 'Site Visit', 'Negotiation', 'Closed Won', 'Closed Lost'],
  stageClass: {
    New: 'stage-new',
    Contacted: 'stage-contacted',
    'Site Visit': 'stage-visit',
    Negotiation: 'stage-nego',
    'Closed Won': 'stage-won',
    'Closed Lost': 'stage-lost',
  },
  statusClass: {
    Available: 'status-available',
    'Under offer': 'status-offer',
    Closed: 'status-closed',
  },
  sources: ['99acres', 'MagicBricks', 'Walk-in', 'Referral', 'Website'],
}

export const FIRM = theme.brand.firmName
