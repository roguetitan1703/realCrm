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

// Default editable settings — the store seeds from these, then owns them. Renaming
// a stage / adding a source in Settings mutates state, never this object.
export const DEFAULT_SETTINGS = {
  firmName: theme.brand.firmName,
  stages: [...theme.stages],
  sources: [...theme.sources],
}

// Closed stages are terminal and can't be renamed/removed — the app keys logic off
// them (`stage.startsWith('Closed')`), so they're protected in the editor.
export const PROTECTED_STAGES = ['Closed Won', 'Closed Lost']

// A stage's colour class. Built-in stages use the curated map; custom stages get a
// stable palette class by hashing the name so the colour never flickers.
const CUSTOM_STAGE_CLASSES = ['stage-c1', 'stage-c2', 'stage-c3', 'stage-c4', 'stage-c5']
export function stageClassFor(stage) {
  if (theme.stageClass[stage]) return theme.stageClass[stage]
  let h = 0
  for (let i = 0; i < stage.length; i++) h = (h * 31 + stage.charCodeAt(i)) >>> 0
  return CUSTOM_STAGE_CLASSES[h % CUSTOM_STAGE_CLASSES.length]
}
