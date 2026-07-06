// ============================================================================
// Bhumi Propcity CRM — vanilla port of the Delpat CRM design.
// Behavior mirrors the original DCLogic component exactly; rendering is done
// with a tiny hyperscript helper (h) instead of the .dc React runtime.
// ============================================================================
(function () {
"use strict";

const T = window.theme;
const FIRM = T.brand.firmName;
const FIRM_WM = FIRM;

// ---------------------------------------------------------------------------
// h(): hyperscript -> real DOM. Props accept the same shapes the design used
// (style as string OR object; onClick handlers; svg via ns; innerHTML via _html).
// ---------------------------------------------------------------------------
const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set(["svg","path","circle","rect","line","polyline","polygon","g","ellipse","defs","text","tspan"]);

function h(tag, props, ...children) {
  const isSvg = SVG_TAGS.has(tag);
  const el = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === "style") {
        if (typeof v === "string") el.setAttribute("style", v);
        else Object.assign(el.style, cssObjToDom(v));
      } else if (k === "_html") {
        el.innerHTML = v;
      } else if (k === "className") {
        el.setAttribute("class", v);
      } else if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === "value") {
        el.value = v; el.setAttribute("value", v);
      } else if (k === "checked") {
        el.checked = !!v;
      } else if (isSvg) {
        el.setAttribute(k, v);
      } else {
        el.setAttribute(k, v);
      }
    }
  }
  for (const c of children.flat(4)) {
    if (c == null || c === false || c === true) continue;
    el.appendChild(typeof c === "object" && c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
// style-object values may be camelCase (from the design's inline object styles).
function cssObjToDom(o) {
  const out = {};
  for (const k in o) out[k] = o[k];
  return out;
}
// convenience wrappers
const div = (p, ...c) => h("div", p, ...c);
const span = (p, ...c) => h("span", p, ...c);
const btn = (p, ...c) => h("button", p, ...c);
// svg from a viewBox + inner-path html string
function svg(attrs, innerHtml) {
  const s = h("svg", Object.assign({ xmlns: SVG_NS }, attrs));
  s.innerHTML = innerHtml;
  return s;
}
function icon(w, hh, extra, inner) {
  return svg(Object.assign({ width: w, height: hh, viewBox: "0 0 24 24" }, extra), inner);
}

// ---------------------------------------------------------------------------
// App: state container. setState merges + re-renders (focus preserved).
// ---------------------------------------------------------------------------
class App {
  constructor() {
    const D = window.DATA;
    this._d = {
      agents: D.agents.map(a => Object.assign({}, a)),
      properties: D.properties.map(p => Object.assign({}, p)),
      leads: D.leads,
      STAGES: D.STAGES,
      matchesForLead: D.matchesForLead,
      leadsForProperty: D.leadsForProperty,
      generateMessage: D.generateMessage,
    };
    this.props = { activeAgent: "Rohan", defaultLang: "Hinglish", composeMs: 1800 };
    this.state = {
      loaded: true, screen: "inbox", leadId: "l1", propId: null,
      segment: "All", sourceFilter: null,
      leads: D.leads.map(l => Object.assign({}, l)),
      propsData: this._d.properties,
      matchOpen: {}, followSaved: {}, sheetOpen: false, merged: {},
      waLang: null, waTone: "Standard", waVariant: 0, waComposing: false, waMessage: null,
      waEditing: false, waStatusIdx: 0, waCopied: false, waModal: false, waFrom: "mobile", waLeadId: "l1",
      winW: window.innerWidth,
      viewOverride: null, deskScreen: "dashboard", deskLeadId: "l2", deskLeadOpen: false, deskSortKey: "activity", deskSortDir: "asc", deskSoonTitle: "Team", deskSeg: "All",
      propDetailId: "p3", propFrom: "desktop", contactsTab: "Buyers", contactSel: null,
      propType: "All", propStatus: "All", propView: "cards", newPropId: null, propStatusMsg: false,
      addPropOpen: false, addForm: { type: "2BHK", deal: "sale", society: "", locality: "Wakad", price: "", owner: "", status: "Available" },
      loggedIn: false, loginPhase: "phone", loginPhone: "",
      inactiveIds: [], reassignFrom: null, reassignTo: null, reassignDone: false,
      addAgentOpen: false, addAgentName: "", agentBump: 0,
      callOpen: false, callLeadId: null, callTab: "call", intgOpen: false, intgKey: null,
      railPanel: null, railLeadId: null, railSheetOpen: false,
      personId: null, personFrom: "desktop",
      soonKey: "Home",
      // --- CRUD / demo-real additions ---
      leadForm: null,        // {mode:'new'|'edit', id, name, phone, config, deal, locality, budgetMin, budgetMax, timeline, notes, source, agentId}
      editPropId: null,      // when set, addForm is editing this property
      contactForm: null,     // {mode, origName, name, phone, role}
      confirmClose: null,    // {kind:'lead'|'prop', id, name}
      searchOpen: false, searchQ: "",
      noteDraft: {},         // leadId -> in-progress note text
      toasts: [],            // [{id, text, tone}]
      notifOpen: false,      // notification center
      checklistDraft: "",    // in-progress custom checklist item
    };
    this._toastSeq = 0;
    this.state.waLang = this.props.defaultLang;
    window.addEventListener("resize", () => this.setState({ winW: window.innerWidth }));
  }

  setState(update, cb) {
    const patch = typeof update === "function" ? update(this.state) : update;
    this.state = Object.assign({}, this.state, patch);
    this._render();
    if (cb) cb();
  }

  // ================= helpers (verbatim behavior) =================
  agentById(id) { return this._d.agents.find(a => a.id === id); }
  get me() {
    const name = this.props.activeAgent || "Rohan";
    const a = this._d.agents.find(x => x.first === name);
    return a || this._d.agents[0];
  }
  get lead() { return this.state.leads.find(l => l.id === this.state.leadId); }
  get prop() { return this.state.propsData.find(p => p.id === this.state.propId); }
  get waLead() { return this.state.leads.find(l => l.id === this.state.waLeadId); }
  valueOf(l) { const m = this._d.matchesForLead(l); return m[0] ? m[0].price : 0; }
  fmtMoney(n) {
    if (!n) return "—";
    if (n >= 10000000) return "₹" + (n / 10000000).toFixed(n >= 100000000 ? 0 : 1).replace(/\.0$/, "") + "Cr";
    if (n >= 100000) return "₹" + Math.round(n / 100000) + "L";
    if (n >= 1000) return "₹" + Math.round(n / 1000) + "k";
    return "₹" + n;
  }
  timeAgo(mins) {
    if (mins < 60) return mins + " min ago";
    if (mins < 1440) return Math.round(mins / 60) + "h ago";
    return Math.round(mins / 1440) + "d ago";
  }
  budgetRange(req) {
    if (req.deal === "rent") return "₹" + Math.round(req.budgetMin / 1000) + "–" + Math.round(req.budgetMax / 1000) + "k";
    const useCr = req.budgetMax >= 10000000;
    if (useCr) return "₹" + (req.budgetMin / 10000000).toFixed(1) + "–" + (req.budgetMax / 10000000).toFixed(1) + "Cr";
    return "₹" + Math.round(req.budgetMin / 100000) + "–" + Math.round(req.budgetMax / 100000) + "L";
  }
  reqLine(req) { return req.config + " · " + req.locality + " · " + this.budgetRange(req); }
  stageInfo(name) {
    return {
      "New": { c: "#3A7CA5", t: "#E7EFF4" }, "Contacted": { c: "#2E9E8F", t: "#E4F1EE" }, "Site Visit": { c: "#C79028", t: "#F7EFDC" },
      "Negotiation": { c: "#C2551F", t: "#F7E5DA" }, "Closed Won": { c: "#2E7D4E", t: "#E2F0E7" }, "Closed Lost": { c: "#8A5350", t: "#EFE3E2" }
    }[name] || { c: "#3A7CA5", t: "#E7EFF4" };
  }
  sourceColor(s) { return { "99acres": "#C2551F", "MagicBricks": "#B23A2E", "Walk-in": "#2E7D4E", "Referral": "#3A7CA5", "Website": "#6E7A74" }[s] || "#6E7A74"; }
  // Explainable match: ranked reasons + a 0-100 fit score (no AI, just logic).
  fitReasons(p, req) {
    const reasons = []; let score = 0;
    if (p.type === req.config) { reasons.push({ ok: true, t: "Config matches (" + p.type + ")" }); score += 25; }
    if (p.locality === req.locality) { reasons.push({ ok: true, t: "Same locality · " + req.locality }); score += 30; }
    else { reasons.push({ ok: false, t: "Different area (" + p.locality + ")" }); score += 8; }
    const inB = p.price >= req.budgetMin * 0.95 && p.price <= req.budgetMax * 1.08;
    if (inB) { reasons.push({ ok: true, t: "Within budget" }); score += 30; }
    else if (p.price < req.budgetMin) { reasons.push({ ok: true, t: "Under budget — room to negotiate" }); score += 18; }
    else { reasons.push({ ok: false, t: "Above budget" }); score += 5; }
    if (p.possession === "Immediate") { reasons.push({ ok: true, t: "Ready to move" }); score += 10; }
    if (p.status === "Available") score += 5;
    return { reasons: reasons.slice(0, 4), score: Math.min(99, score) };
  }
  thumbColorFor(id) { const arr = [["#E7EFF4", "#3A7CA5"], ["#E4F1EE", "#2E9E8F"], ["#F7EFDC", "#B0782B"], ["#EFE3E2", "#8A5350"], ["#E2F0E7", "#2E7D4E"]]; const i = (id ? id.charCodeAt(1) : 0) % arr.length; return arr[i]; }
  mdToHtml(t) {
    const esc = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return esc.replace(/\*(.+?)\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
  }
  ini(name) { return name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase(); }
  statusInfo(s) { return { Available: { c: "#2E7D4E", t: "#E2F0E7" }, "Under offer": { c: "#C79028", t: "#F7EFDC" }, Closed: { c: "#6E7A74", t: "#EBEEEC" } }[s] || { c: "#6E7A74", t: "#EBEEEC" }; }
  demoPhone(name) { let hh = 0; for (let i = 0; i < name.length; i++) hh = (hh * 131 + name.charCodeAt(i)) >>> 0; const d = String(10000000 + hh % 89999999); return "+91 98" + d.slice(0, 3) + " " + d.slice(3, 8); }
  computeDesktop() { const v = this.state.viewOverride; if (v === "desktop") return true; if (v === "mobile") return false; return (this.state.winW || 1440) >= 1024; }

  // ================= navigation =================
  openLead(id) { this.setState({ screen: "lead", leadId: id }); }
  back() { if (this.state.screen === "whatsapp") this.setState({ screen: "lead", waComposing: false, waMessage: null, waEditing: false }); else this.setState({ screen: "inbox" }); }
  goTab(key) {
    if (key === "Home") this.setState({ screen: "home" });
    else if (key === "Leads") this.setState({ screen: "inbox" });
    else if (key === "Properties") this.setState({ screen: "props" });
    else if (key === "Contacts") this.setState({ screen: "contacts" });
    else if (key === "More") this.setState({ viewOverride: "desktop", deskScreen: "dashboard" });
    else this.setState({ screen: "soon", soonKey: key });
  }
  goCalendar() { this.setState({ screen: "calendar" }); }
  goDesk(key) {
    const m = { Dashboard: "dashboard", Leads: "leads", Calendar: "calendar", Properties: "properties", Contacts: "contacts", Team: "team", Settings: "settings", Integrations: "integrations", Roadmap: "roadmap" };
    if (m[key]) this.setState({ deskScreen: m[key] });
    else this.setState({ deskScreen: "soon", deskSoonTitle: key });
  }

  // ================= login =================
  loginContinue() { if (this.state.loginPhase === "phone") this.setState({ loginPhase: "otp" }); else this.setState({ loggedIn: true }); }
  setLoginPhone(e) { this.setState({ loginPhone: e.target.value }); }

  // ================= team + reassign =================
  isInactive(id) { return this.state.inactiveIds.indexOf(id) >= 0; }
  activeAgents() { return this._d.agents.filter(a => !this.isInactive(a.id)); }
  toggleActive(id) { this.setState(s => ({ inactiveIds: s.inactiveIds.indexOf(id) >= 0 ? s.inactiveIds.filter(x => x !== id) : [...s.inactiveIds, id] })); }
  openReassign(fromId) { const others = this.activeAgents().filter(a => a.id !== fromId); this.setState({ reassignFrom: fromId, reassignTo: others[0] ? others[0].id : null, reassignDone: false }); }
  closeReassign() { this.setState({ reassignFrom: null, reassignDone: false }); }
  doReassign() {
    const from = this.state.reassignFrom, to = this.state.reassignTo; if (!from || !to) return;
    const a = this.agentById(to);
    this.setState(s => ({
      leads: s.leads.map(l => (l.agentId === from && !l.stage.startsWith("Closed")) ? Object.assign({}, l, { agentId: to, timeline: [{ type: "assign", label: "Reassigned to " + (a ? a.first : ""), ago: "just now" }, ...l.timeline] }) : l),
      reassignDone: true
    }));
  }
  addAgent() {
    const name = (this.state.addAgentName || "").trim(); if (!name) return;
    const colors = ["#2E7D4E", "#3A7CA5", "#C2551F", "#8A5350", "#2E9E8F", "#B0782B"];
    const a = { id: "anew" + Date.now(), name, first: name.split(" ")[0], initials: this.ini(name), color: colors[this._d.agents.length % colors.length] };
    this._d.agents.push(a);
    this.setState(s => ({ addAgentOpen: false, addAgentName: "", agentBump: s.agentBump + 1 }));
  }

  // ================= integrations =================
  openCall(id) { this.setState({ callOpen: true, callLeadId: id, callTab: "call" }); }
  closeCall() { this.setState({ callOpen: false }); }
  setCallTab(t) { this.setState({ callTab: t }); }
  openIntg(key) { this.setState({ intgOpen: true, intgKey: key }); }
  closeIntg() { this.setState({ intgOpen: false }); }
  integrations() {
    return [
      { key: "99acres", name: "99acres", mark: "99", tint: "#F7E5DA", color: "#C2551F", status: "staged", desc: "Auto-import buyer leads the moment they enquire.", long: "Every enquiry on your 99acres listings lands in your Leads inbox in real time — source-tagged, requirement parsed, ready to assign.", bullets: ["Real-time lead capture, no copy-paste", "Source chip + requirement auto-filled", "Round-robin routing on arrival"], cta: "Connect 99acres account" },
      { key: "MagicBricks", name: "MagicBricks", mark: "MB", tint: "#F6DEDB", color: "#B23A2E", status: "staged", desc: "Sync listings and pull matched enquiries.", long: "Push your inventory to MagicBricks and pull every matched enquiry straight into the pipeline, de-duplicated against existing leads.", bullets: ["Two-way listing sync", "Matched enquiries auto-imported", "Duplicate detection on the number"], cta: "Connect MagicBricks account" },
      { key: "Calling & SMS", name: "Calling & SMS", mark: "☎", tint: "#E7EFF4", color: "#3A7CA5", status: "staged", desc: "Click-to-call and log every conversation.", long: "Call and SMS from inside any lead. Calls auto-log to the timeline; SMS goes out from your business number with ready templates.", bullets: ["Click-to-call, auto-logged", "SMS templates for confirmations", "Your own number & telephony account"], cta: "Connect your number" },
      { key: "WhatsApp Business API", name: "WhatsApp Business API", mark: "WA", tint: "#E2F0E7", color: "#1E7F5C", status: "staged", desc: "Send generated messages from your own number.", long: "The messages you generate today go out automatically over the official WhatsApp Business API — from your verified number, with delivery tracking.", bullets: ["Send from your verified number", "Automated on approval by Meta", "Delivery & read tracking"], cta: "Start WhatsApp approval" },
      { key: "Website sync", name: "Website sync", mark: "⌘", tint: "#EBEEEC", color: "#6E7A74", status: "custom", desc: "Enquiry forms drop straight into your pipeline.", long: "Your website's enquiry forms and listing pages feed " + FIRM + " directly. This is a custom add-on — scoped once we see your current site.", bullets: ["Enquiry forms → pipeline", "Live listing pages from your inventory", "Custom-scoped to your site"], cta: "Request website scoping" },
    ];
  }
  callView() {
    const l = this.state.leads.find(x => x.id === this.state.callLeadId); if (!l) return null;
    const me = this.me; const first = l.name.split(" ")[0];
    return {
      name: l.name, phone: l.phone, isCall: this.state.callTab === "call", isSms: this.state.callTab === "sms",
      agentName: me.name, agentInitials: me.initials, agentColor: me.color, initials: this.ini(l.name),
      onCall: () => this.setCallTab("call"), onSms: () => this.setCallTab("sms"), onClose: () => this.closeCall(),
      onOverlay: (e) => { if (e && e.target === e.currentTarget) this.closeCall(); },
      smsTemplates: [
        "Namaste " + first + ", site visit confirmed. Address & time shared on WhatsApp. — " + FIRM,
        "Hi " + first + ", following up on the properties we discussed. Shall I book a visit this weekend?",
        "Thank you for visiting today! Sharing 2 more matching options shortly. — " + FIRM,
      ],
      callStyle: { flex: "1", border: "none", borderRadius: "7px", padding: "9px 0", fontFamily: "'Space Grotesk'", fontWeight: "600", fontSize: "13px", cursor: "pointer", background: this.state.callTab === "call" ? "#143E34" : "transparent", color: this.state.callTab === "call" ? "#F2EFE8" : "#5C665F" },
      smsStyle: { flex: "1", border: "none", borderRadius: "7px", padding: "9px 0", fontFamily: "'Space Grotesk'", fontWeight: "600", fontSize: "13px", cursor: "pointer", background: this.state.callTab === "sms" ? "#143E34" : "transparent", color: this.state.callTab === "sms" ? "#F2EFE8" : "#5C665F" },
    };
  }
  intgView() { const k = this.state.intgKey; const c = this.integrations().find(x => x.key === k); if (!c) return null; return Object.assign({}, c, { custom: c.status === "custom", onClose: () => this.closeIntg(), onOverlay: (e) => { if (e && e.target === e.currentTarget) this.closeIntg(); } }); }
  teamData() {
    const leads = this.state.leads;
    return this._d.agents.map(a => {
      const mine = leads.filter(l => l.agentId === a.id);
      const active = mine.filter(l => !l.stage.startsWith("Closed"));
      const inactive = this.isInactive(a.id); const overdue = mine.filter(l => l.overdue).length;
      return {
        id: a.id, name: a.name, first: a.first, initials: a.initials, color: a.color,
        active: active.length, closed: mine.filter(l => l.stage === "Closed Won").length, overdue, overdueColor: overdue ? "#B23A2E" : "#19211D",
        cardBorder: "#E4E0D5", cardOpacity: inactive ? 0.6 : 1, statusLabel: inactive ? "Inactive" : "Active",
        statusStyle: { fontSize: "11px", fontWeight: "600", borderRadius: "12px", padding: "3px 10px", color: inactive ? "#8A5350" : "#2E7D4E", background: inactive ? "#EFE3E2" : "#E2F0E7" },
        toggleLabel: inactive ? "Activate" : "Deactivate", toggleColor: inactive ? "#2E7D4E" : "#8A5350", toggleBorder: inactive ? "#C9D3C9" : "#E1C9C7",
        onReassign: () => this.openReassign(a.id), onToggle: () => this.toggleActive(a.id)
      };
    });
  }
  openDeskLead(id) { this.setState({ deskLeadId: id, deskScreen: "leads", deskLeadOpen: true }); }
  closeDeskLead() { this.setState({ deskLeadOpen: false }); }
  setDeskSort(key) { this.setState(s => (s.deskSortKey === key ? { deskSortDir: s.deskSortDir === "asc" ? "desc" : "asc" } : { deskSortKey: key, deskSortDir: "asc" })); }

  // ================= people / contacts =================
  openPerson(name, from) { from = from || (this.computeDesktop() ? "desktop" : "mobile"); this.setState(Object.assign({ personId: name, personFrom: from, railPanel: null }, from === "desktop" ? { deskScreen: "person" } : { screen: "person" })); }
  openAddForOwner(name) { this.setState(s => ({ addPropOpen: true, addForm: Object.assign({}, s.addForm, { owner: name }) })); }
  personView(name, from) {
    const props = this._d.properties.filter(p => p.owner === name); if (!props.length) return null;
    const forSale = props.filter(p => p.deal !== "rent").length, forRent = props.filter(p => p.deal === "rent").length;
    const role = forRent && !forSale ? "Landlord" : forSale && !forRent ? "Seller" : "Owner";
    const totalVal = props.reduce((a, p) => a + (p.deal === "rent" ? 0 : p.price), 0);
    const active = props.filter(p => p.status === "Available").length;
    return {
      name, initials: this.ini(name), role, phone: this.demoPhone(name),
      metaLine: [forSale ? forSale + " for sale" : "", forRent ? forRent + " on rent" : ""].filter(Boolean).join(" · "),
      onBack: () => from === "desktop" ? this.setState({ deskScreen: "contacts" }) : this.setState({ screen: "contacts" }),
      stats: [{ k: "Listings", v: String(props.length) }, { k: "Available now", v: String(active) }, { k: "Portfolio value", v: totalVal ? this.fmtMoney(totalVal) : "On rent" }],
      listings: props.map(p => { const cc = this.thumbColorFor(p.id); const si = this.statusInfo(p.status); return { id: p.id, society: p.society, line: p.title + " · " + (p.carpet || "—") + " sqft", priceLabel: p.priceLabel, status: p.status, statusColor: si.c, statusTint: si.t, thumbBg: cc[0], thumbInk: cc[1], onOpen: () => this.openProp(p.id, from) }; }),
    };
  }
  railForPerson(name, from) {
    const props = this._d.properties.filter(p => p.owner === name); if (!props.length) return null;
    const I = this.railIcons(); const panel = this.state.railPanel; const first = name.split(" ")[0];
    const ownerObj = { id: "owner:" + name, name, phone: this.demoPhone(name) };
    const quick = [
      { label: "Call", iconPath: I.phone, iconFill: "none", iconStroke: (panel === "call" ? "#143E34" : "#5C665F"), active: panel === "call", onClick: () => this.railTap("call", ownerObj.id, "call") },
      { label: "SMS", iconPath: I.sms, iconFill: "none", iconStroke: "#5C665F", active: false, onClick: () => this.railTap("call", ownerObj.id, "sms") },
    ].map(a => Object.assign({}, a, { style: this.railQuickStyle(a.active) }));
    return {
      subject: name, entityLabel: "Contact",
      primary: { label: "Call " + first, sub: "Check availability & terms", iconPath: I.phone, iconFill: "none", iconStroke: "#B0782B", onClick: () => this.railTap("call", ownerObj.id, "call") },
      quick,
      manage: [{ label: "Add a listing for " + first, iconPath: I.home, stroke: "#143E34", onClick: () => this.openAddForOwner(name), style: this.railManageStyle(false) }],
      panelOpen: panel === "call", isCallPanel: panel === "call", isFollowPanel: false, isAssignPanel: false, isStatusPanel: false,
      panelTitle: "Call & SMS", onClosePanel: () => this.closeRailPanel(),
      call: panel === "call" ? this.callPanelData(ownerObj) : null, follow: null, assign: null, status: null
    };
  }
  railForProperty(id, from) {
    const p = this._d.properties.find(x => x.id === id); if (!p) return null;
    const I = this.railIcons(); const panel = this.state.railPanel;
    const buyers = this._d.leadsForProperty(p, this.state.leads); const top = buyers[0];
    const ownerObj = { id: "owner:" + p.owner, name: p.owner, phone: this.demoPhone(p.owner) };
    let primary;
    if (top) primary = { label: "Send to " + top.lead.name.split(" ")[0] + " on WhatsApp", sub: "Interested buyer · " + top.fitLine, iconPath: I.wa, iconFill: "#B0782B", iconStroke: "none", onClick: () => this.openWhatsapp(id, top.lead.id, from) };
    else primary = { label: "Share this listing on WhatsApp", sub: p.society, iconPath: I.wa, iconFill: "#B0782B", iconStroke: "none", onClick: () => this.openWhatsapp(id, null, from) };
    const quick = [
      { label: "Set status", iconPath: I.tag, iconFill: "none", iconStroke: (panel === "status" ? "#143E34" : "#5C665F"), active: panel === "status", onClick: () => this.railTap("status", id) },
      { label: "Call owner", iconPath: I.phone, iconFill: "none", iconStroke: (panel === "call" ? "#143E34" : "#5C665F"), active: panel === "call", onClick: () => this.railTap("call", ownerObj.id, "call") },
    ].map(a => Object.assign({}, a, { style: this.railQuickStyle(a.active) }));
    const manage = [];
    manage.push({ label: "Edit listing", iconPath: I.note || "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z", stroke: "#143E34", onClick: () => this.openEditProp(id), style: this.railManageStyle(false) });
    if (p.status !== "Closed") manage.push({ label: "Mark as closed", iconPath: I.x, stroke: "#8A5350", onClick: () => this.setPropStatus(id, "Closed"), style: this.railManageStyle(true) });
    return {
      subject: p.society, entityLabel: "Property", primary, quick, manage,
      panelOpen: panel === "call" || panel === "status", isCallPanel: panel === "call", isFollowPanel: false, isAssignPanel: false, isStatusPanel: panel === "status",
      panelTitle: panel === "call" ? "Call owner · " + p.owner.split(" ")[0] : panel === "status" ? "Listing status" : "",
      onClosePanel: () => this.closeRailPanel(),
      call: panel === "call" ? this.callPanelData(ownerObj) : null, follow: null, assign: null,
      status: panel === "status" ? { saved: this.state.propStatusMsg, options: ["Available", "Under offer", "Closed"].map(s => { const s2 = this.statusInfo(s); const on = p.status === s; return { name: s, active: on, onClick: () => this.setPropStatus(id, s), style: { flex: "1", border: "1px solid " + (on ? s2.c : "#D7DCD2"), background: on ? s2.c : "#fff", color: on ? "#fff" : "#5C665F", borderRadius: "8px", padding: "11px 6px", fontFamily: "'Space Grotesk'", fontWeight: "600", fontSize: "12.5px", cursor: "pointer" } }; }) } : null
    };
  }

  // ================= properties + contacts actions =================
  openProp(id, from) { from = from || "desktop"; this.setState(Object.assign({ propDetailId: id, propFrom: from, propStatusMsg: false }, from === "desktop" ? { deskScreen: "propDetail" } : { screen: "propDetail" })); }
  backFromProp() { if (this.state.propFrom === "desktop") this.setState({ deskScreen: "properties" }); else this.setState({ screen: "props" }); }
  setPropStatus(id, status) { const p = this._d.properties.find(x => x.id === id); if (p) p.status = status; this.setState({ propStatusMsg: true }); }
  setAddField(k, v) { this.setState(s => ({ addForm: Object.assign({}, s.addForm, { [k]: v }) })); }
  addProperty() {
    const f = this.state.addForm;
    let price = parseInt(String(f.price).replace(/[^0-9]/g, "")) || 0;
    if (!price) price = f.deal === "rent" ? 30000 : 8000000;
    if (f.deal === "sale" && price < 100000) price = price * 100000;
    const editId = this.state.editPropId;
    const reset = { type: "2BHK", deal: "sale", society: "", locality: "Wakad", price: "", owner: "", status: "Available" };
    if (editId) {
      const p = this._d.properties.find(x => x.id === editId);
      if (p) {
        Object.assign(p, { type: f.type, deal: f.deal, locality: f.locality, society: f.society || p.society, price, priceLabel: this.fmtMoney(price) + (f.deal === "rent" ? "/mo" : ""), status: f.status, owner: f.owner || p.owner, title: f.type + " · " + f.locality, depositLabel: f.deal === "rent" ? this.fmtMoney(price * 3) : undefined });
      }
      this.setState({ addPropOpen: false, editPropId: null, addForm: reset });
      this.toast("Listing updated");
      return;
    }
    const p = {
      id: "pnew" + Date.now(), title: f.type + " · " + f.locality, type: f.type, deal: f.deal, locality: f.locality,
      society: f.society || "New listing", carpet: 950, floor: 3, totalFloors: 12, facing: "East", age: 3,
      price, priceLabel: this.fmtMoney(price) + (f.deal === "rent" ? "/mo" : ""), negotiable: true, status: f.status,
      owner: f.owner || "New owner", furnishing: "Semi-furnished", possession: "Immediate",
      depositLabel: f.deal === "rent" ? this.fmtMoney(price * 3) : undefined,
      features: ["Fresh listing, just added", "Owner direct deal", "Prime " + f.locality + " location", "Ready to move"]
    };
    this._d.properties.unshift(p);
    this.setState({ addPropOpen: false, newPropId: p.id, addForm: reset });
    this.toast("Property added — now matchable");
  }
  propertiesList() {
    let list = this._d.properties.slice();
    if (this.state.propType !== "All") list = list.filter(p => p.type === this.state.propType);
    if (this.state.propStatus !== "All") list = list.filter(p => p.status === this.state.propStatus);
    return list;
  }
  propCard(p, from) {
    const cc = this.thumbColorFor(p.id); const si = this.statusInfo(p.status);
    return { id: p.id, title: p.title, society: p.society, priceLabel: p.priceLabel, owner: p.owner, area: p.carpet ? p.carpet + " sqft" : "—", status: p.status, statusColor: si.c, statusTint: si.t, thumbBg: cc[0], thumbInk: cc[1], isNew: p.id === this.state.newPropId, newBorder: (p.id === this.state.newPropId ? "#B0782B" : "#E4E0D5"), deal: p.deal === "rent" ? "Rent" : "Sale", onOpen: () => this.openProp(p.id, from) };
  }
  propertyView(id, from) {
    const p = this._d.properties.find(x => x.id === id); if (!p) return null;
    const cc = this.thumbColorFor(p.id); const si = this.statusInfo(p.status);
    const buyers = this._d.leadsForProperty(p, this.state.leads);
    return {
      id, title: p.title, society: p.society, priceLabel: p.priceLabel, deal: p.deal === "rent" ? "For rent" : "For sale",
      thumbBg: cc[0], thumbInk: cc[1], status: p.status, statusColor: si.c, statusTint: si.t, owner: p.owner, locality: p.locality, negotiable: p.negotiable,
      spec: [{ k: "Config", v: p.type }, { k: "Carpet area", v: (p.carpet || "—") + " sqft" }, { k: "Floor", v: p.floor + " / " + p.totalFloors }, { k: "Facing", v: p.facing }, { k: "Age", v: p.age ? p.age + " yrs" : "New" }, { k: "Furnishing", v: p.furnishing }, { k: "Possession", v: p.possession }, { k: "Owner", v: p.owner }],
      features: p.features,
      interested: buyers.map(b => { const si2 = this.stageInfo(b.lead.stage); return { name: b.lead.name, req: this.reqLine(b.lead.req), fit: b.fitLine, stage: b.lead.stage, stageColor: si2.c, onOpen: () => from === "desktop" ? this.openDeskLead(b.lead.id) : this.openLead(b.lead.id) }; }),
      interestedCount: buyers.length, noBuyers: buyers.length === 0,
      onWhatsapp: () => this.openWhatsapp(id, null, from), onBack: () => this.backFromProp(),
    };
  }
  contactsData() {
    const props = this._d.properties, leads = this.state.leads;
    const sMap = {}, lMap = {}; const sel = this.state.contactSel;
    props.forEach(p => { const m = p.deal === "rent" ? lMap : sMap; (m[p.owner] = m[p.owner] || []).push(p); });
    const mk = (map, label) => Object.keys(map).map(name => ({
      name, initials: this.ini(name), kind: label, count: map[name].length, expandable: true, selected: sel === name,
      context: map[name].length + " " + (label === "Sellers" ? "propert" + (map[name].length > 1 ? "ies" : "y") + " for sale" : "rental unit" + (map[name].length > 1 ? "s" : "")),
      onOpen: () => this.openPerson(name, this.computeDesktop() ? "desktop" : "mobile"),
      properties: map[name].map(p => ({ id: p.id, title: p.society, sub: p.title + " · " + p.priceLabel, status: p.status, statusColor: this.statusInfo(p.status).c, onOpen: () => this.openProp(p.id, this.computeDesktop() ? "desktop" : "mobile") }))
    }));
    const person = (l, label) => ({ name: l.name, initials: this.ini(l.name), kind: label, context: this.reqLine(l.req), phone: l.phone, expandable: false, selected: false, properties: [], stage: l.stage, stageColor: this.stageInfo(l.stage).c, onOpen: () => this.computeDesktop() ? this.openDeskLead(l.id) : this.openLead(l.id) });
    return {
      Buyers: leads.filter(l => l.req.deal === "sale").map(l => person(l, "Buyers")),
      Sellers: mk(sMap, "Sellers"),
      Tenants: leads.filter(l => l.req.deal === "rent").map(l => person(l, "Tenants")),
      Landlords: mk(lMap, "Landlords"),
    };
  }
  homeData() {
    const me = this.me; const leads = this.state.leads;
    const mine = leads.filter(l => l.agentId === me.id);
    const follow = mine.filter(l => l.followUp);
    follow.sort((a, b) => (a.overdue === b.overdue) ? 0 : (a.overdue ? -1 : 1));
    const newAssigned = mine.filter(l => l.stage === "New");
    const active = mine.filter(l => !l.stage.startsWith("Closed"));
    const visits = mine.filter(l => l.stage === "Site Visit").length;
    const closing = mine.filter(l => l.stage === "Negotiation").length;
    return {
      greeting: "Namaste, " + me.first, dateStr: "Today · Sat, 4 Jul",
      followups: follow.map(l => { const isVisit = l.followUp.action.toLowerCase().includes("site visit"); return { name: l.name, action: l.followUp.action, when: l.followUp.date + " · " + l.followUp.time, overdue: l.overdue, isVisit, dotColor: l.overdue ? "#B23A2E" : isVisit ? "#C79028" : "#1E7F5C", whenColor: l.overdue ? "#B23A2E" : "#8A938C", onOpen: () => this.openLead(l.id) }; }),
      noFollow: follow.length === 0,
      newAssigned: newAssigned.map(l => ({ name: l.name, reqLine: this.reqLine(l.req), source: l.source, sourceColor: this.sourceColor(l.source), onOpen: () => this.openLead(l.id) })),
      newCount: newAssigned.length,
      stats: [{ label: "Active leads", value: active.length }, { label: "Site visits", value: visits }, { label: "Closing soon", value: closing }],
    };
  }

  // ================= lead actions =================
  setStage(name, id) { id = id || this.state.leadId; this.setState(s => ({ leads: s.leads.map(l => l.id === id ? Object.assign({}, l, { stage: name, timeline: [{ type: "stage", label: "Stage → " + name, ago: "just now" }, ...l.timeline] }) : l) })); }
  assign(agentId, id) { id = id || this.state.leadId; const a = this.agentById(agentId); this.setState(s => ({ leads: s.leads.map(l => l.id === id ? Object.assign({}, l, { agentId, timeline: [{ type: "assign", label: "Assigned to " + (a ? a.first : ""), ago: "just now" }, ...l.timeline] }) : l) })); }
  showMatches(id) { id = id || this.state.leadId; this.setState(s => ({ matchOpen: Object.assign({}, s.matchOpen, { [id]: true }) })); }
  setFollow(kind, id) {
    id = id || this.state.leadId;
    const fu = kind === "site" ? { action: "Site visit — property tour", date: "Sat", time: "11:00 am" } : { action: "Callback with the buyer", date: "Tomorrow", time: "10:30 am" };
    this.setState(s => ({ leads: s.leads.map(l => l.id === id ? Object.assign({}, l, { followUp: fu, overdue: false, timeline: [{ type: "follow", label: "Follow-up set · " + fu.action, ago: "just now" }, ...l.timeline] }) : l), followSaved: Object.assign({}, s.followSaved, { [id]: true }) }));
  }
  merge(id) { id = id || this.state.leadId; this.setState(s => ({ merged: Object.assign({}, s.merged, { [id]: true }) })); }

  // ================= whatsapp =================
  openWhatsapp(propId, leadId, from) {
    from = from || "mobile"; leadId = leadId || this.state.leadId;
    const patch = { propId, waLeadId: leadId, waFrom: from, waComposing: true, waMessage: null, waEditing: false, waStatusIdx: 0, waCopied: false, waLang: this.state.waLang || this.props.defaultLang || "Hinglish" };
    if (from === "desktop") patch.waModal = true; else patch.screen = "whatsapp";
    this.setState(patch);
    this.runCompose();
  }
  closeWaModal() { clearInterval(this._statusTimer); clearTimeout(this._doneTimer); this.setState({ waModal: false, waComposing: false, waMessage: null, waEditing: false }); }
  runCompose() {
    clearInterval(this._statusTimer); clearTimeout(this._doneTimer);
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const total = reduce ? 350 : (this.props.composeMs || 1800);
    this._statusTimer = setInterval(() => this.setState(s => ({ waStatusIdx: (s.waStatusIdx + 1) % 4 })), Math.max(260, total / 4));
    this._doneTimer = setTimeout(() => {
      clearInterval(this._statusTimer);
      const msg = this._d.generateMessage(this.prop, { lang: this.state.waLang, tone: this.state.waTone, variant: this.state.waVariant });
      this.setState({ waComposing: false, waMessage: msg });
    }, total);
  }
  recompose(patch) { this.setState(patch, () => { this.setState({ waComposing: true, waMessage: null, waEditing: false, waStatusIdx: 0 }); this.runCompose(); }); }
  setLang(l) { if (l === this.state.waLang) return; this.recompose({ waLang: l }); }
  setTone(t) { if (t === this.state.waTone) return; this.recompose({ waTone: t }); }
  regen() { this.recompose({ waVariant: this.state.waVariant + 1 }); }
  copyMsg() { try { navigator.clipboard.writeText(this.state.waMessage || ""); } catch (e) {} this.setState({ waCopied: true }); clearTimeout(this._copyTimer); this._copyTimer = setTimeout(() => this.setState({ waCopied: false }), 1600); }
  editMsg() { this.setState(s => ({ waEditing: !s.waEditing })); }
  onEditChange(e) { this.setState({ waMessage: e.target.value }); }

  // ================= icons =================
  tabIconPath(key) {
    return {
      Home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/>',
      Leads: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
      Properties: '<path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/>',
      Contacts: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/>',
      More: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'
    }[key];
  }
  deskIconPath(key) {
    return {
      Dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
      Leads: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
      Properties: '<path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/>',
      Contacts: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
      Team: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/>',
      Settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
      Integrations: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
      Calendar: '<path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>',
      Roadmap: '<path d="M9 18l6-6-6-6"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>'
    }[key];
  }

  // ================= actions rail =================
  railTap(kind, id, tab) {
    this.setState(s => {
      if (kind === "call") {
        if (s.railPanel !== "call") return { railPanel: "call", railLeadId: id, callLeadId: id, callTab: tab || "call", railSheetOpen: true };
        if (s.callTab === (tab || "call")) return { railPanel: null };
        return { callTab: tab || "call" };
      }
      const opening = s.railPanel !== kind;
      return { railPanel: opening ? kind : null, railLeadId: id, railSheetOpen: opening ? true : s.railSheetOpen };
    });
  }
  openSheet() { this.setState({ railSheetOpen: true }); }
  closeSheet() { this.setState({ railSheetOpen: false, railPanel: null }); }
  closeRailPanel() { this.setState({ railPanel: null }); }
  railIcons() {
    return {
      phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2Z",
      sms: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
      wa: "M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Z",
      cal: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
      user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 1 0 0 8z",
      arrow: "M5 12h14M13 6l6 6-6 6",
      merge: "M6 3v12M18 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6M15 6a9 9 0 0 1-9 9",
      x: "M18 6 6 18M6 6l12 12",
      home: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6",
      tag: "M20.6 13.4 11 3.8a2 2 0 0 0-1.4-.6H4a1 1 0 0 0-1 1v5.6a2 2 0 0 0 .6 1.4l9.6 9.6a2 2 0 0 0 2.8 0l4.6-4.6a2 2 0 0 0 0-2.8zM7 7h.01",
    };
  }
  railQuickStyle(active) { return { display: "flex", alignItems: "center", gap: "8px", padding: "11px 12px", cursor: "pointer", fontFamily: "inherit", border: "1px solid " + (active ? "#143E34" : "#E1DCCF"), background: active ? "#EEF3EE" : "#fff", borderRadius: "10px", color: active ? "#143E34" : "#3A423B" }; }
  railManageStyle(danger) { return { display: "flex", alignItems: "center", gap: "9px", padding: "9px 11px", cursor: "pointer", fontFamily: "inherit", textAlign: "left", border: "1px solid " + (danger ? "#EADCDA" : "#E7E2D6"), background: danger ? "#FBF3F2" : "#F7F5EE", borderRadius: "9px", color: danger ? "#8A5350" : "#3A423B", fontSize: "12.5px", fontWeight: "600", width: "100%" }; }
  callPanelData(l) {
    const first = l.name.split(" ")[0]; const me = this.me;
    return {
      phone: l.phone, isCall: this.state.callTab === "call", isSms: this.state.callTab === "sms",
      onCall: () => this.railTap("call", l.id, "call"), onSms: () => this.railTap("call", l.id, "sms"),
      callStyle: { flex: "1", border: "none", borderRadius: "7px", padding: "8px 0", fontFamily: "'Space Grotesk'", fontWeight: "600", fontSize: "12.5px", cursor: "pointer", background: this.state.callTab === "call" ? "#143E34" : "transparent", color: this.state.callTab === "call" ? "#F2EFE8" : "#5C665F" },
      smsStyle: { flex: "1", border: "none", borderRadius: "7px", padding: "8px 0", fontFamily: "'Space Grotesk'", fontWeight: "600", fontSize: "12.5px", cursor: "pointer", background: this.state.callTab === "sms" ? "#143E34" : "transparent", color: this.state.callTab === "sms" ? "#F2EFE8" : "#5C665F" },
      agentInitials: me.initials, agentColor: me.color, agentName: me.name,
      smsTemplates: [
        { title: "Site visit confirmation", text: "Namaste " + first + ", site visit confirmed. Address & time shared on WhatsApp. — " + FIRM },
        { title: "Follow-up nudge", text: "Hi " + first + ", following up on the properties we discussed. Shall I book a visit this weekend?" },
        { title: "Post-visit thank you", text: "Thank you for visiting today! Sharing 2 more matching options shortly. — " + FIRM },
      ]
    };
  }
  followPanelData(l, id) {
    return { hasFollowUp: !!l.followUp, followAction: l.followUp ? l.followUp.action : "", followWhen: l.followUp ? (l.followUp.date + " · " + l.followUp.time) : "", onSite: () => this.setFollow("site", id), onCall: () => this.setFollow("call", id), saved: !!this.state.followSaved[id], savedOwner: (this.agentById(l.agentId) ? this.agentById(l.agentId).first : this.me.first) };
  }
  assignPanelData(l, id) {
    const counts = {}; this._d.agents.forEach(a => counts[a.id] = 0);
    this.state.leads.forEach(x => { if (x.agentId && !x.stage.startsWith("Closed")) counts[x.agentId] = (counts[x.agentId] || 0) + 1; });
    const actList = this.activeAgents(); let sugg = (actList[0] || this._d.agents[0]).id, min = 1e9; actList.forEach(a => { if (counts[a.id] < min) { min = counts[a.id]; sugg = a.id; } });
    return { agents: this._d.agents.map(a => ({ first: a.first, initials: a.initials, color: a.color, suggested: (!l.agentId && a.id === sugg), active: l.agentId === a.id, onClick: () => this.assign(a.id, id), style: { display: "flex", alignItems: "center", gap: "8px", padding: "9px 10px", cursor: "pointer", fontFamily: "inherit", border: "1px solid " + (l.agentId === a.id ? "#143E34" : "#E4E0D5"), background: l.agentId === a.id ? "#EEF3EE" : "#fff", borderRadius: "9px" } })) };
  }
  railForLead(id, from) {
    const l = this.state.leads.find(x => x.id === id); if (!l) return null;
    const I = this.railIcons(); const panel = this.state.railPanel;
    const matches = this._d.matchesForLead(l); const top = matches[0];
    const STAGES = this._d.STAGES; const idx = STAGES.indexOf(l.stage); const nextStage = STAGES[idx + 1];
    const uncontacted = l.stage === "New"; const first = l.name.split(" ")[0];
    let primary;
    if (uncontacted || !top) primary = { label: "Call " + first, sub: uncontacted ? "Make first contact" : "Give the buyer a ring", iconPath: I.phone, iconFill: "none", iconStroke: "#B0782B", onClick: () => this.railTap("call", id, "call") };
    else primary = { label: "Send a match on WhatsApp", sub: top.society + " · " + top.priceLabel, iconPath: I.wa, iconFill: "#B0782B", iconStroke: "none", onClick: () => this.openWhatsapp(top.id, id, from) };
    const quick = [
      { label: "Call", iconPath: I.phone, iconFill: "none", iconStroke: (panel === "call" ? "#143E34" : "#5C665F"), active: panel === "call", onClick: () => this.railTap("call", id, "call") },
      { label: "SMS", iconPath: I.sms, iconFill: "none", iconStroke: "#5C665F", active: false, onClick: () => this.railTap("call", id, "sms") },
      { label: "Follow-up", iconPath: I.cal, iconFill: "none", iconStroke: (panel === "followup" ? "#143E34" : "#5C665F"), active: panel === "followup", onClick: () => this.railTap("followup", id) },
      { label: "Assign", iconPath: I.user, iconFill: "none", iconStroke: (panel === "assign" ? "#143E34" : "#5C665F"), active: panel === "assign", onClick: () => this.railTap("assign", id) },
    ].map(a => Object.assign({}, a, { style: this.railQuickStyle(a.active) }));
    const manage = [];
    if (nextStage && !l.stage.startsWith("Closed")) manage.push({ label: "Advance to " + nextStage, iconPath: I.arrow, stroke: "#143E34", onClick: () => this.setStage(nextStage, id), style: this.railManageStyle(false) });
    if (l.duplicateOf && !this.state.merged[id]) manage.push({ label: "Merge duplicate", iconPath: I.merge, stroke: "#8A5350", onClick: () => this.merge(id), style: this.railManageStyle(true) });
    if (!l.stage.startsWith("Closed")) manage.push({ label: "Mark as lost", iconPath: I.x, stroke: "#8A5350", onClick: () => this.setStage("Closed Lost", id), style: this.railManageStyle(true) });
    return {
      subject: l.name, entityLabel: "Lead", primary, quick, manage,
      panelOpen: !!panel, isCallPanel: panel === "call", isFollowPanel: panel === "followup", isAssignPanel: panel === "assign", isStatusPanel: false,
      panelTitle: panel === "call" ? "Call & SMS" : panel === "followup" ? "Set follow-up" : panel === "assign" ? "Assign to" : "",
      onClosePanel: () => this.closeRailPanel(),
      call: panel === "call" ? this.callPanelData(l) : null,
      follow: panel === "followup" ? this.followPanelData(l, id) : null,
      assign: panel === "assign" ? this.assignPanelData(l, id) : null,
      status: null
    };
  }
  leadView(id, from) {
    const l = this.state.leads.find(x => x.id === id); if (!l) return null;
    const si = this.stageInfo(l.stage); const ag = this.agentById(l.agentId);
    const STAGES = this._d.STAGES; const idx = STAGES.indexOf(l.stage);
    const matches = this._d.matchesForLead(l);
    const open = !!this.state.matchOpen[id];
    const counts = {}; this._d.agents.forEach(a => counts[a.id] = 0);
    this.state.leads.forEach(x => { if (x.agentId && !x.stage.startsWith("Closed")) counts[x.agentId] = (counts[x.agentId] || 0) + 1; });
    const actList = this.activeAgents(); let sugg = (actList[0] || this._d.agents[0]).id, min = 1e9; actList.forEach(a => { if (counts[a.id] < min) { min = counts[a.id]; sugg = a.id; } });
    const dupActive = l.duplicateOf && !this.state.merged[id];
    const stepHints = { "New": "Not contacted yet", "Contacted": "Reached out", "Site Visit": "Visit scheduled", "Negotiation": "Working the price", "Closed Won": "Deal closed", "Closed Lost": "Lost / dropped" };
    const stepper = STAGES.map((name, i) => {
      const s2 = this.stageInfo(name); const done = i <= idx;
      // clean state for the Desk stageTrack: done/current/todo/lost
      const state = name === "Closed Lost" ? "lost" : (i === idx ? "current" : (i < idx ? "done" : "todo"));
      const base = { name, state, onClick: () => this.setStage(name, id) };
      if (from === "desktop") return Object.assign(base, { barStyle: { flex: "1", border: "none", cursor: "pointer", padding: "7px 3px", borderRadius: "6px", display: "flex", justifyContent: "center", background: done ? s2.t : "#F2EFE8", opacity: (name === "Closed Lost" && l.stage !== "Closed Lost") ? .5 : 1 }, labelColor: done ? s2.c : "#A9B1AA" });
      return Object.assign(base, { barStyle: { flex: "1", height: "7px", border: "none", borderRadius: "4px", cursor: "pointer", padding: "0", background: done ? s2.c : "#E7E2D6", opacity: (name === "Closed Lost" && l.stage !== "Closed Lost") ? .55 : 1 }, labelColor: "transparent" });
    });
    return {
      id, name: l.name, phone: l.phone, source: l.source, timeAgo: this.timeAgo(l.minsAgo),
      sourceChipDark: { border: "1px solid " + this.sourceColor(l.source), color: "#F2EFE8", background: "rgba(255,255,255,.08)", borderRadius: "4px", padding: "2px 8px", fontSize: "11px", fontWeight: "600" },
      sourceChipLt: { border: "1px solid " + this.sourceColor(l.source), color: this.sourceColor(l.source), borderRadius: "5px", padding: "3px 9px", fontSize: "12px", fontWeight: "600" },
      showDup: dupActive, onMerge: () => this.merge(id),
      stage: l.stage, stageColor: si.c, stageHint: stepHints[l.stage], stepper,
      budget: this.budgetRange(l.req), configDeal: l.req.config + " · " + (l.req.deal === "rent" ? "Rent" : "Buy"),
      locality: l.req.locality, reqTimeline: l.req.timeline, notes: l.req.notes,
      matchCount: matches.length, matchesHidden: !open, matchesShown: open, onShowMatches: () => this.showMatches(id),
      matches: matches.map(m => { const cc = this.thumbColorFor(m.id); const fit = this.fitReasons(m, l.req); return { society: m.society, priceLabel: m.priceLabel, thumbBg: cc[0], thumbInk: cc[1], line: m.type + " · " + m.carpet + " sqft · " + m.facing, fitLine: m.fitLine, reasons: fit.reasons, score: fit.score, onWhatsapp: () => this.openWhatsapp(m.id, id, from) }; }),
      hasFollowUp: !!l.followUp, noFollowUp: !l.followUp,
      followAction: l.followUp ? l.followUp.action : "", followWhen: l.followUp ? (l.followUp.date + " · " + l.followUp.time) : "",
      followDay: l.followUp ? l.followUp.date.slice(0, 3) : "", followTimeShort: l.followUp ? l.followUp.time.replace(/:00/, "").replace(/\s/, "") : "",
      followGlow: l.overdue ? "#B23A2E" : "#143E34", followColor: l.overdue ? "#B23A2E" : "#8A938C",
      followSaved: !!this.state.followSaved[id], followOwner: (ag ? ag.first : this.me.first),
      isAssigned: !!ag, agentName: ag ? ag.name : "",
      timeline: l.timeline.map((t, i) => ({ label: t.label, ago: t.ago, dot: t.type === "stage" ? si.c : t.type === "msg" || t.type === "follow" ? "#1E7F5C" : t.type === "assign" ? "#B0782B" : "#8A938C", rail: i < l.timeline.length - 1 ? "#E7E2D6" : "transparent" })),
    };
  }
  waView() {
    const p = this.prop; const l = this.waLead; if (!p) return null;
    const cc = this.thumbColorFor(p.id);
    const statuses = ["Reading property details…", "Matching the buyer's need…", (this.state.waLang === "Marathi" ? "Writing in Marathi…" : this.state.waLang === "English" ? "Writing in English…" : "Writing in Hinglish…"), "Polishing the message…"];
    const msg = this.state.waMessage;
    return {
      title: p.title, society: p.society, deal: p.deal === "rent" ? "For rent" : "For sale", priceLabel: p.priceLabel,
      thumbBg: cc[0], thumbInk: cc[1],
      langs: ["Hinglish", "English", "Marathi"].map(x => ({ label: x, onClick: () => this.setLang(x), style: { flex: "1", border: "none", borderRadius: "7px", padding: "8px 0", fontFamily: "'Space Grotesk'", fontWeight: "600", fontSize: "12.5px", cursor: "pointer", background: this.state.waLang === x ? "#B0782B" : "transparent", color: this.state.waLang === x ? "#0C2B24" : "#C9D6CD" } })),
      tones: ["Standard", "Short"].map(x => ({ label: x, onClick: () => this.setTone(x), style: { flex: "1", border: "none", borderRadius: "7px", padding: "8px 0", fontFamily: "'Space Grotesk'", fontWeight: "600", fontSize: "12.5px", cursor: "pointer", background: this.state.waTone === x ? "#B0782B" : "transparent", color: this.state.waTone === x ? "#0C2B24" : "#C9D6CD" } })),
      composing: this.state.waComposing, ready: !this.state.waComposing && !!msg,
      status: statuses[this.state.waStatusIdx],
      editing: this.state.waEditing, notEditing: !this.state.waEditing,
      messageRaw: msg || "",
      msgFont: this.state.waLang === "Marathi" ? "'IBM Plex Sans Devanagari','IBM Plex Sans',sans-serif" : "'IBM Plex Sans',sans-serif",
      messageHtml: msg ? this.mdToHtml(msg) : "",
      onEditChange: (e) => this.onEditChange(e),
      clock: "12:04 pm", buyerName: l ? l.name : "buyer",
      onCopy: () => this.copyMsg(), copyLabel: this.state.waCopied ? "Copied ✓" : "Copy message",
      onRegen: () => this.regen(), onEdit: () => this.editMsg(), onCloseModal: () => this.closeWaModal(),
    };
  }

  // ================= post-won checklist =================
  // Owner-defined template; agents tick items. Distinct lists for sale vs rent.
  checklistTemplate(deal) {
    if (deal === "rent") return ["Move-in payment collected", "Society gate-app registration", "Police tenant verification", "Agreement e-registered", "Handover & inventory signed", "Set re-approach reminder (renewal)"];
    return ["Token / booking amount received", "Home-loan sanction tracked", "Move-in payment & society NOC", "Gate-app / society registration", "Sale deed registration booked", "Possession & handover done", "Set re-approach reminder (next deal)"];
  }
  ensureChecklist(l) {
    // returns the lead's checklist item map, seeding from template if missing
    if (!l._checklist) {
      const tpl = this.checklistTemplate(l.req.deal);
      l._checklist = tpl.map((label, i) => ({ id: i, label, done: false }));
    }
    return l._checklist;
  }
  toggleChecklist(id, itemId) {
    this.setState(s => ({ leads: s.leads.map(l => {
      if (l.id !== id) return l;
      const items = this.ensureChecklist(l).map(it => it.id === itemId ? Object.assign({}, it, { done: !it.done }) : it);
      return Object.assign({}, l, { _checklist: items });
    }) }));
    const l2 = this.state.leads.find(x => x.id === id);
    const done = (l2._checklist || []).filter(i => i.done).length, total = (l2._checklist || []).length;
    if (done === total && total) this.toast("Handover complete — great work");
  }
  addChecklistItem(id, label) {
    label = (label || "").trim(); if (!label) return;
    this.setState(s => ({ leads: s.leads.map(l => l.id === id ? Object.assign({}, l, { _checklist: [...this.ensureChecklist(l), { id: Date.now(), label, done: false }] }) : l), checklistDraft: "" }));
    this.toast("Step added to checklist");
  }
  setChecklistDraft(v) { this.setState({ checklistDraft: v }); }

  // ================= reminders / notifications (native) =================
  // Built from live data: overdue follow-ups, today's follow-ups, new unassigned
  // leads, and re-approach timers set on closed-won leads.
  notifications() {
    const leads = this.state.leads;
    const items = [];
    leads.forEach(l => {
      if (l.overdue && l.followUp) items.push({ id: "ov-" + l.id, kind: "overdue", icon: "clock", color: "#B23A2E",
        title: l.name + " — overdue follow-up", sub: l.followUp.action + " · was " + l.followUp.date, leadId: l.id });
    });
    leads.forEach(l => {
      if (l.followUp && !l.overdue && (l.followUp.date === "Today" || l.followUp.date === "Sat")) items.push({ id: "td-" + l.id, kind: "today", icon: "cal", color: "#C79028",
        title: l.name + " — " + l.followUp.action, sub: "Due " + l.followUp.date + " · " + l.followUp.time, leadId: l.id });
    });
    leads.filter(l => l.stage === "New" && !l.agentId).forEach(l => items.push({ id: "nw-" + l.id, kind: "new", icon: "user", color: "#3A7CA5",
      title: "New lead unassigned — " + l.name, sub: l.source + " · " + this.reqLine(l.req), leadId: l.id }));
    leads.filter(l => l._reapproach).forEach(l => items.push({ id: "ra-" + l.id, kind: "reapproach", icon: "bell", color: "#B0782B",
      title: "Re-approach " + l.name, sub: "Renewal / repeat-business reminder set", leadId: l.id }));
    return items;
  }
  notifCount() { return this.notifications().filter(n => n.kind === "overdue" || n.kind === "new").length; }
  openNotif() { this.setState({ notifOpen: true }); }
  closeNotif() { this.setState({ notifOpen: false }); }
  setReapproach(id) {
    this.setState(s => ({ leads: s.leads.map(l => l.id === id ? Object.assign({}, l, { _reapproach: true, timeline: [{ type: "follow", label: "Re-approach reminder set (repeat business)", ago: "just now" }, ...l.timeline] }) : l) }));
    this.toast("Reminder set — you'll be nudged to re-approach");
  }

  // ================= agent scoping + IP watermark =================
  // In agent (mobile) view, an agent sees only their own book. Owner/admin sees all.
  isOwnerView() { return this.computeDesktop(); } // desktop = owner/admin; mobile = agent
  scopeLeads(list) {
    if (this.isOwnerView()) return list;
    const me = this.me;
    return list.filter(l => l.agentId === me.id || l.stage === "New" && !l.agentId);
  }
  watermarkText() {
    const me = this.me;
    return me.name + " · " + FIRM_WM + " · confidential";
  }

  // ================= site-visit calendar =================
  visitAgenda() {
    // group follow-ups (esp. site visits) into a simple day agenda
    const order = ["Today", "Tomorrow", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Yesterday"];
    const leads = this.scopeLeads(this.state.leads).filter(l => l.followUp);
    const groups = {};
    leads.forEach(l => {
      const d = l.followUp.date; (groups[d] = groups[d] || []).push(l);
    });
    const days = Object.keys(groups).sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    return days.map(d => ({
      day: d,
      overdue: d === "Yesterday",
      items: groups[d].sort((a, b) => (a.followUp.time || "").localeCompare(b.followUp.time || "")).map(l => {
        const isVisit = (l.followUp.action || "").toLowerCase().includes("site visit") || (l.followUp.action || "").toLowerCase().includes("visit");
        const ag = this.agentById(l.agentId);
        return { id: l.id, name: l.name, action: l.followUp.action, time: l.followUp.time, isVisit,
          agentInitials: ag ? ag.initials : "", agentColor: ag ? ag.color : "#ccc",
          dot: l.overdue ? "#B23A2E" : isVisit ? "#C79028" : "#1E7F5C",
          onOpen: () => this.isOwnerView() ? this.openDeskLead(l.id) : this.openLead(l.id) };
      })
    }));
  }

  // ================= toasts =================
  toast(text, tone) {
    const id = ++this._toastSeq;
    this.setState(s => ({ toasts: [...s.toasts, { id, text, tone: tone || "ok" }] }));
    setTimeout(() => this.setState(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 2600);
  }

  // ================= lead CRUD =================
  blankLead() {
    const me = this.me;
    return { mode: "new", id: null, name: "", phone: "", config: "2BHK", deal: "sale", locality: "Wakad",
      budgetMin: 7500000, budgetMax: 8500000, timeline: "Within 1 month", notes: "", source: "Walk-in", agentId: me.id };
  }
  openNewLead() { this.setState({ leadForm: this.blankLead(), sheetOpen: false }); }
  openEditLead(id) {
    const l = this.state.leads.find(x => x.id === id); if (!l) return;
    this.setState({ leadForm: { mode: "edit", id: l.id, name: l.name, phone: l.phone, config: l.req.config, deal: l.req.deal, locality: l.req.locality, budgetMin: l.req.budgetMin, budgetMax: l.req.budgetMax, timeline: l.req.timeline, notes: l.req.notes, source: l.source, agentId: l.agentId } });
  }
  closeLeadForm() { this.setState({ leadForm: null }); }
  setLeadFormField(k, v) { this.setState(s => ({ leadForm: Object.assign({}, s.leadForm, { [k]: v }) })); }
  setLeadBudget(band) {
    const bands = {
      "sale:low": [5000000, 6500000], "sale:mid": [7500000, 9000000], "sale:high": [11000000, 15000000], "sale:premium": [18000000, 22000000],
      "rent:low": [15000, 22000], "rent:mid": [28000, 38000], "rent:high": [45000, 60000],
    };
    const key = (this.state.leadForm.deal === "rent" ? "rent:" : "sale:") + band;
    const b = bands[key] || bands[(this.state.leadForm.deal === "rent" ? "rent:mid" : "sale:mid")];
    this.setState(s => ({ leadForm: Object.assign({}, s.leadForm, { budgetMin: b[0], budgetMax: b[1] }) }));
  }
  saveLeadForm() {
    const f = this.state.leadForm; if (!f) return;
    const name = (f.name || "").trim(); if (!name) { this.toast("Add a name first", "warn"); return; }
    const phone = (f.phone || "").trim() || "+91 9820 000000";
    const req = { config: f.config, deal: f.deal, locality: f.locality, budgetMin: Number(f.budgetMin), budgetMax: Number(f.budgetMax), timeline: f.timeline || "Flexible", notes: (f.notes || "").trim() };
    if (f.mode === "edit") {
      this.setState(s => ({ leads: s.leads.map(l => l.id === f.id ? Object.assign({}, l, { name, phone, source: f.source, agentId: f.agentId, req, timeline: [{ type: "note", label: "Details updated", ago: "just now" }, ...l.timeline] }) : l), leadForm: null }));
      this.toast("Lead updated");
    } else {
      const dup = this.state.leads.find(l => l.phone.replace(/\D/g, "") === phone.replace(/\D/g, ""));
      const id = "lnew" + Date.now();
      const nl = { id, name, phone, source: f.source, stage: "New", minsAgo: 0, agentId: f.agentId || this.me.id, req, overdue: false, followUp: null, duplicateOf: dup ? dup.id : undefined, timeline: [{ type: "created", label: "Lead created · " + f.source, ago: "just now" }] };
      this.setState(s => ({ leads: [nl, ...s.leads], leadForm: null }));
      this.toast("Lead saved — routed to " + (this.agentById(nl.agentId) ? this.agentById(nl.agentId).first : "desk"));
    }
  }

  // ================= add note / log call on timeline =================
  setNoteDraft(id, v) { this.setState(s => ({ noteDraft: Object.assign({}, s.noteDraft, { [id]: v }) })); }
  addNote(id, kind) {
    const draft = (this.state.noteDraft[id] || "").trim();
    const label = kind === "call" ? (draft ? "Call logged · " + draft : "Call logged") : draft;
    if (!label) { this.toast("Type a note first", "warn"); return; }
    this.setState(s => ({
      leads: s.leads.map(l => l.id === id ? Object.assign({}, l, { timeline: [{ type: kind === "call" ? "assign" : "note", label, ago: "just now" }, ...l.timeline] }) : l),
      noteDraft: Object.assign({}, s.noteDraft, { [id]: "" })
    }));
    this.toast(kind === "call" ? "Call logged" : "Note added");
  }

  // ================= property edit / close =================
  openEditProp(id) {
    const p = this._d.properties.find(x => x.id === id); if (!p) return;
    const priceInput = p.deal === "rent" ? String(Math.round(p.price / 1000)) : String(Math.round(p.price / 100000));
    this.setState({ editPropId: id, addPropOpen: true, addForm: { type: p.type, deal: p.deal, society: p.society, locality: p.locality, price: priceInput, owner: p.owner, status: p.status } });
  }

  // ================= contact CRUD =================
  openNewContact() { this.setState({ contactForm: { mode: "new", origName: null, name: "", phone: "", role: "Seller" } }); }
  openEditContact(name) {
    const props = this._d.properties.filter(p => p.owner === name);
    const role = props.length && props.every(p => p.deal === "rent") ? "Landlord" : "Seller";
    this.setState({ contactForm: { mode: "edit", origName: name, name, phone: this.demoPhone(name), role } });
  }
  closeContactForm() { this.setState({ contactForm: null }); }
  setContactField(k, v) { this.setState(s => ({ contactForm: Object.assign({}, s.contactForm, { [k]: v }) })); }
  saveContactForm() {
    const f = this.state.contactForm; if (!f) return;
    const name = (f.name || "").trim(); if (!name) { this.toast("Add a name first", "warn"); return; }
    if (f.mode === "edit" && f.origName && f.origName !== name) {
      this._d.properties.forEach(p => { if (p.owner === f.origName) p.owner = name; });
      if (this.state.personId === f.origName) this.setState({ personId: name });
      if (this.state.contactSel === f.origName) this.setState({ contactSel: name });
      this.toast("Contact updated");
    } else if (f.mode === "new") {
      // seed one starter listing so the contact is real & matchable
      const deal = f.role === "Landlord" ? "rent" : "sale";
      const price = deal === "rent" ? 30000 : 8500000;
      const p = { id: "pnew" + Date.now(), title: "2BHK · Wakad", type: "2BHK", deal, locality: "Wakad", society: "New listing", carpet: 950, floor: 3, totalFloors: 12, facing: "East", age: 3, price, priceLabel: this.fmtMoney(price) + (deal === "rent" ? "/mo" : ""), negotiable: true, status: "Available", owner: name, furnishing: "Semi-furnished", possession: "Immediate", depositLabel: deal === "rent" ? this.fmtMoney(price * 3) : undefined, features: ["Fresh listing, just added", "Owner direct deal"] };
      this._d.properties.unshift(p);
      this.toast("Contact added");
    } else {
      this.toast("Contact updated");
    }
    this.setState({ contactForm: null });
  }

  // ================= global search =================
  searchResults() {
    const q = (this.state.searchQ || "").trim().toLowerCase(); if (!q) return { leads: [], props: [], people: [] };
    const leads = this.state.leads.filter(l => l.name.toLowerCase().includes(q) || l.req.locality.toLowerCase().includes(q) || l.source.toLowerCase().includes(q) || l.phone.replace(/\s/g, "").includes(q.replace(/\s/g, ""))).slice(0, 6);
    const props = this._d.properties.filter(p => p.society.toLowerCase().includes(q) || p.locality.toLowerCase().includes(q) || p.type.toLowerCase().includes(q) || p.owner.toLowerCase().includes(q)).slice(0, 6);
    const owners = {}; this._d.properties.forEach(p => { if (p.owner.toLowerCase().includes(q)) owners[p.owner] = true; });
    const people = Object.keys(owners).slice(0, 5);
    return { leads, props, people };
  }
  openSearch() { this.setState({ searchOpen: true, searchQ: "" }); }
  closeSearch() { this.setState({ searchOpen: false, searchQ: "" }); }

  // ================= desktop view-model =================
  desktopVals() {
    const D_ = this._d; const STAGES = D_.STAGES;
    const leads = this.state.leads;
    const active = leads.filter(l => !l.stage.startsWith("Closed"));
    const won = leads.filter(l => l.stage === "Closed Won");
    const closedValue = won.reduce((s, l) => s + this.valueOf(l), 0);
    const pipelineValue = active.reduce((s, l) => s + this.valueOf(l), 0);
    const newToday = leads.filter(l => l.minsAgo < 1440).length;
    const overdue = leads.filter(l => l.overdue);
    const stageCounts = STAGES.map(name => ({ name, si: this.stageInfo(name), list: leads.filter(l => l.stage === name) }));
    const maxStage = Math.max(1, ...stageCounts.map(s => s.list.length));
    const pipeline = stageCounts.map(s => ({ name: s.name, color: s.si.c, count: s.list.length, value: this.fmtMoney(s.list.reduce((a, l) => a + this.valueOf(l), 0)), pct: Math.round(s.list.length / maxStage * 100) + "%" }));
    const srcNames = ["99acres", "MagicBricks", "Walk-in", "Referral", "Website"];
    const maxSrc = Math.max(1, ...srcNames.map(sn => leads.filter(l => l.source === sn).length));
    const sources = srcNames.map(sn => { const c = leads.filter(l => l.source === sn).length; return { name: sn, color: this.sourceColor(sn), count: c, pct: Math.round(c / maxSrc * 100) + "%" }; });
    const lb = D_.agents.map(a => {
      const mine = leads.filter(l => l.agentId === a.id);
      const wonA = mine.filter(l => l.stage === "Closed Won");
      return { id: a.id, first: a.first, initials: a.initials, color: a.color, assigned: mine.length,
        contacted: mine.filter(l => STAGES.indexOf(l.stage) >= 1 && !l.stage.startsWith("Closed")).length + wonA.length + mine.filter(l => l.stage === "Closed Lost").length,
        visits: mine.filter(l => STAGES.indexOf(l.stage) >= 2 && STAGES.indexOf(l.stage) <= 3).length + wonA.length,
        closed: wonA.length, _val: wonA.reduce((s, l) => s + this.valueOf(l), 0) };
    });
    const topVal = Math.max(...lb.map(x => x._val));
    const leaderboard = lb.sort((a, b) => b._val - a._val).map(x => Object.assign({}, x, { value: this.fmtMoney(x._val), top: (x._val === topVal && topVal > 0) }));
    const kpiCard = accent => Object.assign({ background: accent ? "#FBF1EF" : "#fff", border: "1px solid " + (accent ? "#EEDAD7" : "#E4E0D5"), borderRadius: "12px", padding: "16px 18px" }, accent ? { animation: "softGlow 2.4s infinite" } : {});
    const iconBox = tint => ({ width: "28px", height: "28px", borderRadius: "7px", background: tint, display: "flex", alignItems: "center", justifyContent: "center" });
    const kpis = [
      { label: "Closed this month", value: this.fmtMoney(closedValue), valueColor: "#B0782B", sub: won.length + " deals won", subColor: "#8A938C", cardStyle: kpiCard(false), iconWrap: iconBox("#F7EFDC"), iconStroke: "#B0782B", iconPath: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' },
      { label: "Active pipeline", value: active.length, valueColor: "#19211D", sub: this.fmtMoney(pipelineValue) + " in play", subColor: "#8A938C", cardStyle: kpiCard(false), iconWrap: iconBox("#E4F1EE"), iconStroke: "#2E9E8F", iconPath: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>' },
      { label: "New leads · 24h", value: newToday, valueColor: "#19211D", sub: "fresh enquiries today", subColor: "#8A938C", cardStyle: kpiCard(false), iconWrap: iconBox("#E7EFF4"), iconStroke: "#3A7CA5", iconPath: '<path d="M20 8v6M23 11h-6"/><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>' },
      { label: "Overdue follow-ups", value: overdue.length, valueColor: "#B23A2E", sub: "chase these today", subColor: "#B23A2E", cardStyle: kpiCard(true), iconWrap: iconBox("#F6DEDB"), iconStroke: "#B23A2E", iconPath: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
    ];
    const navKeys = ["Dashboard", "Leads", "Calendar", "Properties", "Contacts", "Team", "Settings", "Integrations", "Roadmap"];
    const cur = this.state.deskScreen;
    const activeKey = cur === "dashboard" ? "Dashboard" : cur === "leads" ? "Leads" : cur === "calendar" ? "Calendar" : (cur === "properties" || cur === "propDetail") ? "Properties" : cur === "contacts" ? "Contacts" : cur === "person" ? "Contacts" : cur === "team" ? "Team" : cur === "settings" ? "Settings" : cur === "integrations" ? "Integrations" : cur === "roadmap" ? "Roadmap" : this.state.deskSoonTitle;
    const newCount = leads.filter(l => l.stage === "New").length;
    const deskNav = navKeys.map(k => {
      const on = k === activeKey;
      return { key: k, label: k === "Contacts" ? "People" : k, iconPath: this.deskIconPath(k), iconColor: on ? "#1C4A3E" : "#8FA79B", onClick: () => this.goDesk(k),
        sectionLabel: k === "Dashboard" ? "Workspace" : k === "Team" ? "Manage" : k === "Roadmap" ? "What's next" : null,
        style: { display: "flex", alignItems: "center", gap: "11px", width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: on ? "11px 0 0 11px" : "9px", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "13.5px", fontWeight: on ? 600 : 500, color: on ? "#16362D" : "#9FB6AA", background: on ? "#F2EFE8" : "transparent", marginRight: on ? "-13px" : "0", paddingRight: on ? "13px" : "12px", transition: "background .2s" },
        badge: k === "Leads" && newCount > 0, badgeText: String(newCount), badgeStyle: { background: "#3A7CA5", color: "#fff", borderRadius: "10px", fontSize: "10px", fontWeight: 700, padding: "1px 7px" } };
    });
    let wl = leads.slice();
    if (this.state.deskSeg === "New") wl = wl.filter(l => l.stage === "New");
    else if (this.state.deskSeg === "Overdue") wl = wl.filter(l => l.overdue);
    else if (this.state.deskSeg === "Unassigned") wl = wl.filter(l => !l.agentId);
    const sortKey = this.state.deskSortKey || "activity", sortDir = this.state.deskSortDir || "asc";
    const sortVal = l => sortKey === "name" ? l.name.toLowerCase()
      : sortKey === "budget" ? (l.req.budgetMax || 0)
      : sortKey === "stage" ? STAGES.indexOf(l.stage)
      : l.minsAgo; // activity (default)
    wl.sort((a, b) => { const av = sortVal(a), bv = sortVal(b); const c = av < bv ? -1 : av > bv ? 1 : 0; return sortDir === "asc" ? c : -c; });
    const dsegStyle = o => ({ flex: "1", border: "none", borderRadius: "7px", padding: "7px 0", fontFamily: "'Space Grotesk'", fontWeight: 600, fontSize: "12.5px", cursor: "pointer", background: o ? "#143E34" : "transparent", color: o ? "#F2EFE8" : "#5C665F" });
    const unassignedCount = leads.filter(l => !l.agentId).length;
    const dsegCounts = { All: leads.length, New: newCount, Overdue: overdue.length, Unassigned: unassignedCount };
    const DW = {
      sortKey, sortDir, activeLeadId: this.state.deskLeadOpen ? this.state.deskLeadId : null,
      segments: ["All", "New", "Overdue", "Unassigned"].map(s => ({ key: s, label: s, count: dsegCounts[s], on: this.state.deskSeg === s, style: dsegStyle(this.state.deskSeg === s), onClick: () => this.setState({ deskSeg: s }) })),
      onSort: key => this.setDeskSort(key),
      rows: wl.map(l => { const si = this.stageInfo(l.stage); const ag = this.agentById(l.agentId); const sel = this.state.deskLeadOpen && l.id === this.state.deskLeadId; const nf = l.followUp ? (l.followUp.date + " · " + l.followUp.time) : "—"; return {
        id: l.id, name: l.name, phone: l.phone, source: l.source, sourceColor: this.sourceColor(l.source), stage: l.stage, stageColor: si.c, stageTint: si.t,
        reqLine: this.reqLine(l.req), reqShort: l.req.config + " · " + l.req.deal + " · " + l.req.locality, budget: this.budgetRange(l.req), isWon: l.stage === "Closed Won",
        timeAgo: this.timeAgo(l.minsAgo), timeColor: l.overdue ? "#B23A2E" : "#8A938C",
        nextFollow: l.overdue ? ("Overdue · " + nf) : nf, nextColor: l.overdue ? "#B23A2E" : "#5C665F", overdue: l.overdue,
        assigned: !!ag, unassigned: !ag, agentInitials: ag ? ag.initials : "", agentColor: ag ? ag.color : "#ccc", agentFirst: ag ? ag.first : "",
        selected: sel, onOpen: () => this.openDeskLead(l.id) }; }),
    };
    const S = {
      swatches: [{ name: "Green", hex: "#143E34" }, { name: "Brass", hex: "#B0782B" }, { name: "Porcelain", hex: "#F2EFE8" }, { name: "Ink", hex: "#19211D" }],
      stages: STAGES.map(n => ({ name: n, color: this.stageInfo(n).c })),
      sources: ["99acres", "MagicBricks", "Walk-in", "Referral", "Website"].map(n => ({ name: n, color: this.sourceColor(n) })),
    };
    const I = { cards: this.integrations().map(c => ({ name: c.name, mark: c.mark, tint: c.tint, color: c.color, desc: c.desc, custom: c.status === "custom", badgeLabel: c.status === "custom" ? "Custom add-on" : "Connects to your account", badgeColor: c.status === "custom" ? "#6E7A74" : "#B0782B", badgeTint: c.status === "custom" ? "#EBEEEC" : "#F7EFDC", onOpen: () => this.openIntg(c.key) })) };
    const fchip = on => ({ whiteSpace: "nowrap", border: "1px solid " + (on ? "#143E34" : "#DDD8CB"), background: on ? "#143E34" : "#fff", color: on ? "#fff" : "#5C665F", borderRadius: "16px", padding: "6px 14px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" });
    const plist = this.propertiesList();
    const PG = { count: this._d.properties.length, view: this.state.propView, shownCount: plist.length,
      typeFilters: ["All", "1BHK", "2BHK", "3BHK", "Commercial", "Plot"].map(x => ({ label: x, on: this.state.propType === x, style: fchip(this.state.propType === x), onClick: () => this.setState({ propType: x }) })),
      statusFilters: ["All", "Available", "Under offer", "Closed"].map(x => ({ label: x, on: this.state.propStatus === x, style: fchip(this.state.propStatus === x), onClick: () => this.setState({ propStatus: x }) })),
      setView: v => this.setState({ propView: v }),
      cards: plist.map(p => this.propCard(p, "desktop")),
      rows: plist.map(p => { const si = this.statusInfo(p.status); const cc = this.thumbColorFor(p.id); return { id: p.id, society: p.society, title: p.title, type: p.type, deal: p.deal === "rent" ? "Rent" : "Sale", locality: p.locality, priceLabel: p.priceLabel, area: p.carpet ? p.carpet + " sqft" : "—", owner: p.owner, status: p.status, statusColor: si.c, statusTint: si.t, thumbBg: cc[0], thumbInk: cc[1], onOpen: () => this.openProp(p.id, "desktop") }; }) };
    const cdata = this.contactsData(); const ctab = this.state.contactsTab;
    const tchip = on => ({ border: "none", borderRadius: "8px", padding: "9px 16px", fontFamily: "'Space Grotesk'", fontWeight: 600, fontSize: "13px", cursor: "pointer", background: on ? "#143E34" : "transparent", color: on ? "#F2EFE8" : "#5C665F" });
    const CT = { tabs: ["Buyers", "Sellers", "Tenants", "Landlords"].map(x => ({ label: x + " (" + cdata[x].length + ")", plain: x, count: cdata[x].length, on: ctab === x, style: tchip(ctab === x), onClick: () => this.setState({ contactsTab: x, contactSel: null }) })), rows: cdata[ctab], tab: ctab };
    const titles = { person: ["Contact", "Owner record"], dashboard: ["Dashboard", "Today · live business overview"], leads: ["Leads", "Manage and route every enquiry"], calendar: ["Site visits", "Every scheduled visit & follow-up, in order"], properties: ["Properties", "Your live inventory"], propDetail: ["Property", "Inventory detail"], contacts: ["People", "Everyone on your buy & sell side"], team: ["Team", "Agents, roles & lead distribution"], settings: ["Settings", "White-label configuration"], integrations: ["Integrations", "Connect your own channels"], roadmap: ["Roadmap", "What's live today · what's coming"] };
    const t = titles[cur] || [this.state.deskSoonTitle, ""];
    // On the full-page lead record, the header title is the lead's name.
    if (cur === "leads" && this.state.deskLeadOpen) {
      const openLead = this.state.leads.find(l => l.id === this.state.deskLeadId);
      if (openLead) t[0] = openLead.name;
    }
    return {
      deskDashboard: cur === "dashboard", deskLeads: cur === "leads", deskCalendar: cur === "calendar", deskRoadmap: cur === "roadmap", deskSettings: cur === "settings", deskIntegrations: cur === "integrations", deskSoon: cur === "soon",
      deskProperties: cur === "properties", deskPropDetail: cur === "propDetail", deskContacts: cur === "contacts", deskPerson: cur === "person", deskTeam: cur === "team", TEAM: this.teamData(),
      PERSON: cur === "person" ? this.personView(this.state.personId, "desktop") : null, PRAIL: cur === "person" ? this.railForPerson(this.state.personId, "desktop") : null,
      PG, CT, PV: cur === "propDetail" ? this.propertyView(this.state.propDetailId, "desktop") : null, PVRAIL: cur === "propDetail" ? this.railForProperty(this.state.propDetailId, "desktop") : null,
      deskTitle: t[0], deskSubtitle: cur === "leads" ? (leads.length + " leads · " + overdue.length + " overdue") : cur === "properties" ? (this._d.properties.length + " listings") : t[1],
      deskNav, onSwitchAgent: () => this.setState({ viewOverride: "mobile", screen: "inbox" }), onGoDashboard: () => this.setState({ deskScreen: "dashboard" }),
      D: { kpis, pipeline, sources, leaderboard, overdue: overdue.map(l => { const ag = this.agentById(l.agentId); return { name: l.name, action: l.followUp ? l.followUp.action : "Follow up", when: l.followUp ? l.followUp.date : "", agentInitials: ag ? ag.initials : "", agentColor: ag ? ag.color : "#ccc", onOpen: () => this.openDeskLead(l.id) }; }), noOverdue: overdue.length === 0, activeCount: active.length, pipelineValue: this.fmtMoney(pipelineValue) },
      deskLeadOpen: this.state.deskLeadOpen, activeNavKey: activeKey,
      deskCountLabel: cur === "leads" ? (this.state.deskLeadOpen ? "" : (leads.length + " open · " + overdue.length + " overdue")) : cur === "properties" ? (this._d.properties.length + " listings") : "",
      DW, DL: this.leadView(this.state.deskLeadId, "desktop"), S, I,
      DRAIL: this.railForLead(this.state.deskLeadId, "desktop"),
      waModal: this.state.waModal, W: this.state.waModal ? this.waView() : null,
    };
  }

  _render() { window.__mount(this); }
}

// screens are defined in the render section appended below
window.__App = App;
window.__h = { h, div, span, btn, svg, icon };
window.__FIRM = FIRM;
})();
