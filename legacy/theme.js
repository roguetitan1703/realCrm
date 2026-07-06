// ============================================================================
// Bhumi Propcity CRM — single source-of-truth theme/brand config.
// White-label: swapping a tenant = editing THIS object only.
// Direction: "Desk" (charcoal stationery + a single ochre accent; the accent
// doubles as the money/won metal — no second brand colour). Chosen 2026-07-06.
// ============================================================================

window.theme = {
  // --- Tenant identity (brand swap lives here) -----------------------------
  brand: {
    firmName: "Bhumi Propcity",
    city: "Pune",
    deskLine: "Pune · Sales desk",   // chrome under the mobile nameplate
    officeLine: "Pune · Head office", // chrome under the desktop rail logo
    initials: "BP",
  },

  // --- Core brand palette (charcoal base + ONE accent) ---------------------
  color: {
    charcoal:   "#22242A", // primary identity — sidebar, brand chrome
    charcoalD:  "#191B20", // depth / pressed states
    accent:     "#B8791C", // OCHRE — the single accent. Money + won + active + primary metal ONLY
    accentTint: "#F3E7CC", // accent wash (banners, active tints)
    linen:      "#F1EFEA", // app background (warm neutral, not cream)
    card:       "#FCFBF8", // surfaces
    inkText:    "#1F2126", // primary text (near-black)
    line:       "#E1DDD3", // hairline borders / dividers
    mutedText:  "#6B6B66", // secondary text

    // legacy aliases (kept so un-migrated files don't crash mid-refactor) ----
    bottleGreen: "#22242A",
    deepPine:    "#191B20",
    brass:       "#B8791C",
    porcelain:   "#F1EFEA",
    sageLine:    "#E1DDD3",
  },

  // --- Type roles ----------------------------------------------------------
  type: {
    display: "'Fraunces', Georgia, serif",              // headings + ₹ figures (tabular)
    body:    "'IBM Plex Sans', system-ui, sans-serif",  // dense data + chrome
    deva:    "'IBM Plex Sans Devanagari', sans-serif",  // Marathi content
  },

  // --- Lead stage system: cold -> hot temperature ramp ---------------------
  // These stay functionally coloured — they encode data the owner scans for,
  // NOT brand. (Confirmed keep-as-signals, not monochrome.)
  stage: {
    New:          { label: "New",          color: "#3A7CA5", tint: "#E7EFF4" },
    Contacted:    { label: "Contacted",    color: "#2E9E8F", tint: "#E4F1EE" },
    "Site Visit": { label: "Site Visit",   color: "#C79028", tint: "#F7EFDC" },
    Negotiation:  { label: "Negotiation",  color: "#C2551F", tint: "#F7E5DA" },
    "Closed Won": { label: "Closed Won",   color: "#2E7D4E", tint: "#E2F0E7" },
    "Closed Lost":{ label: "Closed Lost",  color: "#8A5350", tint: "#EFE3E2" },
  },

  // --- Property status system ----------------------------------------------
  status: {
    Available:     { label: "Available",     color: "#2E7D4E", tint: "#E2F0E7" },
    "Under offer": { label: "Under offer",   color: "#C79028", tint: "#F7EFDC" },
    Closed:        { label: "Closed",        color: "#6E7A74", tint: "#EBEEEC" },
  },

  // --- Lead source chips ---------------------------------------------------
  source: {
    "99acres":     { label: "99acres",     color: "#C2551F" },
    MagicBricks:   { label: "MagicBricks", color: "#B23A2E" },
    "Walk-in":     { label: "Walk-in",     color: "#2E7D4E" },
    Referral:      { label: "Referral",    color: "#3A7CA5" },
    Website:       { label: "Website",     color: "#6E7A74" },
  },

  // --- System signals ------------------------------------------------------
  signal: {
    overdue: "#B23A2E",
    success: "#2E7D4E",
    whatsapp: "#1E7F5C",
  },
};
