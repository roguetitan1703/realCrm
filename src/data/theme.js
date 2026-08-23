import { LEAD_STATUSES, STATUS_CLASS, TERMINAL_STATUSES } from './leadStatus.js'
// White-label config. `brand` is DELIBERATELY EMPTY: the firm's name and city
// come from the signed-in tenant at runtime (src/lib/tenant.js). A default here
// is not a convenience — it is a wrong firm name printed on a real client's
// message, which is exactly what happened when 'Skyline Realty' lived here.
export const theme = {
  brand: {
    firmName: '',
    city: '',
    initials: '',
  },
  // Design tokens live in styles.css (:root). These are the data-signal maps
  // the app reads for stage/status/source — kept here so a tenant can retune them.
  stages: [...LEAD_STATUSES],
  stageClass: { ...STATUS_CLASS },
  // Keys must be exactly the STATUS values (src/data/propertyFields.js) — an
  // unmatched key means the tag falls through to the default styling, which is
  // how an Available listing once rendered as closed. 'Under offer' (lowercase
  // o) was a leftover that matched nothing and hid the missing entry.
  statusClass: {
    Available: 'status-available',
    'Token Pending': 'status-offer',
    'Under Offer': 'status-offer',
    Leased: 'status-closed',
    Blocked: 'status-closed',
    'Off-Market': 'status-closed',
    Closed: 'status-closed',
    Sold: 'status-closed',
    Let: 'status-closed',
  },
  sources: ['99acres', 'MagicBricks', 'Walk-in', 'Referral', 'Website'],
}

export const FIRM = theme.brand.firmName

// TWO TEMPLATES, AND THEY ARE NOT THE SAME KIND OF THING.
//
// `whatsappIntroTemplate` is the WHATSAPP MESSAGE: it is filled in from a lead
// — name, requirement, locality, source — and sent to that one buyer when the
// button is pressed. It cannot be used without a lead in front of it.
//
// `introMessage` is the INTRO MESSAGE: a standing sentence about the firm and
// the person sending it, with no lead in it at all, for pasting anywhere. Every
// agent can read it; only the desk can change it.
//
// The key name `whatsappIntroTemplate` is a leftover from when there was one
// template called "intro" and it is NOT renamed here: it is what every tenant's
// settings JSON already holds, and a rename would hand a paying client back the
// default in place of the sentence they wrote. The label is the part the desk
// reads. Same call, same reason, as `reminderDays` in Settings → Response times.
export const DEFAULT_WHATSAPP_INTRO = 'Hello {name}, I received your inquiry for a {requirement} in {locality} via {source}. I am reaching out from {firmName}. We have several excellent options matching your preferences. When would be a convenient time to connect over a quick call?'

export const DEFAULT_INTRO_MESSAGE = 'Hello, this is {agentName} from {firmName}. We work on residential property in the area — happy to help if you are looking to buy, sell or rent.'

// Default editable settings — the store seeds from these, then owns them. Renaming
// a stage / adding a source in Settings mutates state, never this object.
export const DEFAULT_SETTINGS = {
  firmName: theme.brand.firmName,
  stages: [...theme.stages],
  sources: [...theme.sources],
  whatsappIntroTemplate: DEFAULT_WHATSAPP_INTRO,
  introMessage: DEFAULT_INTRO_MESSAGE,
}

// Tenant brand identity lives on the tenant row (tenants.brand_config), NOT in
// settings — one source shared by the live UI and the PWA icons. This is the
// frontend default until the server's brand hydrates.
export const DEFAULT_BRAND = {
  primaryColor: '#1E6F52',
  surfaceColor: '#F6F5F2',
  logoUrl: '',
}

// Terminal statuses can't be renamed or removed — reporting, the won/lost
// counts and every "is this still open" question key off them by name.
export const PROTECTED_STAGES = [...TERMINAL_STATUSES]

// A stage's colour class. Built-in stages use the curated map; custom stages get a
// stable palette class by hashing the name so the colour never flickers.
const CUSTOM_STAGE_CLASSES = ['stage-c1', 'stage-c2', 'stage-c3', 'stage-c4', 'stage-c5']
export function stageClassFor(stage) {
  if (theme.stageClass[stage]) return theme.stageClass[stage]
  let h = 0
  for (let i = 0; i < stage.length; i++) h = (h * 31 + stage.charCodeAt(i)) >>> 0
  return CUSTOM_STAGE_CLASSES[h % CUSTOM_STAGE_CLASSES.length]
}
