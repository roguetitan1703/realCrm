// ============================================================================
// DESKTOP back-office for Bhumi Propcity CRM.
// ============================================================================
(function () {
"use strict";
const { h, div, span, btn } = window.__h;
const { sIcon, fIcon, HOUSE, CHECK, WA_PATH, BACK, CLOSE, PLUS } = window.__ri;
const ActionRail = window.__ActionRail;
const { propCardEl, houseThumb } = window.__screens;
const FIRM = window.__FIRM;
const BRAND = window.theme.brand;
const UI = window.__ui;
const T = UI.T; // Desk tokens (charcoal + ochre)
const THEME_SUCCESS = window.theme.signal.success; // green — for "won/closed" data signals only

// ---- left rail (Desk: charcoal, labelled sections, ochre active) ----
function deskRail(app, V) {
  // map the existing deskNav view-model onto the ui.deskSidebar shape
  const nav = [];
  V.deskNav.forEach(nv => {
    if (nv.sectionLabel) nav.push({ sectionLabel: nv.sectionLabel });
    nav.push({ label: nv.label, iconPath: nv.iconPath, active: nv.key === V.activeNavKey,
      badge: nv.badge ? Number(nv.badgeText) : null, onClick: nv.onClick });
  });
  return UI.deskSidebar({
    nav,
    footer: { name: "Rakesh Sethi", role: "Owner · Admin", initials: "RS", onSwitch: V.onSwitchAgent },
  });
}

// ---- header (Desk: serif title + live count, working search, quick-add) ----
function deskTopbar(app, V) {
  const crumb = (V.deskPropDetail || V.deskPerson || (V.deskLeads && V.deskLeadOpen))
    ? { parent: V.deskLeads ? "Leads" : V.deskPerson ? "People" : "Properties",
        onBack: V.deskLeads ? () => app.closeDeskLead() : V.deskPerson ? () => app.setState({ deskScreen: "contacts" }) : () => app.backFromProp() }
    : null;
  const onAdd = (V.deskLeads && !V.deskLeadOpen) ? () => app.openNewLead()
    : V.deskProperties ? () => app.setState({ addPropOpen: true })
    : V.deskContacts ? () => app.openNewContact()
    : null;
  const addLabel = V.deskProperties ? "Add property" : V.deskContacts ? "New contact" : "New lead";
  return UI.deskHeader({
    crumb,
    title: V.deskTitle,
    count: V.deskCountLabel,
    onSearch: () => app.openSearch(),
    searchLabel: "Search leads, ₹, locality…",
    onAdd,
    addLabel,
  });
}

function deskDashboard(app, V) {
  const D = V.D;
  const H = (t) => span({ style: "font-family:" + T.serif + "; font-weight:600; font-size:16px;" }, t);
  const wrap = div({ style: "flex:1; overflow-y:auto; padding:24px 26px 44px; display:flex; flex-direction:column; gap:18px;" });

  // KPI tiles — money/won ₹ in ochre; overdue tile flagged red
  const kpiRow = div({ style: "display:grid; grid-template-columns:repeat(4,1fr); gap:16px;" });
  D.kpis.forEach((k, i) => {
    const isMoney = i === 0, isOverdue = i === 3;
    const tile = UI.card({ style: "padding:16px 18px;" + (isOverdue && !D.noOverdue ? " border-color:#E4C4C0; background:#FBF3F1;" : "") });
    tile.appendChild(div({ style: "display:flex; align-items:center; gap:8px;" },
      span({ style: "width:28px; height:28px; border-radius:7px; display:flex; align-items:center; justify-content:center; background:" + (isOverdue ? "#F6DEDB" : isMoney ? T.accT : T.linenHi) + ";" }, sIcon(16, 16, isOverdue ? T.overdue : isMoney ? T.acc : T.muted, 2, k.iconPath)),
      span({ style: "font-size:12.5px; font-weight:600; color:" + T.muted + ";" }, k.label)));
    tile.appendChild(div({ style: "font-family:" + T.serif + "; font-weight:600; font-size:29px; margin-top:12px; font-variant-numeric:tabular-nums; color:" + (isOverdue ? T.overdue : isMoney ? T.acc : T.ink) + ";" }, k.value));
    tile.appendChild(div({ style: "font-size:12px; color:" + (isOverdue ? T.overdue : T.muted) + "; margin-top:3px;" }, k.sub));
    kpiRow.appendChild(tile);
  });
  wrap.appendChild(kpiRow);

  // pipeline + sources
  const pipe = UI.card({ style: "padding:18px 20px;" });
  pipe.appendChild(div({ style: "display:flex; align-items:baseline; justify-content:space-between; margin-bottom:16px;" }, H("Pipeline by stage"), span({ style: "font-size:12px; color:" + T.muted + ";" }, D.activeCount + " active · " + D.pipelineValue + " in play")));
  D.pipeline.forEach(st => pipe.appendChild(div({ style: "display:flex; align-items:center; gap:13px; margin-bottom:12px;" },
    div({ style: "width:98px; display:flex; align-items:center; gap:7px; flex-shrink:0;" }, span({ style: "width:9px; height:9px; border-radius:50%; background:" + st.color + ";" }), span({ style: "font-size:12.5px; font-weight:600;" }, st.name)),
    div({ style: "flex:1; height:22px; background:" + T.linenHi + "; border-radius:5px; overflow:hidden;" }, div({ style: "height:100%; width:" + st.pct + "; background:" + st.color + "; border-radius:5px;" })),
    div({ style: "width:34px; text-align:right; font-family:" + T.serif + "; font-weight:600; font-size:15px;" }, st.count),
    div({ style: "width:64px; text-align:right; font-size:12px; color:" + T.muted + ";" }, st.value))));
  const srcCard = UI.card({ style: "padding:18px 20px;" });
  srcCard.appendChild(div({ style: "margin-bottom:16px;" }, H("Leads by source")));
  D.sources.forEach(sr => srcCard.appendChild(div({ style: "margin-bottom:14px;" },
    div({ style: "display:flex; align-items:center; justify-content:space-between; margin-bottom:5px;" }, span({ style: "font-size:12.5px; font-weight:600; color:" + sr.color + ";" }, sr.name), span({ style: "font-size:12.5px; color:" + T.muted + ";" }, sr.count)),
    div({ style: "height:7px; background:" + T.linenHi + "; border-radius:4px; overflow:hidden;" }, div({ style: "height:100%; width:" + sr.pct + "; background:" + sr.color + ";" })))));
  wrap.appendChild(div({ style: "display:grid; grid-template-columns:1.75fr 1fr; gap:16px; align-items:start;" }, pipe, srcCard));

  // leaderboard + overdue
  const lbCard = UI.card({ style: "padding:18px 20px;" });
  lbCard.appendChild(div({ style: "margin-bottom:14px;" }, H("Agent leaderboard")));
  const cols = "1.7fr repeat(4,1fr) 1.1fr";
  lbCard.appendChild(div({ style: "display:grid; grid-template-columns:" + cols + "; font-size:11px; color:" + T.muted + "; letter-spacing:.05em; text-transform:uppercase; padding-bottom:9px; border-bottom:1px solid " + T.line + ";" },
    div(null, "Agent"), div({ style: "text-align:center;" }, "Assigned"), div({ style: "text-align:center;" }, "Contacted"), div({ style: "text-align:center;" }, "Visits"), div({ style: "text-align:center;" }, "Closed"), div({ style: "text-align:right;" }, "Value")));
  D.leaderboard.forEach(l => lbCard.appendChild(div({ style: "display:grid; grid-template-columns:" + cols + "; align-items:center; padding:11px 0; border-bottom:1px solid " + T.line + ";" },
    div({ style: "display:flex; align-items:center; gap:9px;" }, UI.avatar(l.initials, l.color, 28), span({ style: "font-weight:600; font-size:13.5px;" }, l.first), l.top ? span({ style: "font-size:9px; font-weight:700; color:" + T.acc + "; background:" + T.accT + "; border-radius:4px; padding:2px 5px;" }, "TOP") : null),
    div({ style: "text-align:center; font-size:14px; font-weight:600; font-variant-numeric:tabular-nums;" }, l.assigned),
    div({ style: "text-align:center; font-size:14px; font-weight:600; font-variant-numeric:tabular-nums;" }, l.contacted),
    div({ style: "text-align:center; font-size:14px; font-weight:600; font-variant-numeric:tabular-nums;" }, l.visits),
    div({ style: "text-align:center; font-size:14px; font-weight:700; color:" + THEME_SUCCESS + "; font-variant-numeric:tabular-nums;" }, l.closed),
    div({ style: "text-align:right;" }, UI.rupee(l.value, { size: "14px" })))));
  const ovCard = UI.card({ style: "padding:18px 20px;" });
  ovCard.appendChild(div({ style: "display:flex; align-items:center; gap:8px; margin-bottom:14px;" }, span({ style: "width:8px; height:8px; border-radius:50%; background:" + T.overdue + ";" + (D.noOverdue ? "" : " animation:softGlow 2s infinite;") }), H("Overdue follow-ups")));
  if (D.noOverdue) ovCard.appendChild(div({ style: "font-size:12.5px; color:" + T.muted + "; text-align:center; padding:14px 0;" }, "All caught up — no overdue follow-ups."));
  D.overdue.forEach(ov => ovCard.appendChild(btn({ onClick: ov.onOpen, style: "text-align:left; width:100%; display:flex; align-items:center; gap:11px; background:#FBF3F1; border:1px solid #EDD9D6; border-radius:9px; padding:11px 12px; cursor:pointer; font-family:inherit; margin-bottom:8px;" },
    div({ style: "flex:1; min-width:0;" }, div({ style: "font-weight:600; font-size:13.5px;" }, ov.name), div({ style: "font-size:12px; color:" + T.muted + "; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" }, ov.action)),
    div({ style: "text-align:right; flex-shrink:0;" }, div({ style: "font-size:11.5px; font-weight:600; color:" + T.overdue + ";" }, ov.when), ov.agentInitials ? span({ style: "display:inline-flex; margin-top:4px;" }, UI.avatar(ov.agentInitials, ov.agentColor, 22)) : null))));
  wrap.appendChild(div({ style: "display:grid; grid-template-columns:1.75fr 1fr; gap:16px; align-items:start;" }, lbCard, ovCard));
  return wrap;
}

// ---- the ONE filter/sort bar model for Leads (uses shared UI.filterBar) ----
function leadsFilterModel(app, V) {
  const DW = V.DW;
  const sortNames = { activity: "Last activity", name: "Name", budget: "Budget", stage: "Stage" };
  return {
    segments: DW.segments.map(s => ({ label: s.key, count: s.count, on: s.on, onClick: s.onClick })),
    sort: {
      label: sortNames[DW.sortKey] || "Last activity", value: DW.sortKey,
      options: [["activity", "Last activity"], ["name", "Name (A–Z)"], ["budget", "Budget"], ["stage", "Stage"]].map(([v, l]) => ({ label: l, value: v, onClick: () => DW.onSort(v) })),
    },
    views: [
      { key: "list", on: true, onClick: () => {} },
      { key: "board", on: false, onClick: () => app.toast("Board view lands with the Leads board pass") },
    ],
  };
}

// ---- Leads: dense sortable table (collection) ----
function deskLeadsTable(app, V) {
  const DW = V.DW;
  const col = (key, label, align) => ({ key, label, align: align || "left", onSort: () => DW.onSort(key) });
  const columns = [col("name", "Name"), col("req", "Requirement"), col("budget", "Budget"), col("stage", "Stage"), { key: "source", label: "Source" }, { key: "agent", label: "Agent" }, { key: "next", label: "Next follow-up" }];
  const rows = DW.rows.map(r => ({
    onClick: r.onOpen, active: r.selected,
    cells: [
      div(null, div({ style: "font-weight:600; font-size:14px;" }, r.name), div({ style: "color:" + T.muted + "; font-size:12px; font-variant-numeric:tabular-nums;" }, r.phone)),
      span({ style: "font-size:13.5px;" }, r.reqShort),
      UI.rupee(r.budget, { size: "15px", won: r.isWon }),
      UI.stagePill(r.stage),
      UI.sourcePill(r.source),
      r.assigned ? div({ style: "display:flex; align-items:center; gap:8px;" }, UI.avatar(r.agentInitials, r.agentColor, 26), span({ style: "font-size:13px;" }, r.agentFirst)) : span({ style: "font-size:12.5px; font-weight:600; color:" + T.acc + ";" }, "Unassigned"),
      span({ style: "font-size:13px; font-weight:" + (r.overdue ? "600" : "400") + "; color:" + r.nextColor + ";" }, r.nextFollow),
    ],
  }));
  return UI.moduleShell(leadsFilterModel(app, V), UI.table(columns, rows, { sortKey: DW.sortKey, sortDir: DW.sortDir }));
}

// ---- Leads: full-page record ----
function deskLeadRecord(app, V) {
  const DL = V.DL;
  if (!DL) return UI.emptyState("Lead not found", "It may have been merged or removed.");
  const hd = div({ style: "padding:16px 26px; border-bottom:1px solid " + T.line + "; display:flex; align-items:center; justify-content:space-between; gap:16px;" },
    div({ style: "display:flex; align-items:center; gap:10px; font-size:13px; color:" + T.muted + ";" },
      DL.phone, UI.sourcePill(DL.source), UI.stagePill(DL.stage),
      DL.isAssigned ? span(null, "· ", h("b", { style: "color:" + T.ink + "; font-weight:600;" }, DL.agentName)) : null,
      DL.showDup ? span({ style: "font-size:11px; font-weight:600; color:#8A5350; background:#EFE3E2; border-radius:5px; padding:3px 8px;" }, "Possible duplicate") : null),
    div({ style: "display:flex; gap:8px; flex-shrink:0;" },
      UI.button("ghost", { onClick: () => app.openEditLead(DL.id) }, "Edit"),
      DL.showDup ? UI.button("ghost", { onClick: DL.onMerge }, "Merge duplicate") : null,
      UI.button("metal", { onClick: () => app.openWhatsapp((DL.matches[0] && DL.matches[0].id) || null, DL.id, "desktop") }, "Send on WhatsApp")));

  // ===== MAIN column: NBA + requirement + matches + timeline =====
  const main = div({ style: "display:flex; flex-direction:column; gap:16px; min-width:0;" });
  const overdueNba = DL.hasFollowUp && DL.followColor === "#B23A2E";
  const nbaTitle = DL.hasFollowUp ? DL.followAction : (DL.matches[0] ? ("Send " + DL.matches[0].society + " — " + DL.matches[0].fitLine) : "Contact this lead");
  main.appendChild(UI.nbaBanner({
    label: overdueNba ? "Next best action · overdue" : "Next best action",
    title: nbaTitle,
    cta: { label: DL.hasFollowUp ? "Do it" : "Call now", onClick: () => app.openCall(DL.id) },
  }));
  // requirement
  const reqCard = UI.card({ style: "padding:18px 20px;" });
  reqCard.appendChild(UI.sectionHead("Requirement"));
  const reqGrid = div({ style: "display:grid; grid-template-columns:1fr 1fr; gap:16px;" });
  [["Config · Deal", DL.configDeal], ["Locality", DL.locality], ["Budget", DL.budget, true], ["Timeline", DL.reqTimeline]].forEach(([k, v, money]) =>
    reqGrid.appendChild(div(null, span({ style: "font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:" + T.muted + "; display:block; margin-bottom:3px;" }, k),
      money ? UI.rupee(v, { size: "18px" }) : span({ style: "font-size:15px; font-weight:500;" }, v))));
  reqCard.appendChild(reqGrid);
  if (DL.notes) reqCard.appendChild(div({ style: "margin-top:14px; font-size:13.5px; color:" + T.muted + "; background:" + T.linen + "; border-radius:8px; padding:11px 13px;" }, DL.notes));
  main.appendChild(reqCard);
  // matches
  const matchCard = UI.card({ style: "padding:18px 20px;" });
  matchCard.appendChild(UI.sectionHead("Top matches — " + DL.matchCount + " found", span({ style: "font-size:12px; color:" + T.muted + "; text-transform:none; letter-spacing:0; font-weight:400;" }, "by locality + budget")));
  if (!DL.matches.length) matchCard.appendChild(div({ style: "font-size:13.5px; color:" + T.muted + ";" }, "No matching inventory yet."));
  DL.matches.forEach((m, i) => matchCard.appendChild(div({ style: "display:flex; align-items:center; gap:14px; padding:12px 0;" + (i ? " border-top:1px solid " + T.line + ";" : "") },
    div({ style: "width:50px; height:50px; border-radius:9px; display:flex; align-items:center; justify-content:center; flex-shrink:0; background:" + m.thumbBg + ";" }, houseThumb(24, 24, m.thumbInk)),
    div({ style: "min-width:0; flex:1;" }, div({ style: "font-weight:600; font-size:15px;" }, m.society), div({ style: "font-size:12.5px; color:" + T.muted + "; margin-top:1px;" }, m.fitLine + " · " + m.score + "% fit")),
    UI.rupee(m.priceLabel, { size: "18px" }),
    UI.button("ghost", { onClick: m.onWhatsapp, style: "flex-shrink:0;" }, "Share"))));
  main.appendChild(matchCard);
  // timeline
  const tlCard = UI.card({ style: "padding:18px 20px;" });
  tlCard.appendChild(UI.sectionHead("Timeline"));
  DL.timeline.forEach((t, i) => tlCard.appendChild(div({ style: "display:flex; gap:12px;" },
    div({ style: "display:flex; flex-direction:column; align-items:center;" }, span({ style: "width:10px; height:10px; border-radius:50%; flex-shrink:0; margin-top:3px; background:" + t.dot + ";" }), i < DL.timeline.length - 1 ? span({ style: "width:1px; flex:1; min-height:16px; background:" + T.line + ";" }) : null),
    div({ style: "padding-bottom:15px;" }, div({ style: "font-size:13.5px; font-weight:500;" }, t.label), div({ style: "font-size:12px; color:" + T.muted + ";" }, t.ago)))));
  tlCard.appendChild(window.__noteAdder(app, DL.id));
  main.appendChild(tlCard);

  // ===== RIGHT: one sectioned ActionRail (collapses under content when narrow) =====
  const I = app.railIcons();
  const sd = app._schedDraft || (app._schedDraft = { action: "call", quick: "today", date: "", time: "11:00" });
  const waOpen = () => app.openWhatsapp((DL.matches[0] && DL.matches[0].id) || null, DL.id, "desktop");
  const rail = UI.actionRail({
    strip: [
      { iconPath: I.phone, accent: true, title: "Log call", onClick: () => app.openCall(DL.id) },
      { iconPath: I.wa, title: "WhatsApp", onClick: waOpen },
      { iconPath: I.cal, title: "Schedule follow-up", onClick: () => app.openCall(DL.id) },
      { iconPath: I.user, title: "Reassign", onClick: () => app.openEditLead(DL.id) },
    ],
    sections: [
      { label: "Quick actions", node: UI.quickActions([
        { label: "Log call", iconPath: I.phone, onClick: () => app.openCall(DL.id) },
        { label: "Add note", iconPath: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z", onClick: () => { const el = document.querySelector('[data-focus]'); if (el) el.focus(); } },
        { label: "WhatsApp", iconPath: I.wa, onClick: waOpen },
        { label: "Reassign", iconPath: I.user, onClick: () => app.openEditLead(DL.id) },
      ]) },
      { label: "Schedule follow-up", node: UI.scheduler({
        action: sd.action, quick: sd.quick, date: sd.date, time: sd.time,
        onAction: v => { sd.action = v; app.setState({}); },
        onQuick: v => { sd.quick = v; app.setState({}); },
        onDate: e => { sd.date = e.target.value; },
        onTime: e => { sd.time = e.target.value; },
        onSave: () => { app.setFollow(sd.action === "site" ? "site" : "call", DL.id); app.toast("Follow-up set — added to calendar"); },
        saveLabel: "Schedule — adds to calendar",
        savedMsg: DL.followSaved ? ("Added to " + DL.followOwner + "'s Today list") : null,
      }) },
      { label: "Stage", aside: span({ style: "font-size:11px; color:" + T.muted + "; text-transform:none; letter-spacing:0; font-weight:400;" }, "click to advance"),
        node: UI.stageTrack(
          DL.stepper.filter(s => s.state !== "lost").map(s => ({ name: s.name, state: s.state, onClick: s.onClick })),
          { label: "Mark as lost", onClick: (DL.stepper.find(s => s.state === "lost") || {}).onClick }) },
    ],
  });

  return UI.detailShell(hd, main, rail);
}

function deskLeads(app, V) {
  return V.deskLeadOpen ? deskLeadRecord(app, V) : deskLeadsTable(app, V);
}

// ---- legacy split-view leads (superseded; kept dormant) ----
function deskLeadsLegacy(app, V) {
  const DW = V.DW, DL = V.DL;
  const listWrap = div({ style: "width:366px; flex-shrink:0; border-right:1px solid #E1DDD3; display:flex; flex-direction:column; background:#FBFAF6;" });
  const rows = div({ style: "flex:1; overflow-y:auto; padding:8px;" });
  listWrap.appendChild(rows);

  const detail = div({ style: "flex:1; overflow-y:auto; min-width:0;" });
  if (DL) {
    const inner = div({ style: "padding:22px 26px 40px; max-width:900px;" });
    inner.appendChild(div({ style: "display:flex; align-items:flex-start; gap:14px;" },
      div({ style: "flex:1;" },
        div({ style: "display:flex; align-items:center; gap:10px;" }, h("h2", { style: "margin:0; font-family:'Fraunces', Georgia, serif; font-weight:600; font-size:24px;" }, DL.name), span({ style: DL.sourceChipLt }, DL.source), DL.showDup ? span({ style: "font-size:11px; font-weight:600; color:#8A5350; background:#EFE3E2; border-radius:5px; padding:3px 8px;" }, "Possible duplicate") : null),
        div({ style: "font-size:13px; color:#5C665F; margin-top:4px;" }, DL.phone + " · added " + DL.timeAgo)),
      DL.isAssigned ? span({ style: "font-size:12.5px; color:#5C665F; white-space:nowrap;" }, "Assigned · ", h("b", { style: "color:#22242A; font-weight:600;" }, DL.agentName)) : null));
    const bars = div({ style: "display:flex; gap:6px;" });
    DL.stepper.forEach(st => bars.appendChild(btn({ onClick: st.onClick, title: st.name, style: st.barStyle }, span({ style: "font-size:11px; font-weight:600; color:" + st.labelColor + ";" }, st.name))));
    inner.appendChild(div({ style: "margin-top:18px; background:#fff; border:1px solid #E1DDD3; border-radius:11px; padding:15px 17px;" },
      div({ style: "display:flex; align-items:center; justify-content:space-between; margin-bottom:11px;" }, span({ style: "font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#8A938C;" }, "Stage · click to advance"), span({ style: "display:inline-flex; align-items:center; gap:7px; font-family:'Fraunces', Georgia, serif; font-weight:600; font-size:15px; color:" + DL.stageColor + ";" }, span({ style: "width:9px; height:9px; border-radius:50%; background:" + DL.stageColor + ";" }), DL.stage)),
      bars));
    const reqGrid = div({ style: "display:grid; grid-template-columns:1fr 1fr; gap:13px 14px;" });
    [["Budget", DL.budget, true], ["Config · Deal", DL.configDeal], ["Locality", DL.locality], ["Timeline", DL.reqTimeline]].forEach(([k, v, big]) => reqGrid.appendChild(div(null, div({ style: "font-size:11px; color:#8A938C;" }, k), div({ style: big ? "font-family:'Fraunces', Georgia, serif; font-weight:600; font-size:17px; color:#B8791C;" : "font-weight:600; font-size:14px;" }, v))));
    const reqCard = div({ style: "background:#fff; border:1px solid #E1DDD3; border-radius:11px; padding:16px 17px;" }, div({ style: "font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#8A938C; margin-bottom:12px;" }, "Requirement"), reqGrid, div({ style: "margin-top:12px; font-size:12.5px; color:#5C665F; background:#F1EFEA; border-radius:7px; padding:9px 11px;" }, DL.notes));
    const matchCard = div({ style: "background:#fff; border:1px solid #E1DDD3; border-radius:11px; padding:16px 17px;" }, div({ style: "display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;" }, div({ style: "font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#8A938C;" }, "Matching properties"), span({ style: "font-size:12px; color:#5C665F;" }, DL.matchCount + " found")));
    const mCol = div({ style: "display:flex; flex-direction:column; gap:10px;" });
    DL.matches.forEach(m => mCol.appendChild(window.__matchRow(app, m)));
    matchCard.appendChild(mCol);
    const fuCard = div({ style: "background:#fff; border:1px solid #E1DDD3; border-radius:11px; padding:16px 17px;" }, div({ style: "font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#8A938C; margin-bottom:11px;" }, "Follow-up"));
    if (DL.hasFollowUp) fuCard.appendChild(div({ style: "display:flex; align-items:center; gap:11px; background:#F1EFEA; border-radius:8px; padding:10px 11px; margin-bottom:11px;" }, div({ style: "width:38px; height:38px; border-radius:8px; background:" + DL.followGlow + "; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff;" }, span({ style: "font-size:9px;" }, DL.followDay), span({ style: "font-family:'Fraunces', Georgia, serif; font-weight:700; font-size:12px;" }, DL.followTimeShort)), div({ style: "flex:1;" }, div({ style: "font-weight:600; font-size:13px;" }, DL.followAction), div({ style: "font-size:11.5px; color:" + DL.followColor + ";" }, DL.followWhen))));
    else fuCard.appendChild(div({ style: "font-size:12px; color:#8A938C;" }, "Set the next action from the Actions rail →"));
    if (DL.followSaved) fuCard.appendChild(div({ style: "margin-top:10px; display:flex; align-items:center; gap:7px; font-size:12px; color:#2E7D4E; font-weight:600;" }, sIcon(15, 15, "#2E7D4E", 2.6, '<path d="' + CHECK + '"/>'), "Added to " + DL.followOwner + "'s Today list"));
    const tlCard = div({ style: "background:#fff; border:1px solid #E1DDD3; border-radius:11px; padding:16px 17px;" }, div({ style: "font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#8A938C; margin-bottom:13px;" }, "Timeline"));
    const tlCol = div({ style: "display:flex; flex-direction:column;" });
    DL.timeline.forEach(t => tlCol.appendChild(div({ style: "display:flex; gap:11px;" }, div({ style: "display:flex; flex-direction:column; align-items:center;" }, span({ style: "width:11px; height:11px; border-radius:50%; flex-shrink:0; background:" + t.dot + ";" }), span({ style: "width:2px; flex:1; min-height:12px; background:" + t.rail + ";" })), div({ style: "padding-bottom:13px;" }, div({ style: "font-size:12.5px; font-weight:500;" }, t.label), div({ style: "font-size:11px; color:#8A938C;" }, t.ago)))));
    tlCard.appendChild(tlCol);
    tlCard.appendChild(window.__noteAdder(app, app.state.deskLeadId));
    const clCard = window.__checklistCard(app, app.state.deskLeadId);
    const rightCol = div({ style: "display:flex; flex-direction:column; gap:16px;" }, fuCard);
    if (clCard) rightCol.appendChild(clCard);
    rightCol.appendChild(tlCard);
    inner.appendChild(div({ style: "margin-top:16px; display:grid; grid-template-columns:1.2fr 1fr; gap:16px; align-items:start;" },
      div({ style: "display:flex; flex-direction:column; gap:16px;" }, reqCard, matchCard),
      rightCol));
    detail.appendChild(inner);
  }
  const railWrap = div({ style: "width:312px; flex-shrink:0; border-left:1px solid #E1DDD3; background:#FBFAF6; overflow-y:auto; padding:20px 18px 40px;" }, ActionRail(V.DRAIL));
  return div({ style: "flex:1; display:flex; min-height:0;" }, listWrap, detail, railWrap);
}

function deskSettings(app, V) {
  const S = V.S;
  const swRow = div({ style: "display:flex; gap:9px;" });
  S.swatches.forEach(sw => swRow.appendChild(div({ style: "text-align:center;" }, div({ style: "width:46px; height:46px; border-radius:8px; border:1px solid rgba(0,0,0,.08); background:" + sw.hex + ";" }), div({ style: "font-size:10px; color:#8A938C; margin-top:4px;" }, sw.name))));
  const stagesCol = div({ style: "display:flex; flex-direction:column; gap:8px;" });
  S.stages.forEach(sg => stagesCol.appendChild(div({ style: "display:flex; align-items:center; gap:9px; background:#F1EFEA; border:1px solid #E1DDD3; border-radius:8px; padding:8px 11px;" }, sIcon(13, 13, "#B8BFB6", 2.4, '<path d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01"/>'), span({ style: "width:9px; height:9px; border-radius:50%; background:" + sg.color + ";" }), span({ style: "font-size:13px; font-weight:600;" }, sg.name))));
  const srcWrap = div({ style: "display:flex; flex-wrap:wrap; gap:9px;" });
  S.sources.forEach(so => srcWrap.appendChild(span({ style: "border:1px solid " + so.color + "; color:" + so.color + "; border-radius:6px; padding:6px 13px; font-size:12.5px; font-weight:600;" }, so.name)));
  srcWrap.appendChild(span({ style: "border:1px dashed #C9A96A; color:#B8791C; border-radius:6px; padding:6px 13px; font-size:12.5px; font-weight:600;" }, "+ Add source"));
  return div({ style: "flex:1; overflow-y:auto; padding:26px 28px 40px;" }, div({ style: "max-width:860px; display:flex; flex-direction:column; gap:18px;" },
    div({ style: "background:#22242A; color:#F1EFEA; border-radius:12px; padding:16px 20px; display:flex; align-items:center; gap:13px;" }, sIcon(22, 22, "#B8791C", 1.8, '<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>'), div(null, div({ style: "font-family:'Fraunces', Georgia, serif; font-weight:600; font-size:15px;" }, "White-label — this is your brand, your data"), div({ style: "font-size:12.5px; color:#8b8b85;" }, "Everything below is a config swap. The next brokerage is a new theme, not a rebuild."))),
    div({ style: "display:grid; grid-template-columns:1.3fr 1fr; gap:16px; align-items:start;" },
      div({ style: "background:#fff; border:1px solid #E1DDD3; border-radius:12px; padding:18px 20px;" }, div({ style: "font-family:'Fraunces', Georgia, serif; font-weight:600; font-size:15px; margin-bottom:14px;" }, "Brand"),
        div({ style: "display:flex; gap:15px; align-items:center; margin-bottom:16px;" }, div({ style: "width:64px; height:64px; border:1.5px dashed #C9A96A; border-radius:8px; display:flex; align-items:center; justify-content:center; font-family:'Fraunces', Georgia, serif; font-weight:700; font-size:22px; color:#B8791C;" }, BRAND.initials), div({ style: "flex:1;" }, div({ style: "font-size:11px; color:#8A938C; margin-bottom:5px;" }, "Firm name"), div({ style: "background:#F1EFEA; border:1px solid #E1DDD3; border-radius:8px; padding:10px 12px; font-weight:600;" }, FIRM))),
        div({ style: "font-size:11px; color:#8A938C; margin-bottom:7px;" }, "Brand colours"), swRow),
      div({ style: "background:#fff; border:1px solid #E1DDD3; border-radius:12px; padding:18px 20px;" }, div({ style: "font-family:'Fraunces', Georgia, serif; font-weight:600; font-size:15px; margin-bottom:14px;" }, "Pipeline stages"), stagesCol)),
    div({ style: "background:#fff; border:1px solid #E1DDD3; border-radius:12px; padding:18px 20px;" }, div({ style: "font-family:'Fraunces', Georgia, serif; font-weight:600; font-size:15px; margin-bottom:14px;" }, "Lead sources"), srcWrap)));
}

function deskIntegrations(app, V) {
  const grid = div({ style: "display:grid; grid-template-columns:1fr 1fr; gap:14px;" });
  V.I.cards.forEach(ic => grid.appendChild(btn({ onClick: ic.onOpen, style: "text-align:left; background:#fff; border:1px solid #E1DDD3; border-radius:12px; padding:17px 18px; display:flex; flex-direction:column; gap:11px; cursor:pointer; font-family:inherit; color:inherit;" },
    div({ style: "display:flex; align-items:center; gap:12px;" }, div({ style: "width:42px; height:42px; border-radius:9px; background:" + ic.tint + "; display:flex; align-items:center; justify-content:center; font-family:'Fraunces', Georgia, serif; font-weight:700; font-size:15px; color:" + ic.color + ";" }, ic.mark), div({ style: "flex:1;" }, div({ style: "font-family:'Fraunces', Georgia, serif; font-weight:600; font-size:14.5px;" }, ic.name), div({ style: "font-size:12px; color:#5C665F;" }, ic.desc))),
    div({ style: "display:flex; align-items:center; justify-content:space-between; margin-top:2px;" }, span({ style: "display:inline-flex; align-items:center; gap:6px; font-size:11.5px; font-weight:600; color:" + ic.badgeColor + "; background:" + ic.badgeTint + "; border-radius:14px; padding:4px 10px;" }, span({ style: "width:6px; height:6px; border-radius:50%; background:" + ic.badgeColor + ";" }), ic.badgeLabel), span({ style: "font-family:'Fraunces', Georgia, serif; font-weight:600; font-size:12.5px; color:#22242A; border:1px solid #E1DDD3; border-radius:8px; padding:7px 15px;" }, "View")))));
  return div({ style: "flex:1; overflow-y:auto; padding:26px 28px 40px;" }, div({ style: "max-width:900px;" }, div({ style: "font-size:13.5px; color:#5C665F; margin-bottom:18px; max-width:600px;" }, "These switch on with your own accounts. Leads, calls and messages flow straight into " + FIRM + " — no copy-paste. Nothing here is live in the demo; it's wired to your credentials on setup."), grid));
}

function deskProperties(app, V) {
  const PG = V.PG;
  // ONE filter bar: status segments · type chips · view switch (cards/list)
  const filterModel = {
    segments: PG.statusFilters.map(s => ({ label: s.label, on: s.on, onClick: s.onClick })),
    filters: PG.typeFilters.filter(t => t.label !== "All").map(t => ({ label: t.label, on: t.on, onClick: t.onClick })),
    views: [
      { key: "cards", on: PG.view === "cards", onClick: () => PG.setView("cards") },
      { key: "list", on: PG.view === "list", onClick: () => PG.setView("list") },
    ],
  };
  let content;
  if (!PG.cards.length) content = div({ style: "padding:26px;" }, UI.emptyState("No properties match", "Try clearing a filter, or add a listing.", { label: "Add property", onClick: () => app.setState({ addPropOpen: true }) }));
  else if (PG.view === "list") {
    const columns = [{ key: "society", label: "Property" }, { key: "config", label: "Config" }, { key: "locality", label: "Locality" }, { key: "price", label: "Price" }, { key: "area", label: "Area" }, { key: "owner", label: "Owner" }, { key: "status", label: "Status" }];
    const rows = PG.rows.map(p => ({ onClick: p.onOpen, cells: [
      div({ style: "display:flex; align-items:center; gap:11px;" }, div({ style: "width:38px; height:38px; border-radius:8px; flex-shrink:0; background:" + p.thumbBg + "; display:flex; align-items:center; justify-content:center;" }, houseThumb(19, 19, p.thumbInk)), div(null, div({ style: "font-weight:600; font-size:14px;" }, p.society), div({ style: "font-size:12px; color:" + T.muted + ";" }, p.title))),
      p.type + " · " + p.deal, p.locality, UI.rupee(p.priceLabel, { size: "15px" }), span({ style: "font-size:13px;" }, p.area), span({ style: "font-size:13px;" }, p.owner), UI.statusPill(p.status),
    ] }));
    content = UI.table(columns, rows);
  } else {
    const grid = div({ style: "display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:16px; padding:22px 26px 40px;" });
    PG.cards.forEach(c => grid.appendChild(propCardEl(c, 130, 46)));
    content = grid;
  }
  return UI.moduleShell(filterModel, content);
}

function deskPropDetail(app, V) {
  const PV = V.PV;
  const I = app.railIcons();
  // header band: society + config + status + ₹ + actions
  const hd = div({ style: "padding:16px 26px; border-bottom:1px solid " + T.line + "; display:flex; align-items:center; justify-content:space-between; gap:16px;" },
    div({ style: "display:flex; align-items:center; gap:12px;" },
      UI.rupee(PV.priceLabel, { size: "20px" }),
      span({ style: "font-size:13px; color:" + T.muted + ";" }, PV.deal + " · " + PV.title),
      UI.statusPill(PV.status), span({ style: "font-size:12.5px; color:" + T.muted + ";" }, "Owner · " + PV.owner)),
    div({ style: "display:flex; gap:8px; flex-shrink:0;" },
      UI.button("ghost", { onClick: () => app.openEditProp(PV.id) }, "Edit listing"),
      UI.button("metal", { onClick: PV.onWhatsapp }, "Share on WhatsApp")));

  // ===== MAIN: hero + spec sheet + interested buyers =====
  const main = div({ style: "display:flex; flex-direction:column; gap:16px; min-width:0;" });
  main.appendChild(div({ style: "height:200px; border-radius:12px; background:" + PV.thumbBg + "; display:flex; align-items:center; justify-content:center;" }, houseThumb(72, 72, PV.thumbInk)));
  // spec sheet
  const specCard = UI.card({ style: "padding:18px 20px;" });
  specCard.appendChild(UI.sectionHead("Spec sheet"));
  const specGrid = div({ style: "display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px;" });
  PV.spec.forEach(sp => specGrid.appendChild(div(null, span({ style: "font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:" + T.muted + "; display:block; margin-bottom:3px;" }, sp.k), span({ style: "font-weight:600; font-size:14px;" }, sp.v))));
  specCard.appendChild(specGrid);
  const featWrap = div({ style: "margin-top:16px; display:flex; flex-wrap:wrap; gap:7px;" });
  (PV.features || []).forEach(f => featWrap.appendChild(span({ style: "display:inline-flex; align-items:center; gap:6px; font-size:12.5px; color:" + T.ink + "; background:" + T.linen + "; border-radius:14px; padding:6px 12px;" }, sIcon(12, 12, THEME_SUCCESS, 3, '<path d="' + CHECK + '"/>'), f)));
  specCard.appendChild(featWrap);
  main.appendChild(specCard);
  // interested buyers (reverse match)
  const buyersCard = UI.card({ style: "padding:18px 20px;" });
  buyersCard.appendChild(UI.sectionHead("Interested buyers", span({ style: "font-size:12px; color:" + T.muted + ";" }, PV.interestedCount + " match")));
  if (PV.noBuyers) buyersCard.appendChild(div({ style: "font-size:13px; color:" + T.muted + ";" }, "No matching buyers yet."));
  PV.interested.forEach((b, i) => buyersCard.appendChild(btn({ onClick: b.onOpen, style: "text-align:left; width:100%; display:flex; align-items:center; gap:12px; background:transparent; border:none; border-top:" + (i ? "1px solid " + T.line : "none") + "; padding:12px 0; cursor:pointer; font-family:inherit; color:inherit;" },
    div({ style: "flex:1; min-width:0;" }, div({ style: "font-weight:600; font-size:14.5px;" }, b.name), div({ style: "font-size:12.5px; color:" + T.muted + "; margin-top:1px;" }, b.req)),
    span({ style: "display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:600; color:" + THEME_SUCCESS + "; background:#E2F0E7; border-radius:10px; padding:3px 9px;" }, sIcon(11, 11, THEME_SUCCESS, 3, '<path d="' + CHECK + '"/>'), b.fit))));
  main.appendChild(buyersCard);

  // ===== RAIL =====
  const topBuyer = PV.interested[0];
  const rail = UI.actionRail({
    sections: [
      { label: topBuyer ? "Next best action" : "Share", node: UI.nbaBanner({
        label: topBuyer ? "Interested buyer" : "Share",
        title: topBuyer ? ("Send to " + topBuyer.name.split(" ")[0]) : "Share this listing",
        cta: { label: "WhatsApp", onClick: PV.onWhatsapp },
      }) },
      { label: "Quick actions", node: UI.quickActions([
        { label: "Share", iconPath: I.wa, onClick: PV.onWhatsapp },
        { label: "Set status", iconPath: I.tag, onClick: () => app.setState({ deskScreen: "propDetail" }) },
        { label: "Call owner", iconPath: I.phone, onClick: () => app.openPerson(PV.owner, "desktop") },
        { label: "Edit", iconPath: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z", onClick: () => app.openEditProp(PV.id) },
      ]) },
    ],
  });

  return UI.detailShell(hd, main, rail);
}

function deskContacts(app, V) {
  const CT = V.CT;
  // ONE filter bar: the four books as segments; People is list-only (§5d)
  const filterModel = {
    segments: CT.tabs.map(tb => ({ label: tb.plain, count: tb.count, on: tb.on, onClick: tb.onClick })),
    views: [{ key: "list", on: true, onClick: () => {} }],
  };
  const list = div({ style: "display:flex; flex-direction:column; gap:10px; padding:22px 26px 40px; max-width:860px;" });
  if (!CT.rows.length) list.appendChild(UI.emptyState("No one here yet", "Add a contact to start your " + CT.tab.toLowerCase() + " book.", { label: "New contact", onClick: () => app.openNewContact() }));
  CT.rows.forEach(r => {
    const rowWrap = UI.card({ style: "overflow:hidden;" });
    rowWrap.appendChild(btn({ onClick: () => r.expandable ? app.setState(st => ({ contactSel: st.contactSel === r.name ? null : r.name })) : r.onOpen(), style: "text-align:left; width:100%; padding:15px 17px; display:flex; align-items:center; gap:14px; cursor:pointer; font-family:inherit; color:inherit; background:transparent; border:none;" },
      UI.avatar(r.initials, T.char, 40),
      div({ style: "flex:1; min-width:0;" }, div({ style: "font-weight:600; font-size:15.5px;" }, r.name), div({ style: "font-size:13px; color:" + T.muted + "; margin-top:1px;" }, r.context)),
      r.stage ? UI.stagePill(r.stage) : null,
      r.count != null ? span({ style: "font-size:12px; color:" + T.muted + ";" }, r.count + " listing" + (r.count > 1 ? "s" : "")) : null,
      r.expandable ? sIcon(20, 20, T.acc, 2, '<path d="M9 18l6-6-6-6"/>') : null));
    if (r.expandable && app.state.contactSel === r.name) {
      const sub = div({ style: "border-top:1px solid " + T.line + "; padding:12px; display:grid; grid-template-columns:1fr 1fr; gap:10px; background:" + T.linen + ";" });
      r.properties.forEach(p => sub.appendChild(btn({ onClick: p.onOpen, style: "text-align:left; display:flex; align-items:center; gap:10px; background:#fff; border:1px solid " + T.line + "; border-radius:9px; padding:11px 12px; cursor:pointer; font-family:inherit; color:inherit;" }, div({ style: "flex:1; min-width:0;" }, div({ style: "font-weight:600; font-size:13.5px;" }, p.title), div({ style: "font-size:12px; color:" + T.muted + ";" }, p.sub)), UI.statusPill(p.status))));
      sub.appendChild(UI.button("ghost", { onClick: () => app.openEditContact(r.name), style: "grid-column:1/-1; justify-self:start; margin-top:2px;" }, "Edit contact"));
      rowWrap.appendChild(sub);
    }
    list.appendChild(rowWrap);
  });
  return UI.moduleShell(filterModel, list);
}

function deskPerson(app, V) {
  const P = V.PERSON;
  const I = app.railIcons();
  // header band
  const hd = div({ style: "padding:16px 26px; border-bottom:1px solid " + T.line + "; display:flex; align-items:center; justify-content:space-between; gap:16px;" },
    div({ style: "display:flex; align-items:center; gap:13px;" },
      UI.avatar(P.initials, T.char, 44),
      div(null, div({ style: "font-family:" + T.serif + "; font-weight:600; font-size:19px;" }, P.name),
        div({ style: "font-size:12.5px; color:" + T.muted + "; margin-top:1px;" }, h("b", { style: "color:" + T.acc + "; font-weight:600;" }, P.role), " · " + P.phone))),
    UI.button("metal", { onClick: () => app.openAddForOwner(P.name) }, "Add a listing"));

  // ===== MAIN: stats + listings =====
  const main = div({ style: "display:flex; flex-direction:column; gap:16px; min-width:0;" });
  const statsG = div({ style: "display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px;" });
  P.stats.forEach(st => statsG.appendChild(UI.card({ style: "padding:16px 18px;" },
    st.k === "Portfolio value" ? UI.rupee(st.v, { size: "22px" }) : span({ style: "font-family:" + T.serif + "; font-weight:600; font-size:22px;" }, st.v),
    div({ style: "font-size:12px; color:" + T.muted + "; margin-top:3px;" }, st.k))));
  main.appendChild(statsG);
  const listCard = UI.card({ style: "padding:18px 20px;" });
  listCard.appendChild(UI.sectionHead("Listings from this owner", span({ style: "font-size:12px; color:" + T.muted + ";" }, P.metaLine)));
  const listG = div({ style: "display:grid; grid-template-columns:1fr 1fr; gap:12px;" });
  P.listings.forEach(p => listG.appendChild(btn({ onClick: p.onOpen, style: "text-align:left; display:flex; gap:12px; border:1px solid " + T.line + "; border-radius:10px; padding:12px; cursor:pointer; font-family:inherit; color:inherit; background:#fff;" },
    div({ style: "width:54px; height:54px; border-radius:9px; flex-shrink:0; background:" + p.thumbBg + "; display:flex; align-items:center; justify-content:center;" }, houseThumb(24, 24, p.thumbInk)),
    div({ style: "flex:1; min-width:0;" }, div({ style: "display:flex; align-items:baseline; justify-content:space-between; gap:8px;" }, span({ style: "font-weight:600; font-size:14px;" }, p.society), UI.rupee(p.priceLabel, { size: "14px" })), div({ style: "font-size:12px; color:" + T.muted + "; margin-top:1px;" }, p.line), span({ style: "display:inline-block; margin-top:7px;" }, UI.statusPill(p.status))))));
  listCard.appendChild(listG);
  main.appendChild(listCard);

  // ===== RAIL =====
  const rail = UI.actionRail({
    sections: [
      { label: "Quick actions", node: UI.quickActions([
        { label: "Call owner", iconPath: I.phone, onClick: () => app.openCall(P.name) },
        { label: "Add listing", iconPath: I.home, onClick: () => app.openAddForOwner(P.name) },
        { label: "Edit", iconPath: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z", onClick: () => app.openEditContact(P.name) },
        { label: "Back", iconPath: "M15 18l-6-6 6-6", onClick: P.onBack },
      ]) },
    ],
  });

  return UI.detailShell(hd, main, rail);
}

function deskTeam(app, V) {
  const grid = div({ style: "display:grid; grid-template-columns:1fr 1fr; gap:16px;" });
  V.TEAM.forEach(ag => grid.appendChild(div({ style: "background:#fff; border:1px solid " + ag.cardBorder + "; border-radius:12px; padding:17px 18px; opacity:" + ag.cardOpacity + ";" },
    div({ style: "display:flex; align-items:center; gap:12px;" }, span({ style: "width:44px; height:44px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:15px; font-weight:600; color:#fff; background:" + ag.color + ";" }, ag.initials), div({ style: "flex:1; min-width:0;" }, div({ style: "font-family:'Fraunces', Georgia, serif; font-weight:600; font-size:16px;" }, ag.name), div({ style: "font-size:12px; color:#8A938C;" }, "Sales agent · Pune")), span({ style: ag.statusStyle }, ag.statusLabel)),
    div({ style: "display:flex; gap:0; margin:15px 0; border:1px solid #E1DDD3; border-radius:9px; overflow:hidden;" },
      div({ style: "flex:1; text-align:center; padding:9px 4px; border-right:1px solid #E1DDD3;" }, div({ style: "font-family:'Fraunces', Georgia, serif; font-weight:700; font-size:18px;" }, ag.active), div({ style: "font-size:10.5px; color:#8A938C;" }, "Active")),
      div({ style: "flex:1; text-align:center; padding:9px 4px; border-right:1px solid #E1DDD3;" }, div({ style: "font-family:'Fraunces', Georgia, serif; font-weight:700; font-size:18px; color:#2E7D4E;" }, ag.closed), div({ style: "font-size:10.5px; color:#8A938C;" }, "Closed")),
      div({ style: "flex:1; text-align:center; padding:9px 4px;" }, div({ style: "font-family:'Fraunces', Georgia, serif; font-weight:700; font-size:18px; color:" + ag.overdueColor + ";" }, ag.overdue), div({ style: "font-size:10.5px; color:#8A938C;" }, "Overdue"))),
    div({ style: "display:flex; gap:8px;" }, btn({ onClick: ag.onReassign, style: "flex:1; font-family:'Fraunces', Georgia, serif; font-weight:600; font-size:12.5px; color:#22242A; background:#fff; border:1px solid #E1DDD3; border-radius:8px; padding:9px; cursor:pointer;" }, "Reassign leads"), btn({ onClick: ag.onToggle, style: "font-family:'Fraunces', Georgia, serif; font-weight:600; font-size:12.5px; color:" + ag.toggleColor + "; background:#fff; border:1px solid " + ag.toggleBorder + "; border-radius:8px; padding:9px 14px; cursor:pointer;" }, ag.toggleLabel)))));
  return div({ style: "flex:1; overflow-y:auto; padding:22px 28px 40px;" }, div({ style: "max-width:900px;" },
    div({ style: "display:flex; align-items:center; margin-bottom:18px;" }, div({ style: "flex:1; font-size:13.5px; color:#5C665F;" }, "Distribute leads fairly, or hand-pick. When an agent leaves, their pipeline moves in one action — no lost clients."), btn({ onClick: () => app.setState({ addAgentOpen: true }), style: "display:inline-flex; align-items:center; gap:8px; background:#22242A; color:#F1EFEA; border:none; border-radius:9px; padding:10px 16px; font-family:'Fraunces', Georgia, serif; font-weight:600; font-size:13.5px; cursor:pointer;" }, sIcon(17, 17, "#B8791C", 2.2, '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/>'), "Add agent")),
    grid));
}

function deskSoon(app, V) {
  return div({ style: "flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:40px; text-align:center; gap:13px;" },
    div({ style: "width:60px; height:60px; border-radius:14px; background:#EAE7DE; border:1px solid #D7DCD2; display:flex; align-items:center; justify-content:center;" }, sIcon(28, 28, "#22242A", 1.7, HOUSE)),
    div({ style: "font-family:'Fraunces', Georgia, serif; font-weight:600; font-size:18px;" }, V.deskTitle),
    div({ style: "font-size:13.5px; color:#5C665F; max-width:340px; line-height:1.55;" }, "Part of the full build. This walkthrough focuses on the Dashboard, Leads workspace and the white-label Settings & Integrations."),
    btn({ onClick: V.onGoDashboard, style: "font-family:'Fraunces', Georgia, serif; font-weight:600; font-size:14px; color:#F1EFEA; background:#22242A; border:none; border-radius:9px; padding:11px 20px; cursor:pointer;" }, "Back to Dashboard"));
}

// ---- Roadmap (Block 1 live / Block 2 next) ----
function deskRoadmap(app, V) {
  const live = [
    ["Lead capture & routing", "New leads land, auto-tag by source, round-robin to agents — out of Excel, into one system."],
    ["Requirement → property matching", "Every buyer matched to your live inventory with a plain-language fit reason."],
    ["WhatsApp message generator", "Broker-voice messages in Hinglish, English & Marathi — the format your market already trusts."],
    ["Agent management & handover", "Reassign an agent's whole pipeline in one action. No client is ever lost when someone leaves."],
    ["Post-won handover checklist", "Owner-defined steps (move-in payment, gate app, society NOC) your juniors must complete."],
    ["Site-visit calendar & reminders", "Every visit and follow-up in one agenda, with native nudges — nothing falls through."],
    ["Agent scoping & leak traceability", "Agents see only their book; every screen watermarked; export locked to the owner."],
  ];
  const next = [
    ["Deeper matching intelligence", "Weighted scoring across budget, locality, config, possession & amenities — sharper every deal."],
    ["Renewal & repeat-business engine", "Auto-nudge to re-approach past clients at the right time — rent renewals, next purchase."],
    ["Calendar sync & auto-confirmations", "Two-way sync with the agent's phone calendar; visit confirmations sent automatically."],
    ["Documents & possession vault", "Agreements, IDs, cheque photos held against each deal — audited, owner-controlled."],
    ["Portal & telephony integrations", "99acres / MagicBricks lead import, click-to-call and SMS from your own number."],
  ];
  const later = [
    ["Deal value, commission & finance", "Booking value, commission splits and payout tracking — a finance module we integrate with, not a bolt-on."],
    ["Marketing & campaign tools", "Bulk broadcasts and campaign attribution — separate track, priced on its own."],
  ];
  const col = (title, tint, items, tag) => {
    const c = div({ style: "background:#fff; border:1px solid #E1DDD3; border-radius:12px; padding:18px 20px; display:flex; flex-direction:column; gap:12px;" });
    c.appendChild(div({ style: "display:flex; align-items:center; gap:8px;" }, span({ style: "width:9px; height:9px; border-radius:50%; background:" + tint + ";" }), div({ style: "font-family:'Fraunces', Georgia, serif; font-weight:600; font-size:15px;" }, title), span({ style: "flex:1;" }), span({ style: "font-size:10px; font-weight:700; letter-spacing:.5px; text-transform:uppercase; color:" + tint + "; background:" + tint + "18; border-radius:5px; padding:3px 8px;" }, tag)));
    items.forEach(([h1, sub]) => c.appendChild(div({ style: "display:flex; gap:10px; align-items:flex-start;" },
      sIcon(16, 16, tint, 2.4, tag === "Live" ? '<path d="' + CHECK + '"/>' : '<circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/>', { style: "flex-shrink:0; margin-top:2px;" }),
      div(null, div({ style: "font-weight:600; font-size:13.5px;" }, h1), div({ style: "font-size:12px; color:#5C665F; margin-top:1px; line-height:1.45;" }, sub)))));
    return c;
  };
  return div({ style: "flex:1; overflow-y:auto; padding:26px 28px 40px;" }, div({ style: "max-width:1000px; display:flex; flex-direction:column; gap:18px;" },
    div({ style: "background:#22242A; color:#F1EFEA; border-radius:12px; padding:18px 22px;" },
      div({ style: "font-family:'Fraunces', Georgia, serif; font-weight:600; font-size:16px;" }, "Built for how a Pune brokerage actually runs"),
      div({ style: "font-size:13px; color:#8b8b85; margin-top:5px; line-height:1.5; max-width:720px;" }, "We're solving two things the big legacy systems treat as afterthoughts: getting your business out of fragmented Excel, and helping you run your agents. Everything below is mapped — here's what's live today and what's next.")),
    div({ style: "display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:start;" }, col("Live in this system", "#2E7D4E", live, "Live"), div({ style: "display:flex; flex-direction:column; gap:16px;" }, col("Next up (Block 2)", "#B8791C", next, "Next"), col("Later / integrate", "#6E7A74", later, "Later")))));
}

function desktopShell(app, V) {
  let main;
  if (V.deskDashboard) main = deskDashboard(app, V);
  else if (V.deskLeads) main = deskLeads(app, V);
  else if (V.deskCalendar) main = window.__screens.calendarBody(app, { desktop: true });
  else if (V.deskRoadmap) main = deskRoadmap(app, V);
  else if (V.deskSettings) main = deskSettings(app, V);
  else if (V.deskIntegrations) main = deskIntegrations(app, V);
  else if (V.deskProperties) main = deskProperties(app, V);
  else if (V.deskPropDetail) main = deskPropDetail(app, V);
  else if (V.deskContacts) main = deskContacts(app, V);
  else if (V.deskPerson) main = deskPerson(app, V);
  else if (V.deskTeam) main = deskTeam(app, V);
  else main = deskSoon(app, V);
  const mainWrap = h("main", { style: "flex:1; display:flex; flex-direction:column; min-width:0; overflow:hidden; background:" + T.linen + ";" }, deskTopbar(app, V), main);
  return div({ style: "display:flex; height:100dvh; overflow:hidden; font-family:" + T.body + "; color:" + T.ink + ";" }, deskRail(app, V), mainWrap);
}

window.__desktop = { desktopShell };
})();
