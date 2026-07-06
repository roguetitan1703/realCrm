// ============================================================================
// Delpat CRM — single source-of-truth theme/brand config.
// White-label: swapping a tenant = editing THIS object only.
// Direction committed: "Nameplate" (brass-and-ink stationery of an
// established Pune firm, translated to product UI).
// ============================================================================

export const theme = {
  // --- Tenant identity (brand swap lives here) -----------------------------
  brand: {
    firmName: "Bhumi Realestate!",
    tagline: "Pune property, done right.",
    city: "Pune",
    initials: "BR",
  },

  // --- Core brand palette (6 named hexes) ----------------------------------
  color: {
    bottleGreen: "#143E34", // primary identity — top bar, brand chrome
    deepPine:    "#0C2B24", // depth / pressed states
    brass:       "#B0782B", // METAL accent — money + success ONLY
    porcelain:   "#F2EFE8", // app background (restrained warm, not cream)
    card:        "#FFFFFF", // surfaces
    inkText:     "#19211D", // primary text (greenish-black, not pure black)
    sageLine:    "#D7DCD2", // hairline borders / dividers
    mutedText:   "#5C665F", // secondary text
  },

  // --- Type roles ----------------------------------------------------------
  type: {
    display: "'Space Grotesk', system-ui, sans-serif", // brand + big ₹ figures
    body:    "'IBM Plex Sans', system-ui, sans-serif",  // dense data + chrome
    deva:    "'IBM Plex Sans Devanagari', sans-serif",  // Marathi content
    // numerals are set tabular for price alignment
  },

  // --- Lead stage system: cold → hot temperature ramp ----------------------
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
    overdue: "#B23A2E", // overdue follow-ups glow
    success: "#2E7D4E",
    whatsapp: "#1E7F5C", // bubble chrome (borrowed vernacular, muted to fit)
  },
};

export default theme;
