// ============================================================================
// SCREENS + render loop for Bhumi Propcity CRM.
// ============================================================================
(function () {
"use strict";
const { h, div, span, btn } = window.__h;
const { sIcon, fIcon, HOUSE, CHECK, WA_PATH, BACK, CLOSE, PLUS } = window.__ri;
const ActionRail = window.__ActionRail;
const FIRM = window.__FIRM;
const BRAND = window.theme.brand;

const houseThumb = (w, hh, ink) => sIcon(w, hh, ink, 1.6, HOUSE);

// ---- mobile tab bar ----
function tabBar(app) {
  const screen = app.state.screen;
  const ks = ["Home", "Leads", "Properties", "Contacts", "More"];
  const disp = { Home: "Home", Leads: "Leads", Properties: "Stock", Contacts: "People", More: "More" };
  const isActive = k => (k === "Home" && (screen === "home" || screen === "calendar")) || (k === "Leads" && (screen === "inbox" || screen === "lead")) || (k === "Properties" && (screen === "props" || screen === "propDetail")) || (k === "Contacts" && screen === "contacts") || (screen === "soon" && app.state.soonKey === k);
  let idx = ks.findIndex(isActive); if (idx < 0) idx = 0;
  const bar = div({ style: "position:sticky; bottom:0; z-index:10; background:#123B32; box-shadow:0 -6px 20px rgba(12,43,36,.16); padding:10px 10px calc(10px + env(safe-area-inset-bottom));" });
  const rel = div({ style: "position:relative; display:flex;" });
  rel.appendChild(div({ style: "position:absolute; top:-16px; left:0; height:calc(100% + 16px); width:20%; padding:0 3px; transform:translateX(" + (idx * 100) + "%); transition:transform .44s cubic-bezier(.5,.12,.13,1); pointer-events:none;" },
    div({ style: "height:100%; background:#F3F0E8; border-radius:18px 18px 10px 10px; box-shadow:0 -3px 10px rgba(12,43,36,.12);" })));
  ks.forEach(k => {
    const on = isActive(k);
    const c = on ? "#12352C" : "#8FA69B";
    rel.appendChild(btn({ onClick: () => app.goTab(k), style: "flex:1; position:relative; z-index:1; background:transparent; border:none; display:flex; flex-direction:column; align-items:center; gap:4px; padding:9px 0 8px; cursor:pointer;" },
      span({ style: "display:flex; align-items:center; justify-content:center; height:24px; position:relative; transition:transform .3s; transform:" + (on ? "translateY(-1px)" : "none") + ";" },
        sIcon(22, 22, c, 1.9, app.tabIconPath(k))),
      span({ style: "font-size:10px; letter-spacing:.3px; font-weight:" + (on ? 700 : 500) + "; color:" + c + ";" }, disp[k])));
  });
  bar.appendChild(rel);
  return bar;
}

// ---- mobile actions bar (shared by lead/prop/person detail) ----
function actionsBar(app, RAIL) {
  return div({ style: "position:sticky; bottom:0; z-index:8; background:#0C2B24; border-top:1px solid rgba(176,120,43,.3); padding:10px 12px; display:flex; gap:9px; align-items:stretch;" },
    btn({ onClick: RAIL.primary.onClick, style: "flex:1; min-width:0; display:flex; align-items:center; gap:10px; background:#143E34; border:1px solid #0C2B24; border-radius:12px; padding:10px 13px; cursor:pointer; text-align:left;" },
      span({ style: "width:34px; height:34px; border-radius:9px; background:rgba(176,120,43,.18); display:flex; align-items:center; justify-content:center; flex-shrink:0;" },
        sIcon(18, 18, RAIL.primary.iconStroke, 2, '<path d="' + RAIL.primary.iconPath + '"></path>', { fill: RAIL.primary.iconFill })),
      span({ style: "flex:1; min-width:0;" },
        span({ style: "display:block; font-family:'Space Grotesk'; font-weight:600; font-size:14px; color:#F2EFE8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" }, RAIL.primary.label),
        span({ style: "display:block; font-size:11px; color:#9FB6AA; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" }, RAIL.primary.sub))),
    btn({ onClick: () => app.openSheet(), style: "width:62px; flex-shrink:0; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.14); border-radius:12px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; cursor:pointer;" },
      sIcon(20, 20, "#B0782B", 2, '<circle cx="5" cy="12" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="19" cy="12" r="1.6"></circle>'),
      span({ style: "font-size:10px; color:#C9D6CD; font-weight:600;" }, "Actions")));
}

// =====================================================================
// LOGIN
// =====================================================================
function loginScreen(app) {
  const s = app.state;
  const card = div({ style: "background:#F2EFE8; border-radius:16px; padding:24px 22px; box-shadow:0 24px 60px rgba(0,0,0,.35);" });
  if (s.loginPhase === "phone") {
    card.appendChild(div({ style: "font-family:'Space Grotesk'; font-weight:600; font-size:16px; margin-bottom:4px;" }, "Sign in to your desk"));
    card.appendChild(div({ style: "font-size:12.5px; color:#5C665F; margin-bottom:18px;" }, "Enter your mobile number to continue."));
    card.appendChild(div({ style: "font-size:11px; letter-spacing:.5px; text-transform:uppercase; color:#8A938C; margin-bottom:7px;" }, "Mobile number"));
    const inp = h("input", { value: s.loginPhone, onInput: e => app.setLoginPhone(e), placeholder: "98220 41556", style: "flex:1; border:none; outline:none; padding:12px 12px; font-family:inherit; font-size:15px; color:#19211D; background:transparent;" });
    inp.setAttribute("data-focus", "loginPhone");
    card.appendChild(div({ style: "display:flex; align-items:center; gap:0; border:1px solid #D7DCD2; border-radius:10px; overflow:hidden; background:#fff; margin-bottom:18px;" },
      span({ style: "padding:12px 12px; background:#EDE9DE; color:#5C665F; font-family:'Space Grotesk'; font-weight:600; font-size:14px; border-right:1px solid #D7DCD2;" }, "+91"), inp));
  } else {
    card.appendChild(div({ style: "font-family:'Space Grotesk'; font-weight:600; font-size:16px; margin-bottom:4px;" }, "Enter the code"));
    card.appendChild(div({ style: "font-size:12.5px; color:#5C665F; margin-bottom:18px;" }, "We sent a 4-digit code to your number."));
    const row = div({ style: "display:flex; gap:10px; justify-content:center; margin-bottom:12px;" });
    [["4", true], ["2", false], ["1", false], ["7", false]].forEach(([d, on]) =>
      row.appendChild(div({ style: "width:52px; height:58px; border:1.5px solid " + (on ? "#B0782B" : "#D7DCD2") + "; border-radius:10px; display:flex; align-items:center; justify-content:center; font-family:'Space Grotesk'; font-weight:700; font-size:24px; color:#143E34; background:#fff;" }, d)));
    card.appendChild(row);
    card.appendChild(div({ style: "font-size:11.5px; color:#8A938C; text-align:center; margin-bottom:18px;" }, "Demo — any code works."));
  }
  card.appendChild(btn({ onClick: () => app.loginContinue(), style: "width:100%; background:#143E34; color:#F2EFE8; border:none; border-radius:10px; padding:14px; font-family:'Space Grotesk'; font-weight:700; font-size:15px; cursor:pointer;" },
    s.loginPhase === "phone" ? "Continue" : "Verify & enter"));

  const inner = div({ style: "position:relative; width:388px; max-width:100%;" },
    div({ style: "text-align:center; margin-bottom:22px;" },
      div({ style: "width:76px; height:76px; margin:0 auto 16px; border:2px solid #B0782B; border-radius:6px; display:flex; align-items:center; justify-content:center; font-family:'Space Grotesk'; font-weight:700; font-size:30px; color:#B0782B; letter-spacing:1px; box-shadow:inset 0 0 0 1px rgba(176,120,43,.3);" }, BRAND.initials),
      div({ style: "font-family:'Space Grotesk'; font-weight:600; font-size:26px; color:#F2EFE8; letter-spacing:.3px;" }, FIRM),
      div({ style: "font-size:13px; color:#9FB6AA; margin-top:4px;" }, BRAND.city)),
    card,
    div({ style: "text-align:center; font-size:11.5px; color:#7E968A; margin-top:18px;" }, "Your firm's own system · " + FIRM + ", " + BRAND.city));

  return div({ style: "min-height:100dvh; background:#0C2B24; display:flex; align-items:center; justify-content:center; padding:24px; position:relative; overflow:hidden;" },
    div({ style: "position:absolute; font-family:'Space Grotesk'; font-weight:700; font-size:520px; color:rgba(176,120,43,.05); top:50%; left:50%; transform:translate(-50%,-50%); line-height:1; pointer-events:none;" }, BRAND.initials),
    inner);
}

// =====================================================================
// MOBILE: nameplate bar
// =====================================================================
function nameplate(app) {
  const me = app.me;
  return div({ style: "background:#143E34; color:#F2EFE8; padding:14px 18px 13px; display:flex; align-items:center; gap:12px; position:sticky; top:0; z-index:5;" },
    div({ style: "width:38px; height:38px; border:1.4px solid #B0782B; border-radius:3px; display:flex; align-items:center; justify-content:center; font-family:'Space Grotesk'; font-weight:700; font-size:15px; color:#B0782B; letter-spacing:.5px;" }, BRAND.initials),
    div({ style: "flex:1; min-width:0;" },
      div({ style: "font-family:'Space Grotesk'; font-weight:600; font-size:15px; letter-spacing:.2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" }, FIRM),
      div({ style: "font-size:11px; color:#9FB6AA;" }, BRAND.deskLine)),
    notifBell(app, "#F2EFE8"),
    div({ title: me.name, style: "width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:600; color:#fff; background:" + me.color + ";" }, me.initials));
}

// notification bell with unread badge (shared)
function notifBell(app, stroke) {
  const n = app.notifCount();
  const b = btn({ onClick: () => app.openNotif(), title: "Notifications", style: "position:relative; width:34px; height:34px; border-radius:50%; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.14); display:flex; align-items:center; justify-content:center; cursor:pointer;" },
    sIcon(17, 17, stroke, 2, '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'));
  if (n) b.appendChild(span({ style: "position:absolute; top:-3px; right:-3px; min-width:16px; height:16px; padding:0 4px; border-radius:8px; background:#B23A2E; color:#fff; font-size:9px; font-weight:700; display:flex; align-items:center; justify-content:center; box-shadow:0 0 0 2px #143E34;" }, String(n)));
  return b;
}
window.__notifBell = notifBell;

// =====================================================================
// MOBILE: INBOX
// =====================================================================
function inboxScreen(app) {
  const me = app.me, s = app.state;
  let list = app.scopeLeads(s.leads.slice()); // agent sees only their book (+ unassigned new)
  if (s.segment === "New") list = list.filter(l => l.stage === "New");
  else if (s.segment === "Mine") list = list.filter(l => l.agentId === me.id);
  if (s.sourceFilter) list = list.filter(l => l.source === s.sourceFilter);
  list.sort((a, b) => a.minsAgo - b.minsAgo);
  const segStyle = on => "flex:1; border:none; border-radius:6px; padding:8px 0; font-family:'Space Grotesk'; font-weight:600; font-size:13px; cursor:pointer; background:" + (on ? "#143E34" : "transparent") + "; color:" + (on ? "#F2EFE8" : "#5C665F") + ";";
  const scoped = app.scopeLeads(s.leads);
  const segCounts = { All: scoped.length, New: scoped.filter(l => l.stage === "New").length, Mine: scoped.filter(l => l.agentId === me.id).length };
  const overdueCount = scoped.filter(l => l.overdue).length;

  const wrap = div({ style: "display:flex; flex-direction:column; min-height:100dvh;" });
  wrap.appendChild(nameplate(app));

  const seg = div({ style: "display:flex; gap:4px; background:#E7E2D6; border:1px solid #DDD8CB; border-radius:9px; padding:3px; margin-top:14px;" });
  ["All", "New", "Mine"].forEach(x => seg.appendChild(btn({ onClick: () => app.setState({ segment: x }), style: segStyle(s.segment === x) }, x + " (" + segCounts[x] + ")")));
  wrap.appendChild(div({ style: "padding:16px 18px 8px;" },
    div({ style: "display:flex; align-items:baseline; justify-content:space-between;" },
      h("h1", { style: "margin:0; font-family:'Space Grotesk'; font-weight:600; font-size:24px; letter-spacing:.2px;" }, "Leads"),
      div({ style: "font-size:13px; color:#5C665F;" }, scoped.length + " total · ", span({ style: "color:#B23A2E; font-weight:600;" }, overdueCount + " overdue"))),
    seg));

  const chips = div({ style: "display:flex; gap:8px; overflow-x:auto; padding:6px 18px 12px;" });
  [null, "99acres", "MagicBricks", "Walk-in", "Referral", "Website"].forEach(x => {
    const on = s.sourceFilter === x; const col = x ? app.sourceColor(x) : "#143E34";
    chips.appendChild(btn({ onClick: () => app.setState({ sourceFilter: x }), style: "white-space:nowrap; border:1px solid " + (on ? col : "#DDD8CB") + "; background:" + (on ? col : "#fff") + "; color:" + (on ? "#fff" : "#5C665F") + "; border-radius:16px; padding:6px 13px; font-size:12.5px; font-weight:600; cursor:pointer; font-family:inherit;" }, x || "All sources"));
  });
  wrap.appendChild(chips);

  const listWrap = div({ style: "flex:1; padding:2px 14px 96px; display:flex; flex-direction:column; gap:10px;" });
  if (!list.length) {
    listWrap.appendChild(div({ style: "text-align:center; padding:48px 24px; color:#5C665F;" },
      div({ style: "font-family:'Space Grotesk'; font-size:16px; color:#19211D; margin-bottom:6px;" }, "Nothing here yet"),
      div({ style: "font-size:13px;" }, "No leads match this filter — try All, or add one with the button below.")));
  }
  list.forEach(l => {
    const si = app.stageInfo(l.stage); const ag = app.agentById(l.agentId);
    const row = btn({ onClick: () => app.openLead(l.id), style: "text-align:left; width:100%; background:#fff; border:1px solid #E4E0D5; border-left:3px solid " + si.c + "; border-radius:8px; padding:12px 13px; display:flex; flex-direction:column; gap:7px; cursor:pointer; font-family:inherit; color:inherit;" });
    row.appendChild(div({ style: "display:flex; align-items:center; gap:8px;" },
      span({ style: "font-weight:600; font-size:15px; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" }, l.name),
      l.duplicateOf ? span({ style: "font-size:10px; font-weight:600; color:#8A5350; background:#EFE3E2; border-radius:4px; padding:2px 6px;" }, "Possible duplicate") : null,
      span({ style: "font-size:12px; color:" + (l.overdue ? "#B23A2E" : "#8A938C") + "; font-weight:" + (l.overdue ? 600 : 400) + "; white-space:nowrap;" }, app.timeAgo(l.minsAgo))));
    row.appendChild(div({ style: "font-size:13px; color:#3B443E; font-family:'Space Grotesk'; font-weight:500;" }, app.reqLine(l.req)));
    row.appendChild(div({ style: "display:flex; align-items:center; gap:8px; margin-top:1px;" },
      span({ style: "border:1px solid " + app.sourceColor(l.source) + "; color:" + app.sourceColor(l.source) + "; border-radius:4px; padding:2px 8px; font-size:11.5px; font-weight:600;" }, l.source),
      span({ style: "display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:" + si.c + ";" }, span({ style: "width:7px; height:7px; border-radius:50%; background:" + si.c + ";" }), l.stage),
      span({ style: "flex:1;" }),
      ag ? span({ title: ag.name, style: "width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:600; color:#fff; background:" + ag.color + ";" }, ag.initials)
         : span({ style: "font-size:11px; font-weight:600; color:#B0782B; border:1px dashed #C9A96A; border-radius:12px; padding:2px 8px;" }, "Unassigned")));
    listWrap.appendChild(row);
  });
  wrap.appendChild(listWrap);

  wrap.appendChild(btn({ onClick: () => app.openNewLead(), style: "position:absolute; right:18px; bottom:78px; height:48px; padding:0 20px 0 16px; background:#143E34; color:#F2EFE8; border:1px solid #0C2B24; border-radius:26px; display:flex; align-items:center; gap:8px; font-family:'Space Grotesk'; font-weight:600; font-size:14px; cursor:pointer; box-shadow:0 8px 20px rgba(12,43,36,.28);" },
    sIcon(18, 18, "#B0782B", 2.4, '<path d="' + PLUS + '"/>'), "New lead"));
  return wrap;
}

// =====================================================================
// MOBILE: HOME
// =====================================================================
function homeScreen(app) {
  const HM = app.homeData(); const me = app.me;
  const wrap = div({ style: "display:flex; flex-direction:column; min-height:100dvh;" });
  const stats = div({ style: "display:flex; gap:9px; margin-top:16px;" });
  HM.stats.forEach(st => stats.appendChild(div({ style: "flex:1; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.10); border-radius:10px; padding:11px 12px;" },
    div({ style: "font-family:'Space Grotesk'; font-weight:700; font-size:22px;" }, st.value),
    div({ style: "font-size:11px; color:#9FB6AA; margin-top:1px;" }, st.label))));
  wrap.appendChild(div({ style: "background:#143E34; color:#F2EFE8; padding:16px 18px 18px; position:sticky; top:0; z-index:5;" },
    div({ style: "display:flex; align-items:center; gap:12px;" },
      div({ style: "flex:1;" }, div({ style: "font-family:'Space Grotesk'; font-weight:600; font-size:22px;" }, HM.greeting), div({ style: "font-size:12px; color:#9FB6AA; margin-top:2px;" }, HM.dateStr)),
      div({ style: "width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:600; color:#fff; background:" + me.color + ";" }, me.initials)),
    stats));

  const body = div({ style: "flex:1; padding:16px 14px 96px; display:flex; flex-direction:column; gap:14px;" });
  // follow-ups
  const fCol = div({ style: "display:flex; flex-direction:column; gap:9px;" });
  if (HM.noFollow) fCol.appendChild(div({ style: "background:#fff; border:1px dashed #D7DCD2; border-radius:10px; padding:22px; text-align:center; color:#5C665F; font-size:13px;" }, "No follow-ups today — set one from any lead."));
  HM.followups.forEach(f => fCol.appendChild(btn({ onClick: f.onOpen, style: "text-align:left; width:100%; background:#fff; border:1px solid #E4E0D5; border-radius:10px; padding:12px 13px; display:flex; align-items:center; gap:12px; cursor:pointer; font-family:inherit; color:inherit;" },
    span({ style: "width:10px; height:10px; border-radius:50%; flex-shrink:0; background:" + f.dotColor + ";" }),
    div({ style: "flex:1; min-width:0;" }, div({ style: "font-weight:600; font-size:14px;" }, f.name), div({ style: "font-size:12.5px; color:#5C665F; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" }, f.action)),
    div({ style: "text-align:right; flex-shrink:0;" }, div({ style: "font-size:12px; font-weight:600; color:" + f.whenColor + ";" }, f.when), f.isVisit ? span({ style: "font-size:10px; font-weight:600; color:#C79028; background:#F7EFDC; border-radius:4px; padding:1px 7px;" }, "Site visit") : null))));
  body.appendChild(div(null, div({ style: "display:flex; align-items:center; margin:2px 4px 10px;" }, span({ style: "font-family:'Space Grotesk'; font-weight:600; font-size:14px;" }, "Today's follow-ups"), span({ style: "flex:1;" }), btn({ onClick: () => app.goCalendar(), style: "display:inline-flex; align-items:center; gap:5px; font-family:'Space Grotesk'; font-weight:600; font-size:12px; color:#143E34; background:none; border:none; cursor:pointer;" }, sIcon(13, 13, "#B0782B", 2, '<path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>'), "All visits")), fCol));
  // new leads
  const nCol = div({ style: "display:flex; flex-direction:column; gap:9px;" });
  HM.newAssigned.forEach(n => nCol.appendChild(btn({ onClick: n.onOpen, style: "text-align:left; width:100%; background:#fff; border:1px solid #E4E0D5; border-radius:10px; padding:12px 13px; cursor:pointer; font-family:inherit; color:inherit;" },
    div({ style: "display:flex; align-items:center; gap:8px;" }, span({ style: "font-weight:600; font-size:14px; flex:1;" }, n.name), span({ style: "border:1px solid " + n.sourceColor + "; color:" + n.sourceColor + "; border-radius:4px; padding:2px 8px; font-size:11px; font-weight:600;" }, n.source)),
    div({ style: "font-size:12.5px; color:#5C665F; font-family:'Space Grotesk'; margin-top:4px;" }, n.reqLine))));
  body.appendChild(div(null,
    div({ style: "display:flex; align-items:center; gap:8px; margin:2px 4px 10px;" }, span({ style: "font-family:'Space Grotesk'; font-weight:600; font-size:14px;" }, "New leads for you"), HM.newCount ? span({ style: "font-size:11px; font-weight:700; color:#B0782B; background:#F7EFDC; border-radius:10px; padding:1px 8px;" }, HM.newCount) : null),
    nCol));
  wrap.appendChild(body);
  return wrap;
}

// =====================================================================
// MOBILE: LEAD DETAIL
// =====================================================================
function leadScreen(app) {
  const L = app.leadView(app.state.leadId, "mobile");
  const RAIL = app.railForLead(app.state.leadId, "mobile");
  if (!L) return div(null);
  const wrap = div({ style: "display:flex; flex-direction:column; min-height:100dvh; background:#F2EFE8;" });
  // header
  wrap.appendChild(div({ style: "background:#143E34; color:#F2EFE8; padding:12px 14px 16px; position:sticky; top:0; z-index:5;" },
    div({ style: "display:flex; align-items:center; gap:6px;" },
      btn({ onClick: () => app.back(), style: "width:36px; height:36px; display:flex; align-items:center; justify-content:center; background:transparent; border:none; cursor:pointer;" }, sIcon(22, 22, "#F2EFE8", 2.2, '<path d="' + BACK + '"/>')),
      div({ style: "flex:1;" }),
      L.isAssigned ? span({ style: "font-size:12px; color:#9FB6AA;" }, "Assigned · " + L.agentName) : null),
    div({ style: "padding:6px 4px 0;" },
      div({ style: "display:flex; align-items:center; gap:8px;" }, h("h1", { style: "margin:0; font-family:'Space Grotesk'; font-weight:600; font-size:23px;" }, L.name), span({ style: L.sourceChipDark }, L.source)),
      div({ style: "font-size:13px; color:#9FB6AA; margin-top:3px;" }, L.phone + " · added " + L.timeAgo))));

  const body = div({ style: "flex:1; padding:14px 14px 40px; display:flex; flex-direction:column; gap:12px;" });
  if (L.showDup) body.appendChild(div({ style: "background:#EFE3E2; border:1px solid #E1C9C7; border-radius:9px; padding:11px 13px; display:flex; align-items:center; gap:10px;" },
    sIcon(20, 20, "#8A5350", 2, '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>'),
    div({ style: "flex:1; font-size:12.5px; color:#6E403D;" }, "Possible duplicate — same number as a Website lead."),
    btn({ onClick: L.onMerge, style: "font-family:'Space Grotesk'; font-weight:600; font-size:12px; color:#8A5350; background:#fff; border:1px solid #D9B9B7; border-radius:7px; padding:6px 12px; cursor:pointer;" }, "Merge")));

  // stage stepper
  const bars = div({ style: "display:flex; gap:5px;" });
  L.stepper.forEach(st => bars.appendChild(btn({ onClick: st.onClick, title: st.name, style: st.barStyle })));
  body.appendChild(div({ style: "background:#fff; border:1px solid #E4E0D5; border-radius:10px; padding:13px 13px 15px;" },
    div({ style: "font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#8A938C; margin-bottom:11px;" }, "Stage · tap to advance"),
    bars,
    div({ style: "display:flex; align-items:center; justify-content:space-between; margin-top:9px;" },
      span({ style: "display:inline-flex; align-items:center; gap:7px; font-family:'Space Grotesk'; font-weight:600; font-size:15px; color:" + L.stageColor + ";" }, span({ style: "width:9px; height:9px; border-radius:50%; background:" + L.stageColor + ";" }), L.stage),
      span({ style: "font-size:12px; color:#8A938C;" }, L.stageHint))));

  // requirement
  const reqGrid = div({ style: "display:grid; grid-template-columns:1fr 1fr; gap:11px 12px;" });
  [["Budget", L.budget, "#B0782B", "'Space Grotesk'"], ["Config · Deal", L.configDeal], ["Locality", L.locality], ["Timeline", L.reqTimeline]].forEach(([k, v, col, ff]) =>
    reqGrid.appendChild(div(null, div({ style: "font-size:11px; color:#8A938C;" }, k), div({ style: "font-weight:600; font-size:" + (col ? "16px" : "14px") + ";" + (col ? "color:" + col + ";font-family:" + ff + ";" : "") }, v))));
  body.appendChild(div({ style: "background:#fff; border:1px solid #E4E0D5; border-radius:10px; padding:13px;" },
    div({ style: "display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;" }, div({ style: "font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#8A938C;" }, "Requirement"), btn({ onClick: () => app.openEditLead(app.state.leadId), style: "font-size:11px; color:#B0782B; font-weight:600; background:none; border:none; cursor:pointer; font-family:inherit;" }, "Edit")),
    reqGrid,
    div({ style: "margin-top:11px; font-size:12.5px; color:#5C665F; background:#F7F5EE; border-radius:7px; padding:9px 10px;" }, L.notes)));

  // matching
  const matchCard = div({ style: "background:#fff; border:1px solid #E4E0D5; border-radius:10px; padding:13px;" });
  matchCard.appendChild(div({ style: "display:flex; align-items:center; justify-content:space-between;" }, div({ style: "font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#8A938C;" }, "Matching properties"), span({ style: "font-size:12px; color:#5C665F;" }, L.matchCount + " found")));
  if (L.matchesHidden) matchCard.appendChild(btn({ onClick: L.onShowMatches, style: "margin-top:11px; width:100%; background:#143E34; color:#F2EFE8; border:none; border-radius:9px; padding:12px; font-family:'Space Grotesk'; font-weight:600; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:9px;" },
    sIcon(18, 18, "#B0782B", 2.2, HOUSE), "Show " + L.matchCount + " matching properties"));
  if (L.matchesShown) {
    const mc = div({ style: "margin-top:11px; display:flex; flex-direction:column; gap:9px;" });
    L.matches.forEach(m => mc.appendChild(matchRow(app, m)));
    matchCard.appendChild(mc);
  }
  body.appendChild(matchCard);

  // follow-up
  const fu = div({ style: "background:#fff; border:1px solid #E4E0D5; border-radius:10px; padding:13px;" }, div({ style: "font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#8A938C; margin-bottom:10px;" }, "Follow-up"));
  if (L.hasFollowUp) fu.appendChild(div({ style: "display:flex; align-items:center; gap:11px; background:#F7F5EE; border-radius:8px; padding:10px 11px;" },
    div({ style: "width:38px; height:38px; border-radius:8px; background:" + L.followGlow + "; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff;" }, span({ style: "font-size:9px; line-height:1;" }, L.followDay), span({ style: "font-family:'Space Grotesk'; font-weight:700; font-size:13px; line-height:1.2;" }, L.followTimeShort)),
    div({ style: "flex:1;" }, div({ style: "font-weight:600; font-size:13.5px;" }, L.followAction), div({ style: "font-size:12px; color:" + L.followColor + ";" }, L.followWhen))));
  else fu.appendChild(div({ style: "font-size:12.5px; color:#5C665F;" }, "No follow-up yet — set the next action from the Actions bar below."));
  if (L.followSaved) fu.appendChild(div({ style: "margin-top:10px; display:flex; align-items:center; gap:8px; font-size:12.5px; color:#2E7D4E; font-weight:600; animation:riseIn .3s ease both;" }, sIcon(16, 16, "#2E7D4E", 2.6, '<path d="' + CHECK + '"/>'), "Added to " + L.followOwner + "'s Today list"));
  body.appendChild(fu);

  const cl = checklistCard(app, app.state.leadId);
  if (cl) body.appendChild(cl);

  // timeline
  const tl = div({ style: "background:#fff; border:1px solid #E4E0D5; border-radius:10px; padding:13px;" }, div({ style: "font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#8A938C; margin-bottom:13px;" }, "Timeline"));
  const tlCol = div({ style: "display:flex; flex-direction:column;" });
  L.timeline.forEach(t => tlCol.appendChild(div({ style: "display:flex; gap:11px;" },
    div({ style: "display:flex; flex-direction:column; align-items:center;" }, span({ style: "width:11px; height:11px; border-radius:50%; flex-shrink:0; background:" + t.dot + ";" }), span({ style: "width:2px; flex:1; min-height:14px; background:" + t.rail + ";" })),
    div({ style: "padding-bottom:14px;" }, div({ style: "font-size:13px; font-weight:500;" }, t.label), div({ style: "font-size:11.5px; color:#8A938C;" }, t.ago)))));
  tl.appendChild(tlCol);
  tl.appendChild(noteAdder(app, app.state.leadId));
  body.appendChild(tl);
  wrap.appendChild(body);

  wrap.appendChild(actionsBar(app, RAIL));
  return wrap;
}

// shared: add-note / log-call input for a lead timeline
function noteAdder(app, id) {
  const draft = app.state.noteDraft[id] || "";
  const inp = h("input", { value: draft, onInput: e => app.setNoteDraft(id, e.target.value), placeholder: "Add a note or call summary…", style: "flex:1; border:1px solid #E4E0D5; border-radius:8px; padding:9px 10px; font-family:inherit; font-size:12.5px; color:#19211D; background:#fff; outline:none;" });
  inp.setAttribute("data-focus", "note_" + id);
  inp.addEventListener("keydown", e => { if (e.key === "Enter") app.addNote(id, "note"); });
  return div({ style: "margin-top:12px; padding-top:12px; border-top:1px dashed #E7E2D6; display:flex; gap:7px;" },
    inp,
    btn({ onClick: () => app.addNote(id, "note"), style: "font-family:'Space Grotesk'; font-weight:600; font-size:12px; color:#143E34; background:#fff; border:1px solid #C9D3C9; border-radius:8px; padding:0 11px; cursor:pointer;" }, "Add"),
    btn({ onClick: () => app.addNote(id, "call"), title: "Log a call", style: "font-family:'Space Grotesk'; font-weight:600; font-size:12px; color:#1E7F5C; background:#E5F4EC; border:1px solid #BFE3D2; border-radius:8px; padding:0 11px; cursor:pointer;" }, "Log call"));
}
window.__noteAdder = noteAdder;

// shared: post-won handover checklist (shows on Closed Won leads)
function checklistCard(app, id) {
  const l = app.state.leads.find(x => x.id === id); if (!l || l.stage !== "Closed Won") return null;
  const items = app.ensureChecklist(l);
  const done = items.filter(i => i.done).length, total = items.length;
  const pct = Math.round(done / total * 100);
  const card = div({ style: "background:#fff; border:1px solid #E4E0D5; border-radius:10px; padding:13px;" });
  card.appendChild(div({ style: "display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;" },
    div({ style: "font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#8A938C;" }, "Handover checklist"),
    span({ style: "font-size:12px; font-weight:600; color:" + (done === total ? "#2E7D4E" : "#B0782B") + ";" }, done + "/" + total + " done")));
  card.appendChild(div({ style: "height:6px; background:#F2EFE8; border-radius:4px; overflow:hidden; margin-bottom:11px;" }, div({ style: "height:100%; width:" + pct + "%; background:" + (done === total ? "#2E7D4E" : "#B0782B") + "; transition:width .3s;" })));
  const col = div({ style: "display:flex; flex-direction:column; gap:3px;" });
  items.forEach(it => col.appendChild(btn({ onClick: () => app.toggleChecklist(id, it.id), style: "display:flex; align-items:center; gap:10px; width:100%; text-align:left; background:transparent; border:none; padding:8px 4px; cursor:pointer; font-family:inherit;" },
    span({ style: "width:20px; height:20px; border-radius:6px; flex-shrink:0; border:1.5px solid " + (it.done ? "#2E7D4E" : "#C9D3C9") + "; background:" + (it.done ? "#2E7D4E" : "#fff") + "; display:flex; align-items:center; justify-content:center;" }, it.done ? sIcon(12, 12, "#fff", 3, '<path d="' + CHECK + '"/>') : null),
    span({ style: "flex:1; font-size:13px; color:" + (it.done ? "#8A938C" : "#19211D") + "; text-decoration:" + (it.done ? "line-through" : "none") + ";" }, it.label))));
  card.appendChild(col);
  // add custom step
  const draft = app.state.checklistDraft || "";
  const inp = h("input", { value: draft, onInput: e => app.setChecklistDraft(e.target.value), placeholder: "Add a step (owner-defined)…", style: "flex:1; border:1px solid #E4E0D5; border-radius:8px; padding:8px 10px; font-family:inherit; font-size:12.5px; outline:none;" });
  inp.setAttribute("data-focus", "cl_" + id);
  inp.addEventListener("keydown", e => { if (e.key === "Enter") app.addChecklistItem(id, draft); });
  card.appendChild(div({ style: "margin-top:9px; padding-top:11px; border-top:1px dashed #E7E2D6; display:flex; gap:7px;" }, inp,
    btn({ onClick: () => app.addChecklistItem(id, draft), style: "font-family:'Space Grotesk'; font-weight:600; font-size:12px; color:#143E34; background:#fff; border:1px solid #C9D3C9; border-radius:8px; padding:0 12px; cursor:pointer;" }, "Add")));
  if (done === total) card.appendChild(div({ style: "margin-top:10px; display:flex; align-items:center; gap:8px; font-size:12px; color:#2E7D4E; font-weight:600;" }, sIcon(15, 15, "#2E7D4E", 2.6, '<path d="' + CHECK + '"/>'), "All done — client fully handed over."));
  // re-approach reminder (repeat business)
  if (l._reapproach) card.appendChild(div({ style: "margin-top:10px; display:flex; align-items:center; gap:8px; font-size:12px; color:#B0782B; font-weight:600;" }, sIcon(15, 15, "#B0782B", 2, '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'), "Re-approach reminder set — you'll be nudged for repeat business."));
  else card.appendChild(btn({ onClick: () => app.setReapproach(id), style: "margin-top:11px; width:100%; display:flex; align-items:center; justify-content:center; gap:8px; background:#F7EFDC; color:#6E5320; border:1px solid #EADFC2; border-radius:9px; padding:11px; font-family:'Space Grotesk'; font-weight:600; font-size:13px; cursor:pointer;" }, sIcon(15, 15, "#B0782B", 2, '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'), "Set re-approach reminder (repeat business)"));
  return card;
}
window.__checklistCard = checklistCard;

// shared: an explainable match row (fit score + ranked reasons + WhatsApp)
function matchRow(app, m) {
  const scoreColor = m.score >= 80 ? "#2E7D4E" : m.score >= 55 ? "#C79028" : "#8A5350";
  const reasons = div({ style: "display:flex; flex-wrap:wrap; gap:5px; margin-top:6px;" });
  (m.reasons || []).forEach(r => reasons.appendChild(span({ style: "display:inline-flex; align-items:center; gap:4px; font-size:10.5px; font-weight:600; border-radius:10px; padding:2px 7px; color:" + (r.ok ? "#2E7D4E" : "#8A5350") + "; background:" + (r.ok ? "#E2F0E7" : "#EFE3E2") + ";" },
    sIcon(10, 10, r.ok ? "#2E7D4E" : "#8A5350", 3, r.ok ? '<path d="' + CHECK + '"/>' : '<path d="M18 6 6 18M6 6l12 12"/>'), r.t)));
  return div({ style: "display:flex; gap:11px; border:1px solid #E9E5DA; border-radius:9px; padding:9px; animation:riseIn .3s ease both;" },
    div({ style: "width:58px; flex-shrink:0; display:flex; flex-direction:column; align-items:center; gap:5px;" },
      div({ style: "width:58px; height:46px; border-radius:7px; background:" + m.thumbBg + "; display:flex; align-items:center; justify-content:center;" }, houseThumb(24, 24, m.thumbInk)),
      div({ style: "font-family:'Space Grotesk'; font-weight:700; font-size:12px; color:" + scoreColor + ";" }, m.score + "% fit")),
    div({ style: "flex:1; min-width:0;" },
      div({ style: "display:flex; align-items:baseline; justify-content:space-between; gap:8px;" }, span({ style: "font-weight:600; font-size:14px;" }, m.society), span({ style: "font-family:'Space Grotesk'; font-weight:700; font-size:15px; color:#B0782B; white-space:nowrap;" }, m.priceLabel)),
      div({ style: "font-size:12px; color:#5C665F; margin-top:1px;" }, m.line),
      reasons,
      div({ style: "display:flex; align-items:center; gap:7px; margin-top:8px;" }, span({ style: "flex:1;" }),
        btn({ onClick: m.onWhatsapp, style: "display:inline-flex; align-items:center; gap:6px; font-family:'Space Grotesk'; font-weight:600; font-size:12px; color:#1E7F5C; background:#E5F4EC; border:1px solid #BFE3D2; border-radius:8px; padding:6px 11px; cursor:pointer;" }, fIcon(14, 14, "#1E7F5C", '<path d="' + WA_PATH + '"/>'), "WhatsApp"))));
}
window.__matchRow = matchRow;

// =====================================================================
// MOBILE: WHATSAPP GENERATOR (the signature)
// =====================================================================
function whatsappScreen(app) {
  const W = app.waView(); if (!W) return div(null);
  const wrap = div({ style: "display:flex; flex-direction:column; min-height:100dvh; background:#0C2B24;" });
  // header + context
  const langRow = div({ style: "display:flex; gap:5px; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.10); border-radius:9px; padding:3px;" });
  W.langs.forEach(lg => langRow.appendChild(btn({ onClick: lg.onClick, style: lg.style }, lg.label)));
  const toneRow = div({ style: "display:flex; gap:5px; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.10); border-radius:9px; padding:3px; max-width:220px;" });
  W.tones.forEach(tn => toneRow.appendChild(btn({ onClick: tn.onClick, style: tn.style }, tn.label)));

  wrap.appendChild(div({ style: "padding:12px 14px 0; position:sticky; top:0; z-index:5; background:#0C2B24;" },
    div({ style: "display:flex; align-items:center; gap:6px;" }, btn({ onClick: () => app.back(), style: "width:36px; height:36px; display:flex; align-items:center; justify-content:center; background:transparent; border:none; cursor:pointer;" }, sIcon(22, 22, "#F2EFE8", 2.2, '<path d="' + BACK + '"/>')), div({ style: "font-family:'Space Grotesk'; font-weight:600; font-size:16px; color:#F2EFE8;" }, "WhatsApp message")),
    div({ style: "margin:10px 2px 0; background:rgba(255,255,255,.06); border:1px solid rgba(176,120,43,.35); border-radius:10px; padding:11px 12px; display:flex; align-items:center; gap:11px;" },
      div({ style: "width:44px; height:44px; border-radius:8px; background:" + W.thumbBg + "; display:flex; align-items:center; justify-content:center; flex-shrink:0;" }, houseThumb(22, 22, W.thumbInk)),
      div({ style: "flex:1; min-width:0;" }, div({ style: "color:#F2EFE8; font-weight:600; font-size:14px;" }, W.title), div({ style: "color:#9FB6AA; font-size:12px;" }, W.society + " · " + W.deal)),
      div({ style: "font-family:'Space Grotesk'; font-weight:700; font-size:16px; color:#B0782B;" }, W.priceLabel))));

  wrap.appendChild(div({ style: "padding:12px 16px 4px; display:flex; flex-direction:column; gap:9px;" },
    div(null, div({ style: "font-size:10px; letter-spacing:1px; text-transform:uppercase; color:#7E968A; margin-bottom:6px;" }, "Language"), langRow),
    div(null, div({ style: "font-size:10px; letter-spacing:1px; text-transform:uppercase; color:#7E968A; margin-bottom:6px;" }, "Tone"), toneRow)));

  // chat canvas
  const canvas = div({ style: "flex:1; margin-top:10px; background:#0E3329; background-image:radial-gradient(rgba(255,255,255,.03) 1px, transparent 1px); background-size:16px 16px; padding:18px 16px 30px; display:flex; flex-direction:column; justify-content:flex-end; border-top:1px solid rgba(176,120,43,.25);" });
  if (W.composing) canvas.appendChild(composingBubble(W, 86));
  if (W.ready) {
    const bubble = div({ style: "align-self:flex-start; max-width:90%; background:#DCF7E3; border-radius:14px 14px 14px 4px; padding:12px 13px 8px; box-shadow:0 3px 12px rgba(0,0,0,.3); animation:bubbleIn .45s cubic-bezier(.2,.8,.2,1) both;" });
    if (W.editing) { const ta = h("textarea", { onInput: W.onEditChange, style: "width:100%; min-height:230px; border:none; background:transparent; resize:none; font-family:'IBM Plex Sans'; font-size:13.5px; line-height:1.6; color:#0E2C1E; outline:none;" }); ta.value = W.messageRaw; ta.setAttribute("data-focus", "waEdit"); bubble.appendChild(ta); }
    else { const msg = div({ style: "font-family:" + W.msgFont + "; font-size:13.5px; line-height:1.62; color:#0E2C1E; white-space:pre-wrap;" }); msg.innerHTML = W.messageHtml; bubble.appendChild(msg); }
    bubble.appendChild(div({ style: "display:flex; align-items:center; justify-content:flex-end; gap:5px; margin-top:5px; font-size:10px; color:#5C8A6E;" }, W.clock + " ", sIcon(15, 12, "#4FA3C7", 2.4, '<path d="M1 9l5 5L15 4"/><path d="M8 12l1 1L22 4"/>', { viewBox: "0 0 24 18" })));
    canvas.appendChild(bubble);
    canvas.appendChild(div({ style: "align-self:flex-start; margin-top:5px; font-size:11px; color:#7E968A;" }, "Generated for " + W.buyerName + " · not sent yet"));
  }
  wrap.appendChild(canvas);

  if (W.ready) wrap.appendChild(div({ style: "background:#0C2B24; padding:11px 14px calc(11px + env(safe-area-inset-bottom)); display:flex; gap:9px; border-top:1px solid rgba(255,255,255,.08);" },
    btn({ onClick: W.onCopy, style: "flex:1.4; display:flex; align-items:center; justify-content:center; gap:8px; background:#B0782B; color:#0C2B24; border:none; border-radius:10px; padding:13px; font-family:'Space Grotesk'; font-weight:700; font-size:14px; cursor:pointer;" }, sIcon(17, 17, "#0C2B24", 2.2, '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'), W.copyLabel),
    btn({ onClick: W.onRegen, style: "flex:1; display:flex; align-items:center; justify-content:center; gap:7px; background:rgba(255,255,255,.06); color:#F2EFE8; border:1px solid rgba(255,255,255,.14); border-radius:10px; padding:13px; font-family:'Space Grotesk'; font-weight:600; font-size:13px; cursor:pointer;" }, sIcon(16, 16, "#B0782B", 2.2, '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>'), "Regenerate"),
    btn({ onClick: W.onEdit, style: "width:50px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,.06); color:#F2EFE8; border:1px solid rgba(255,255,255,.14); border-radius:10px; cursor:pointer;" }, sIcon(17, 17, "#F2EFE8", 2, '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'))));
  return wrap;
}

function composingBubble(W, maxw) {
  const dots = div({ style: "display:flex; gap:3px; margin-left:2px;" });
  [0, .2, .4].forEach(d => dots.appendChild(span({ style: "width:5px; height:5px; border-radius:50%; background:#B0782B; animation:dotPulse 1.2s infinite " + d + "s;" })));
  const skel = div({ style: "display:flex; flex-direction:column; gap:7px;" });
  [88, 74, 81, 56].forEach(w => skel.appendChild(span({ style: "height:9px; width:" + w + "%; border-radius:5px; background:linear-gradient(90deg,#1B4032 25%,#27543f 37%,#1B4032 63%); background-size:320px 100%; animation:shimmer 1.3s infinite;" })));
  return div({ style: "align-self:flex-start; max-width:" + maxw + "%; background:#12352A; border:1px solid rgba(176,120,43,.4); border-radius:14px 14px 14px 4px; padding:14px 15px; box-shadow:0 4px 16px rgba(0,0,0,.3);" },
    div({ style: "display:flex; align-items:center; gap:9px; margin-bottom:12px;" },
      div({ style: "width:26px; height:26px; border-radius:7px; background:#B0782B; display:flex; align-items:center; justify-content:center; overflow:hidden;" }, sIcon(16, 16, "#0C2B24", 2, '<path d="m12 19 7-7 3 3-7 7-3-3z"/><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/>', { style: "animation:penSweep 1s ease-in-out infinite;" })),
      div({ style: "font-family:'Space Grotesk'; font-weight:600; font-size:13px; color:#F2EFE8;" }, W.status), dots),
    skel);
}

// =====================================================================
// MOBILE: PROPERTIES grid
// =====================================================================
function propsScreen(app) {
  const s = app.state;
  const fchip = on => "white-space:nowrap; border:1px solid " + (on ? "#143E34" : "#DDD8CB") + "; background:" + (on ? "#143E34" : "#fff") + "; color:" + (on ? "#fff" : "#5C665F") + "; border-radius:16px; padding:6px 13px; font-size:12.5px; font-weight:600; cursor:pointer; font-family:inherit;";
  const wrap = div({ style: "display:flex; flex-direction:column; min-height:100dvh;" });
  const me = app.me;
  wrap.appendChild(div({ style: "background:#143E34; color:#F2EFE8; padding:14px 18px 13px; position:sticky; top:0; z-index:5; display:flex; align-items:center; gap:12px;" },
    div({ style: "flex:1;" }, div({ style: "font-family:'Space Grotesk'; font-weight:600; font-size:20px;" }, "Properties"), div({ style: "font-size:11px; color:#9FB6AA;" }, app._d.properties.length + " listings")),
    div({ style: "width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:600; color:#fff; background:" + me.color + ";" }, me.initials)));
  const tRow = div({ style: "display:flex; gap:8px; overflow-x:auto; padding:12px 16px 4px;" });
  ["All", "1BHK", "2BHK", "3BHK", "Commercial", "Plot"].forEach(t => tRow.appendChild(btn({ onClick: () => app.setState({ propType: t }), style: fchip(s.propType === t) }, t)));
  const sRow = div({ style: "display:flex; gap:8px; overflow-x:auto; padding:6px 16px 10px;" });
  ["All", "Available", "Under offer", "Closed"].forEach(t => sRow.appendChild(btn({ onClick: () => app.setState({ propStatus: t }), style: fchip(s.propStatus === t) }, t)));
  wrap.appendChild(tRow); wrap.appendChild(sRow);

  const grid = div({ style: "flex:1; padding:2px 14px 96px; display:grid; grid-template-columns:1fr 1fr; gap:12px; align-content:start;" });
  app.propertiesList().map(p => app.propCard(p, "mobile")).forEach(c => grid.appendChild(propCardEl(c, 88, 34)));
  wrap.appendChild(grid);
  wrap.appendChild(btn({ onClick: () => app.setState({ addPropOpen: true }), style: "position:absolute; right:18px; bottom:78px; height:48px; padding:0 20px 0 16px; background:#143E34; color:#F2EFE8; border:1px solid #0C2B24; border-radius:26px; display:flex; align-items:center; gap:8px; font-family:'Space Grotesk'; font-weight:600; font-size:14px; cursor:pointer; box-shadow:0 8px 20px rgba(12,43,36,.28);" }, sIcon(18, 18, "#B0782B", 2.4, '<path d="' + PLUS + '"/>'), "Add property"));
  return wrap;
}
function propCardEl(c, thumbH, glyph) {
  const thumb = div({ style: "height:" + thumbH + "px; background:" + c.thumbBg + "; display:flex; align-items:center; justify-content:center; position:relative;" }, houseThumb(glyph, glyph, c.thumbInk), span({ style: "position:absolute; top:8px; left:8px; background:" + c.statusColor + "; color:#fff; border-radius:4px; padding:2px 8px; font-size:10px; font-weight:600;" }, c.status));
  if (c.isNew) thumb.appendChild(span({ style: "position:absolute; top:8px; right:8px; background:#B0782B; color:#0C2B24; border-radius:4px; padding:2px 8px; font-size:10px; font-weight:700;" }, "NEW"));
  return btn({ onClick: c.onOpen, style: "text-align:left; background:#fff; border:1px solid " + c.newBorder + "; border-radius:10px; overflow:hidden; cursor:pointer; font-family:inherit; color:inherit; padding:0; display:flex; flex-direction:column;" },
    thumb,
    div({ style: "padding:10px 11px 12px;" },
      div({ style: "font-weight:600; font-size:13.5px;" }, c.society),
      div({ style: "font-size:11.5px; color:#8A938C;" }, c.title),
      div({ style: "display:flex; align-items:baseline; justify-content:space-between; margin-top:7px;" }, span({ style: "font-family:'Space Grotesk'; font-weight:700; font-size:16px; color:#B0782B;" }, c.priceLabel), span({ style: "font-size:11px; color:#8A938C;" }, c.area)),
      div({ style: "font-size:11px; color:#8A938C; margin-top:4px;" }, "Owner · " + c.owner)));
}

// =====================================================================
// MOBILE: PROPERTY DETAIL
// =====================================================================
function propDetailScreen(app) {
  const PV = app.propertyView(app.state.propDetailId, "mobile");
  const RAIL = app.railForProperty(app.state.propDetailId, "mobile");
  if (!PV) return div(null);
  const wrap = div({ style: "display:flex; flex-direction:column; min-height:100dvh; background:#F2EFE8;" });
  wrap.appendChild(div({ style: "background:" + PV.thumbBg + "; padding:12px 14px 20px; position:sticky; top:0; z-index:5;" },
    btn({ onClick: PV.onBack, style: "width:36px; height:36px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,.7); border:none; border-radius:50%; cursor:pointer;" }, sIcon(20, 20, "#19211D", 2.2, '<path d="' + BACK + '"/>')),
    div({ style: "display:flex; justify-content:center; margin:8px 0;" }, houseThumb(56, 56, PV.thumbInk))));
  const body = div({ style: "flex:1; padding:16px 14px 40px; display:flex; flex-direction:column; gap:12px;" });
  body.appendChild(div(null, div({ style: "display:flex; align-items:baseline; justify-content:space-between; gap:10px;" },
    div(null, div({ style: "font-family:'Space Grotesk'; font-weight:600; font-size:20px;" }, PV.society), div({ style: "font-size:13px; color:#5C665F;" }, PV.title + " · " + PV.deal)),
    div({ style: "font-family:'Space Grotesk'; font-weight:700; font-size:22px; color:#B0782B; white-space:nowrap;" }, PV.priceLabel))));
  body.appendChild(div({ style: "display:flex; align-items:center; gap:9px; flex-wrap:wrap;" },
    span({ style: "display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:" + PV.statusColor + "; background:" + PV.statusTint + "; border-radius:14px; padding:4px 11px;" }, span({ style: "width:7px; height:7px; border-radius:50%; background:" + PV.statusColor + ";" }), PV.status),
    span({ style: "font-size:12px; color:#8A938C;" }, PV.locality + " · Owner " + PV.owner)));
  const specGrid = div({ style: "display:grid; grid-template-columns:1fr 1fr; gap:11px 12px;" });
  PV.spec.forEach(sp => specGrid.appendChild(div(null, div({ style: "font-size:11px; color:#8A938C;" }, sp.k), div({ style: "font-weight:600; font-size:13.5px;" }, sp.v))));
  body.appendChild(div({ style: "background:#fff; border:1px solid #E4E0D5; border-radius:10px; padding:13px;" }, div({ style: "font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#8A938C; margin-bottom:11px;" }, "Spec sheet"), specGrid));
  // interested
  const bCard = div({ style: "background:#fff; border:1px solid #E4E0D5; border-radius:10px; padding:13px;" }, div({ style: "display:flex; align-items:center; justify-content:space-between; margin-bottom:11px;" }, div({ style: "font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#8A938C;" }, "Interested buyers"), span({ style: "font-size:12px; color:#5C665F;" }, PV.interestedCount + " match")));
  const bCol = div({ style: "display:flex; flex-direction:column; gap:9px;" });
  if (PV.noBuyers) bCol.appendChild(div({ style: "font-size:12.5px; color:#5C665F; padding:6px 0;" }, "No matching buyers yet — add or update a lead's requirement."));
  PV.interested.forEach(b => bCol.appendChild(btn({ onClick: b.onOpen, style: "text-align:left; width:100%; background:#F7F5EE; border:1px solid #EEEBE3; border-radius:9px; padding:10px 11px; cursor:pointer; font-family:inherit; color:inherit;" },
    div({ style: "display:flex; align-items:center; gap:8px;" }, span({ style: "font-weight:600; font-size:13.5px; flex:1;" }, b.name), span({ style: "display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:600; color:#2E7D4E; background:#E2F0E7; border-radius:10px; padding:2px 8px;" }, sIcon(11, 11, "#2E7D4E", 3, '<path d="' + CHECK + '"/>'), b.fit)),
    div({ style: "font-size:12px; color:#5C665F; font-family:'Space Grotesk'; margin-top:4px;" }, b.req))));
  bCard.appendChild(bCol); body.appendChild(bCard);
  wrap.appendChild(body);
  wrap.appendChild(actionsBar(app, RAIL));
  return wrap;
}

// =====================================================================
// MOBILE: CONTACTS
// =====================================================================
function contactsScreen(app) {
  const data = app.contactsData(); const tab = app.state.contactsTab;
  const tchip = on => "flex:1; border:none; border-radius:7px; padding:8px 0; font-family:'Space Grotesk'; font-weight:600; font-size:12.5px; cursor:pointer; background:" + (on ? "#143E34" : "transparent") + "; color:" + (on ? "#F2EFE8" : "#5C665F") + ";";
  const wrap = div({ style: "display:flex; flex-direction:column; min-height:100dvh;" });
  wrap.appendChild(div({ style: "background:#143E34; color:#F2EFE8; padding:14px 18px 13px; position:sticky; top:0; z-index:5; display:flex; align-items:center; gap:12px;" },
    div({ style: "flex:1;" }, div({ style: "font-family:'Space Grotesk'; font-weight:600; font-size:20px;" }, "Contacts"), div({ style: "font-size:11px; color:#9FB6AA;" }, "Buy side & sell side, kept separate")),
    btn({ onClick: () => app.openNewContact(), style: "display:inline-flex; align-items:center; gap:6px; background:rgba(176,120,43,.18); color:#F2EFE8; border:1px solid rgba(176,120,43,.4); border-radius:8px; padding:8px 12px; font-family:'Space Grotesk'; font-weight:600; font-size:12.5px; cursor:pointer;" }, sIcon(14, 14, "#B0782B", 2.4, '<path d="' + PLUS + '"/>'), "New")));
  const tabs = div({ style: "padding:12px 16px 8px; display:flex; gap:4px; background:#EDE9DE; border-bottom:1px solid #E4E0D5; overflow-x:auto;" });
  ["Buyers", "Sellers", "Tenants", "Landlords"].forEach(t => tabs.appendChild(btn({ onClick: () => app.setState({ contactsTab: t, contactSel: null }), style: tchip(tab === t) }, t + " (" + data[t].length + ")")));
  wrap.appendChild(tabs);
  const list = div({ style: "flex:1; padding:12px 14px 96px; display:flex; flex-direction:column; gap:9px;" });
  data[tab].forEach(r => {
    const rowWrap = div({ style: "background:#fff; border:1px solid #E4E0D5; border-radius:10px; overflow:hidden;" });
    rowWrap.appendChild(btn({ onClick: () => r.expandable ? app.setState(st => ({ contactSel: st.contactSel === r.name ? null : r.name })) : r.onOpen(), style: "text-align:left; width:100%; padding:12px 13px; display:flex; align-items:center; gap:11px; cursor:pointer; font-family:inherit; color:inherit; background:transparent; border:none;" },
      span({ style: "width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:600; color:#143E34; background:#E7E2D6;" }, r.initials),
      div({ style: "flex:1; min-width:0;" }, div({ style: "font-weight:600; font-size:14px;" }, r.name), div({ style: "font-size:12.5px; color:#5C665F; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" }, r.context)),
      r.stage ? span({ style: "display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:600; color:" + r.stageColor + ";" }, span({ style: "width:6px; height:6px; border-radius:50%; background:" + r.stageColor + ";" }), r.stage) : null,
      r.expandable ? sIcon(18, 18, "#B0782B", 2, '<path d="M9 18l6-6-6-6"/>') : null));
    if (r.expandable && app.state.contactSel === r.name) {
      const sub = div({ style: "border-top:1px solid #EEEBE3; padding:8px; display:flex; flex-direction:column; gap:7px; background:#FBFAF6;" });
      r.properties.forEach(p => sub.appendChild(btn({ onClick: p.onOpen, style: "text-align:left; width:100%; display:flex; align-items:center; gap:10px; background:#fff; border:1px solid #E9E5DA; border-radius:8px; padding:9px 10px; cursor:pointer; font-family:inherit; color:inherit;" },
        div({ style: "flex:1; min-width:0;" }, div({ style: "font-weight:600; font-size:13px;" }, p.title), div({ style: "font-size:11.5px; color:#5C665F;" }, p.sub)),
        span({ style: "background:" + p.statusColor + "; color:#fff; border-radius:3px; padding:2px 7px; font-size:10px; font-weight:600;" }, p.status))));
      rowWrap.appendChild(sub);
    }
    list.appendChild(rowWrap);
  });
  wrap.appendChild(list);
  return wrap;
}

// =====================================================================
// MOBILE: PERSON DETAIL
// =====================================================================
function personScreen(app) {
  const P = app.personView(app.state.personId, "mobile");
  const RAIL = app.railForPerson(app.state.personId, "mobile");
  if (!P) return div(null);
  const wrap = div({ style: "display:flex; flex-direction:column; min-height:100dvh; background:#F2EFE8;" });
  wrap.appendChild(div({ style: "background:#143E34; color:#F2EFE8; padding:12px 14px 18px; position:sticky; top:0; z-index:5;" },
    btn({ onClick: P.onBack, style: "width:36px; height:36px; display:flex; align-items:center; justify-content:center; background:transparent; border:none; cursor:pointer;" }, sIcon(22, 22, "#F2EFE8", 2.2, '<path d="' + BACK + '"/>')),
    div({ style: "display:flex; align-items:center; gap:13px; padding:8px 4px 0;" },
      span({ style: "width:52px; height:52px; border-radius:50%; background:#B0782B; color:#0C2B24; display:flex; align-items:center; justify-content:center; font-family:'Space Grotesk'; font-weight:700; font-size:18px; flex-shrink:0;" }, P.initials),
      div({ style: "flex:1; min-width:0;" }, h("h1", { style: "margin:0; font-family:'Space Grotesk'; font-weight:600; font-size:22px;" }, P.name), div({ style: "font-size:12.5px; color:#9FB6AA; margin-top:2px;" }, h("b", { style: "color:#C9A96A; font-weight:600;" }, P.role), " · " + P.phone)))));
  const body = div({ style: "flex:1; padding:14px 14px 40px; display:flex; flex-direction:column; gap:12px;" });
  const statsG = div({ style: "display:grid; grid-template-columns:1fr 1fr 1fr; gap:9px;" });
  P.stats.forEach(st => statsG.appendChild(div({ style: "background:#fff; border:1px solid #E4E0D5; border-radius:10px; padding:12px 11px;" }, div({ style: "font-family:'Space Grotesk'; font-weight:700; font-size:17px; color:#143E34;" }, st.v), div({ style: "font-size:11px; color:#8A938C; margin-top:2px;" }, st.k))));
  body.appendChild(statsG);
  const lCard = div({ style: "background:#fff; border:1px solid #E4E0D5; border-radius:10px; padding:13px;" }, div({ style: "display:flex; align-items:center; justify-content:space-between; margin-bottom:11px;" }, div({ style: "font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#8A938C;" }, "Listings from this owner"), span({ style: "font-size:12px; color:#5C665F;" }, P.metaLine)));
  const lCol = div({ style: "display:flex; flex-direction:column; gap:9px;" });
  P.listings.forEach(p => lCol.appendChild(btn({ onClick: p.onOpen, style: "text-align:left; display:flex; gap:11px; border:1px solid #E9E5DA; border-radius:9px; padding:9px; cursor:pointer; font-family:inherit; color:inherit; background:#fff;" },
    div({ style: "width:54px; height:54px; border-radius:7px; flex-shrink:0; background:" + p.thumbBg + "; display:flex; align-items:center; justify-content:center;" }, houseThumb(24, 24, p.thumbInk)),
    div({ style: "flex:1; min-width:0;" },
      div({ style: "display:flex; align-items:baseline; justify-content:space-between; gap:8px;" }, span({ style: "font-weight:600; font-size:14px;" }, p.society), span({ style: "font-family:'Space Grotesk'; font-weight:700; font-size:14px; color:#B0782B; white-space:nowrap;" }, p.priceLabel)),
      div({ style: "font-size:12px; color:#5C665F; margin-top:1px;" }, p.line),
      span({ style: "display:inline-block; margin-top:6px; font-size:10px; font-weight:600; color:" + p.statusColor + "; background:" + p.statusTint + "; border-radius:4px; padding:2px 8px;" }, p.status)))));
  lCard.appendChild(lCol); body.appendChild(lCard);
  wrap.appendChild(body);
  wrap.appendChild(actionsBar(app, RAIL));
  return wrap;
}

// =====================================================================
// MOBILE: SOON placeholder
// =====================================================================
function soonScreen(app) {
  const title = app.state.soonKey || "Home";
  return div({ style: "display:flex; flex-direction:column; min-height:100dvh;" },
    div({ style: "background:#143E34; color:#F2EFE8; padding:14px 18px; font-family:'Space Grotesk'; font-weight:600; font-size:16px;" }, title),
    div({ style: "flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:40px 34px 120px; text-align:center; gap:14px;" },
      div({ style: "width:66px; height:66px; border-radius:16px; background:#E7E2D6; border:1px solid #D7DCD2; display:flex; align-items:center; justify-content:center;" }, sIcon(30, 30, "#143E34", 1.7, HOUSE)),
      div({ style: "font-family:'Space Grotesk'; font-weight:600; font-size:18px;" }, title),
      div({ style: "font-size:13.5px; color:#5C665F; line-height:1.55; max-width:280px;" }, "This screen is part of the full build. In this demo we're walking the lead → match → WhatsApp path — tap ", h("b", { style: "color:#143E34;" }, "Leads"), " to continue."),
      btn({ onClick: () => app.goTab("Leads"), style: "margin-top:4px; font-family:'Space Grotesk'; font-weight:600; font-size:14px; color:#F2EFE8; background:#143E34; border:none; border-radius:9px; padding:11px 20px; cursor:pointer;" }, "Go to Leads")));
}

// =====================================================================
// SITE-VISIT CALENDAR / AGENDA (shared body, used mobile + desktop)
// =====================================================================
function calendarBody(app, opts) {
  opts = opts || {};
  const agenda = app.visitAgenda();
  const wrap = div({ style: opts.desktop ? "flex:1; overflow-y:auto; padding:24px 28px 40px;" : "flex:1; padding:12px 14px 96px; display:flex; flex-direction:column; gap:14px;" });
  const inner = opts.desktop ? div({ style: "max-width:720px; display:flex; flex-direction:column; gap:14px;" }) : wrap;
  if (opts.desktop) wrap.appendChild(inner);
  if (!agenda.length) inner.appendChild(div({ style: "background:#fff; border:1px dashed #D7DCD2; border-radius:12px; padding:30px; text-align:center; color:#5C665F; font-size:13px;" }, "No visits or follow-ups scheduled — set one from any lead."));
  agenda.forEach(day => {
    const dayCard = div({ style: "background:#fff; border:1px solid #E4E0D5; border-radius:12px; overflow:hidden;" });
    dayCard.appendChild(div({ style: "display:flex; align-items:center; gap:9px; padding:12px 15px; background:" + (day.overdue ? "#FBF1EF" : "#F7F5EE") + "; border-bottom:1px solid #EEEBE3;" },
      sIcon(15, 15, day.overdue ? "#B23A2E" : "#143E34", 2, '<path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>'),
      span({ style: "font-family:'Space Grotesk'; font-weight:600; font-size:14px; color:" + (day.overdue ? "#B23A2E" : "#19211D") + ";" }, day.day),
      span({ style: "flex:1;" }),
      span({ style: "font-size:11.5px; color:#8A938C;" }, day.items.length + (day.items.length > 1 ? " items" : " item"))));
    day.items.forEach(it => dayCard.appendChild(btn({ onClick: it.onOpen, style: "text-align:left; width:100%; display:flex; align-items:center; gap:12px; padding:12px 15px; border:none; border-bottom:1px solid #F4F1EA; background:#fff; cursor:pointer; font-family:inherit; color:inherit;" },
      div({ style: "width:52px; text-align:center; flex-shrink:0;" }, div({ style: "font-family:'Space Grotesk'; font-weight:700; font-size:13px; color:#143E34;" }, it.time || "—")),
      span({ style: "width:9px; height:9px; border-radius:50%; flex-shrink:0; background:" + it.dot + ";" }),
      div({ style: "flex:1; min-width:0;" }, div({ style: "font-weight:600; font-size:13.5px;" }, it.name), div({ style: "font-size:12px; color:#5C665F; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" }, it.action)),
      it.isVisit ? span({ style: "font-size:10px; font-weight:600; color:#C79028; background:#F7EFDC; border-radius:4px; padding:2px 7px; flex-shrink:0;" }, "Site visit") : null,
      it.agentInitials ? span({ style: "width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:600; color:#fff; flex-shrink:0; background:" + it.agentColor + ";" }, it.agentInitials) : null)));
    inner.appendChild(dayCard);
  });
  return wrap;
}

function calendarScreen(app) {
  const wrap = div({ style: "display:flex; flex-direction:column; min-height:100dvh;" });
  wrap.appendChild(div({ style: "background:#143E34; color:#F2EFE8; padding:14px 18px 13px; position:sticky; top:0; z-index:5; display:flex; align-items:center; gap:12px;" },
    div({ style: "flex:1;" }, div({ style: "font-family:'Space Grotesk'; font-weight:600; font-size:20px;" }, "Site visits"), div({ style: "font-size:11px; color:#9FB6AA;" }, "Your day, in order")),
    notifBell(app, "#F2EFE8")));
  wrap.appendChild(calendarBody(app, { desktop: false }));
  return wrap;
}

window.__screens = { loginScreen, inboxScreen, homeScreen, leadScreen, whatsappScreen, propsScreen, propDetailScreen, contactsScreen, personScreen, soonScreen, calendarScreen, calendarBody, tabBar, propCardEl, composingBubble, houseThumb, notifBell };
})();
