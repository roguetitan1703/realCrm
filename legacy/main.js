// ============================================================================
// Modals + WhatsApp modal + mount/render loop for Bhumi Propcity CRM.
// ============================================================================
(function () {
"use strict";
const { h, div, span, btn } = window.__h;
const { sIcon, fIcon, HOUSE, CHECK, WA_PATH, BACK, CLOSE, PLUS } = window.__ri;
const FIRM = window.__FIRM;
const S = window.__screens;
const composingBubble = S.composingBubble;
const houseThumb = S.houseThumb;

function overlay(onOverlay, inner, extraStyle) {
  const o = div({ style: "position:fixed; inset:0; background:rgba(12,43,36,.5); z-index:50; display:flex; align-items:center; justify-content:center; padding:20px;" + (extraStyle || ""), onClick: onOverlay });
  o.appendChild(inner);
  return o;
}
function closeX(onClose) {
  return btn({ onClick: onClose, style: "background:transparent; border:none; cursor:pointer;" }, sIcon(20, 20, "#8A938C", 2.2, '<path d="' + CLOSE + '"/>'));
}

// ---- New-lead sheet (mobile) ----
function newLeadSheet(app) {
  const inner = div({ style: "width:100%; background:#F2EFE8; border-radius:16px 16px 0 0; padding:18px 18px calc(20px + env(safe-area-inset-bottom)); animation:riseIn .25s ease both;" },
    div({ style: "width:38px; height:4px; border-radius:2px; background:#D7DCD2; margin:0 auto 14px;" }),
    div({ style: "font-family:'Space Grotesk'; font-weight:600; font-size:18px; margin-bottom:4px;" }, "New lead"),
    div({ style: "font-size:13px; color:#5C665F; margin-bottom:14px;" }, "Captured in seconds — auto-composes the requirement line and routes by round-robin."),
    div({ style: "display:flex; flex-direction:column; gap:9px;" },
      div({ style: "background:#fff; border:1px solid #E4E0D5; border-radius:9px; padding:11px 12px; color:#8A938C; font-size:13px;" }, "Name"),
      div({ style: "background:#fff; border:1px solid #E4E0D5; border-radius:9px; padding:11px 12px; color:#8A938C; font-size:13px;" }, "Phone number"),
      div({ style: "background:#fff; border:1px solid #E4E0D5; border-radius:9px; padding:11px 12px; color:#8A938C; font-size:13px;" }, "Requirement · 2BHK · Wakad · ₹75–85L")),
    btn({ onClick: () => app.setState({ sheetOpen: false }), style: "margin-top:14px; width:100%; background:#143E34; color:#F2EFE8; border:none; border-radius:10px; padding:13px; font-family:'Space Grotesk'; font-weight:600; font-size:14px; cursor:pointer;" }, "Save lead"));
  return div({ onClick: () => app.setState({ sheetOpen: false }), style: "position:absolute; inset:0; background:rgba(12,43,36,.45); z-index:20; display:flex; align-items:flex-end;" }, inner);
}

// ---- Actions sheet (mobile) — imports ActionRail ----
function actionsSheet(app, RAIL) {
  const inner = div({ style: "background:#F2EFE8; border-radius:20px 20px 0 0; padding:14px 16px 22px; max-height:84vh; overflow-y:auto; box-shadow:0 -20px 50px rgba(0,0,0,.3); animation:sheetUp .32s cubic-bezier(.22,1,.36,1) both;" },
    div({ style: "width:40px; height:4px; border-radius:2px; background:#D8D2C4; margin:0 auto 14px;" }),
    window.__ActionRail(RAIL));
  return div({ onClick: (e) => { if (e.target === e.currentTarget) app.closeSheet(); }, style: "position:fixed; inset:0; background:rgba(12,43,36,.5); z-index:40; display:flex; flex-direction:column; justify-content:flex-end;" }, inner);
}

// ---- Call & SMS panel (standalone modal) ----
function callModal(app, C) {
  const body = div({ style: "padding:16px 18px 18px;" });
  if (C.isCall) {
    body.appendChild(div({ style: "background:#fff; border:1px solid #E4E0D5; border-radius:12px; padding:20px 16px; display:flex; align-items:center; justify-content:center; gap:14px; margin-bottom:14px;" },
      div({ style: "text-align:center;" }, div({ style: "width:46px; height:46px; border-radius:50%; margin:0 auto; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:600; color:#fff; background:" + C.agentColor + ";" }, C.agentInitials), div({ style: "font-size:11px; color:#8A938C; margin-top:5px;" }, "You")),
      div({ style: "flex:1; max-width:90px; height:2px; background:repeating-linear-gradient(90deg,#C9D3C9 0 6px,transparent 6px 12px); position:relative;" }, fIcon(18, 18, "#1E7F5C", '<path d="M6.6 10.8a15.9 15.9 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11.4 11.4 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.24.2 2.45.6 3.6a1 1 0 0 1-.25 1z"/>', { style: "position:absolute; top:-9px; left:50%; transform:translateX(-50%); background:#fff;" })),
      div({ style: "text-align:center;" }, div({ style: "width:46px; height:46px; border-radius:50%; margin:0 auto; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:600; color:#143E34; background:#E7E2D6;" }, C.initials), div({ style: "font-size:11px; color:#8A938C; margin-top:5px;" }, C.name))));
    body.appendChild(btn({ style: "width:100%; background:#1E7F5C; color:#fff; border:none; border-radius:10px; padding:14px; font-family:'Space Grotesk'; font-weight:700; font-size:15px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:9px;" }, fIcon(18, 18, "#fff", '<path d="M6.6 10.8a15.9 15.9 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11.4 11.4 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.24.2 2.45.6 3.6a1 1 0 0 1-.25 1z"/>'), "Call " + C.name));
    body.appendChild(div({ style: "font-size:12px; color:#5C665F; text-align:center; margin-top:9px;" }, "Calls auto-log to this lead's timeline."));
  } else {
    body.appendChild(div({ style: "font-size:11px; letter-spacing:.5px; text-transform:uppercase; color:#8A938C; margin-bottom:9px;" }, "Quick SMS templates"));
    const col = div({ style: "display:flex; flex-direction:column; gap:8px;" });
    C.smsTemplates.forEach(t => col.appendChild(div({ style: "background:#fff; border:1px solid #E4E0D5; border-radius:9px; padding:11px 12px; font-size:12.5px; color:#3B443E; line-height:1.5; display:flex; gap:10px; align-items:flex-start;" }, sIcon(16, 16, "#3A7CA5", 2, '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', { style: "flex-shrink:0; margin-top:1px;" }), span({ style: "flex:1;" }, t))));
    body.appendChild(col);
  }
  body.appendChild(div({ style: "margin-top:14px; background:#F7EFDC; border:1px solid #EADFC2; border-radius:9px; padding:11px 13px; display:flex; gap:10px; align-items:flex-start;" }, sIcon(17, 17, "#B0782B", 2, '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>', { style: "flex-shrink:0; margin-top:1px;" }), div({ style: "font-size:12px; color:#6E5320; line-height:1.5;" }, h("b", null, "Connects to your telephony account."), " Click-to-call & SMS switch on when you add your number — nothing to install here.")));

  const tabRow = div({ style: "display:flex; gap:5px; background:#E7E2D6; border:1px solid #DDD8CB; border-radius:9px; padding:3px; width:100%;" }, btn({ onClick: C.onCall, style: C.callStyle }, "Call"), btn({ onClick: C.onSms, style: C.smsStyle }, "SMS"));
  const inner = div({ style: "width:400px; max-width:100%; background:#F2EFE8; border-radius:16px; box-shadow:0 30px 80px rgba(0,0,0,.35); overflow:hidden;" },
    div({ style: "padding:16px 18px 12px; display:flex; align-items:center;" }, div({ style: "flex:1;" }, div({ style: "font-family:'Space Grotesk'; font-weight:600; font-size:16px;" }, "Call & SMS"), div({ style: "font-size:12.5px; color:#5C665F;" }, C.name + " · " + C.phone)), closeX(C.onClose)),
    div({ style: "padding:0 18px; display:flex; gap:5px;" }, tabRow),
    body);
  return overlay(C.onOverlay, inner);
}

// ---- Integration detail modal ----
function intgModal(app, I) {
  const bullets = div({ style: "display:flex; flex-direction:column; gap:8px; margin-bottom:16px;" });
  I.bullets.forEach(b => bullets.appendChild(div({ style: "display:flex; gap:10px; align-items:center; font-size:13px; color:#3B443E;" }, sIcon(16, 16, "#2E7D4E", 2.6, '<path d="' + CHECK + '"/>', { style: "flex-shrink:0;" }), b)));
  const inner = div({ style: "width:440px; max-width:100%; background:#F2EFE8; border-radius:16px; box-shadow:0 30px 80px rgba(0,0,0,.35); overflow:hidden;" },
    div({ style: "padding:18px 20px 14px; display:flex; align-items:center; gap:12px;" }, div({ style: "width:44px; height:44px; border-radius:10px; background:" + I.tint + "; display:flex; align-items:center; justify-content:center; font-family:'Space Grotesk'; font-weight:700; font-size:16px; color:" + I.color + ";" }, I.mark), div({ style: "flex:1;" }, div({ style: "font-family:'Space Grotesk'; font-weight:600; font-size:17px;" }, I.name), div({ style: "font-size:12px; color:#5C665F;" }, I.desc)), closeX(I.onClose)),
    div({ style: "padding:0 20px 20px;" },
      div({ style: "font-size:13px; color:#3B443E; line-height:1.55; margin-bottom:15px;" }, I.long),
      div({ style: "font-size:11px; letter-spacing:.5px; text-transform:uppercase; color:#8A938C; margin-bottom:9px;" }, "What you get"),
      bullets,
      I.custom ? div({ style: "background:#EBEEEC; border:1px solid #D7DCD2; border-radius:9px; padding:11px 13px; font-size:12px; color:#4C554F; line-height:1.5; margin-bottom:14px;" }, h("b", null, "Custom add-on."), " Scoped once we see your current site — priced separately from the core platform.") : null,
      div({ style: "background:#F7EFDC; border:1px solid #EADFC2; border-radius:9px; padding:11px 13px; font-size:12px; color:#6E5320; line-height:1.5; margin-bottom:16px;" }, h("b", null, "Not live in this demo."), " You'll authorise with your own account on setup — no data leaves your system until you connect it."),
      btn({ style: "width:100%; background:#143E34; color:#F2EFE8; border:none; border-radius:10px; padding:13px; font-family:'Space Grotesk'; font-weight:700; font-size:14px; cursor:pointer;" }, I.cta)));
  return overlay(I.onOverlay, inner);
}

// ---- Reassign modal ----
function reassignModal(app, RA) {
  const body = div({ style: "padding:0 20px 20px;" });
  if (RA.done) {
    body.appendChild(div({ style: "text-align:center; padding:16px 0 8px;" }, div({ style: "width:52px; height:52px; margin:0 auto 12px; border-radius:50%; background:#E2F0E7; display:flex; align-items:center; justify-content:center;" }, sIcon(26, 26, "#2E7D4E", 2.6, '<path d="' + CHECK + '"/>')), div({ style: "font-family:'Space Grotesk'; font-weight:600; font-size:16px;" }, "Moved " + RA.count + " leads to " + RA.toName), div({ style: "font-size:12.5px; color:#5C665F; margin-top:5px;" }, "Their pipeline is safe — no clients lost.")));
    body.appendChild(btn({ onClick: RA.onClose, style: "margin-top:14px; width:100%; background:#143E34; color:#F2EFE8; border:none; border-radius:10px; padding:13px; font-family:'Space Grotesk'; font-weight:700; font-size:14px; cursor:pointer;" }, "Done"));
  } else {
    body.appendChild(div({ style: "font-size:13px; color:#3B443E; margin-bottom:14px;" }, "Move ", h("b", null, RA.fromFirst), "'s ", h("b", null, RA.count), " active leads to:"));
    const list = div({ style: "display:flex; flex-direction:column; gap:8px; margin-bottom:16px;" });
    RA.targets.forEach(t => list.appendChild(btn({ onClick: t.onClick, style: t.style }, span({ style: "width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:600; color:#fff; background:" + t.color + ";" }, t.initials), span({ style: "flex:1; text-align:left; font-weight:600; font-size:13.5px;" }, t.first), t.active ? sIcon(18, 18, "#143E34", 2.4, '<path d="' + CHECK + '"/>') : null)));
    body.appendChild(list);
    body.appendChild(btn({ onClick: RA.onConfirm, style: "width:100%; background:#143E34; color:#F2EFE8; border:none; border-radius:10px; padding:13px; font-family:'Space Grotesk'; font-weight:700; font-size:14px; cursor:pointer;" }, "Reassign " + RA.count + " leads"));
  }
  const inner = div({ style: "width:420px; max-width:100%; background:#F2EFE8; border-radius:16px; box-shadow:0 30px 80px rgba(0,0,0,.35); overflow:hidden;" },
    div({ style: "padding:18px 20px 14px; display:flex; align-items:center;" }, div({ style: "flex:1; font-family:'Space Grotesk'; font-weight:600; font-size:18px;" }, "Reassign leads"), closeX(RA.onClose)),
    body);
  return overlay(RA.onClose, inner);
}

// ---- Add agent modal ----
function addAgentModal(app) {
  const inp = h("input", { value: app.state.addAgentName, onInput: e => app.setState({ addAgentName: e.target.value }), placeholder: "e.g. Kiran Patil", style: "width:100%; border:1px solid #E4E0D5; border-radius:8px; padding:11px 12px; font-family:inherit; font-size:14px; color:#19211D; background:#fff; box-sizing:border-box; margin-bottom:16px;" });
  inp.setAttribute("data-focus", "addAgentName");
  const inner = div({ style: "width:380px; max-width:100%; background:#F2EFE8; border-radius:16px; box-shadow:0 30px 80px rgba(0,0,0,.35); overflow:hidden;" },
    div({ style: "padding:18px 20px 14px; display:flex; align-items:center;" }, div({ style: "flex:1; font-family:'Space Grotesk'; font-weight:600; font-size:18px;" }, "Add agent"), closeX(() => app.setState({ addAgentOpen: false, addAgentName: "" }))),
    div({ style: "padding:0 20px 20px;" }, div({ style: "font-size:11px; letter-spacing:.5px; text-transform:uppercase; color:#8A938C; margin-bottom:7px;" }, "Agent name"), inp, btn({ onClick: () => app.addAgent(), style: "width:100%; background:#143E34; color:#F2EFE8; border:none; border-radius:10px; padding:13px; font-family:'Space Grotesk'; font-weight:700; font-size:14px; cursor:pointer;" }, "Add to team")));
  return overlay(() => app.setState({ addAgentOpen: false, addAgentName: "" }), inner);
}

// ---- Add property modal ----
function addPropModal(app) {
  const af = app.state.addForm;
  const chip = (on, c) => ({ flex: "1", border: "1px solid " + (on ? (c || "#143E34") : "#D7DCD2"), background: on ? (c || "#143E34") : "#fff", color: on ? "#fff" : "#5C665F", borderRadius: "8px", padding: "9px 6px", fontFamily: "'Space Grotesk'", fontWeight: 600, fontSize: "12.5px", cursor: "pointer" });
  const inpStyle = "width:100%; border:1px solid #E4E0D5; border-radius:8px; padding:10px 12px; font-family:inherit; font-size:13.5px; color:#19211D; background:#fff; box-sizing:border-box;";
  const field = (label, key, ph) => { const i = h("input", { value: af[key], onInput: e => app.setAddField(key, e.target.value), placeholder: ph, style: inpStyle }); i.setAttribute("data-focus", "af_" + key); return div(null, div({ style: "font-size:11px; letter-spacing:.5px; text-transform:uppercase; color:#8A938C; margin-bottom:7px;" }, label), i); };
  const dealRow = div({ style: "display:flex; gap:7px;" });
  ["sale", "rent"].forEach(d => dealRow.appendChild(btn({ onClick: () => app.setAddField("deal", d), style: chip(af.deal === d) }, d === "sale" ? "For sale" : "For rent")));
  const typeRow = div({ style: "display:flex; gap:7px;" });
  ["1BHK", "2BHK", "3BHK", "Commercial"].forEach(t => typeRow.appendChild(btn({ onClick: () => app.setAddField("type", t), style: chip(af.type === t) }, t)));
  const statusRow = div({ style: "display:flex; gap:7px;" });
  ["Available", "Under offer"].forEach(s => statusRow.appendChild(btn({ onClick: () => app.setAddField("status", s), style: chip(af.status === s, app.statusInfo(s).c) }, s)));
  const priceLabel = af.deal === "rent" ? "Monthly rent (₹)" : "Price (₹ lakh)";
  const inner = div({ style: "width:440px; max-width:100%; max-height:92vh; overflow-y:auto; background:#F2EFE8; border-radius:16px; box-shadow:0 30px 80px rgba(0,0,0,.35);" },
    div({ style: "padding:18px 20px 14px; display:flex; align-items:center;" }, div({ style: "flex:1; font-family:'Space Grotesk'; font-weight:600; font-size:18px;" }, "Add property"), closeX(() => app.setState({ addPropOpen: false }))),
    div({ style: "padding:0 20px 20px; display:flex; flex-direction:column; gap:14px;" },
      div(null, div({ style: "font-size:11px; letter-spacing:.5px; text-transform:uppercase; color:#8A938C; margin-bottom:7px;" }, "Deal"), dealRow),
      div(null, div({ style: "font-size:11px; letter-spacing:.5px; text-transform:uppercase; color:#8A938C; margin-bottom:7px;" }, "Type"), typeRow),
      field("Society / project", "society", "e.g. Kolte Patil Life Republic"),
      div({ style: "display:flex; gap:12px;" }, div({ style: "flex:1;" }, field("Locality", "locality", "Wakad")), div({ style: "flex:1;" }, field(priceLabel, "price", "82"))),
      field("Owner", "owner", "Owner name"),
      div(null, div({ style: "font-size:11px; letter-spacing:.5px; text-transform:uppercase; color:#8A938C; margin-bottom:7px;" }, "Status"), statusRow),
      btn({ onClick: () => app.addProperty(), style: "margin-top:4px; width:100%; background:#143E34; color:#F2EFE8; border:none; border-radius:10px; padding:14px; font-family:'Space Grotesk'; font-weight:700; font-size:14.5px; cursor:pointer;" }, "Save property"),
      div({ style: "font-size:11.5px; color:#8A938C; text-align:center;" }, "Saves to your inventory and becomes matchable instantly.")));
  return overlay(() => app.setState({ addPropOpen: false }), inner);
}

// ---- WhatsApp modal (desktop) ----
function waModal(app, W) {
  const langRow = div({ style: "display:flex; gap:4px; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.10); border-radius:8px; padding:3px;" });
  W.langs.forEach(lg => langRow.appendChild(btn({ onClick: lg.onClick, style: lg.style }, lg.label)));
  const toneRow = div({ style: "display:flex; gap:4px; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.10); border-radius:8px; padding:3px;" });
  W.tones.forEach(tn => toneRow.appendChild(btn({ onClick: tn.onClick, style: tn.style }, tn.label)));

  const canvas = div({ style: "flex:1; overflow-y:auto; background:#0E3329; background-image:radial-gradient(rgba(255,255,255,.03) 1px, transparent 1px); background-size:16px 16px; padding:16px; min-height:230px; display:flex; flex-direction:column; justify-content:flex-end;" });
  if (W.composing) canvas.appendChild(composingBubble(W, 88));
  if (W.ready) {
    const bubble = div({ style: "align-self:flex-start; max-width:92%; background:#DCF7E3; border-radius:14px 14px 14px 4px; padding:12px 13px 8px; box-shadow:0 3px 12px rgba(0,0,0,.3); animation:bubbleIn .45s cubic-bezier(.2,.8,.2,1) both;" });
    if (W.editing) { const ta = h("textarea", { onInput: W.onEditChange, style: "width:100%; min-height:220px; border:none; background:transparent; resize:none; font-family:'IBM Plex Sans'; font-size:13.5px; line-height:1.6; color:#0E2C1E; outline:none;" }); ta.value = W.messageRaw; ta.setAttribute("data-focus", "waEdit"); bubble.appendChild(ta); }
    else { const m = div({ style: "font-family:" + W.msgFont + "; font-size:13.5px; line-height:1.62; color:#0E2C1E; white-space:pre-wrap;" }); m.innerHTML = W.messageHtml; bubble.appendChild(m); }
    bubble.appendChild(div({ style: "display:flex; align-items:center; justify-content:flex-end; gap:5px; margin-top:5px; font-size:10px; color:#5C8A6E;" }, W.clock + " ", sIcon(15, 12, "#4FA3C7", 2.4, '<path d="M1 9l5 5L15 4"/><path d="M8 12l1 1L22 4"/>', { viewBox: "0 0 24 18" })));
    canvas.appendChild(bubble);
  }

  const shell = div({ style: "width:460px; max-width:100%; max-height:92vh; background:#0C2B24; border-radius:16px; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 30px 80px rgba(0,0,0,.4);" },
    div({ style: "padding:14px 16px; display:flex; align-items:center; gap:10px;" }, fIcon(19, 19, "#1E7F5C", '<path d="' + WA_PATH + '"/>'), div({ style: "flex:1; font-family:'Space Grotesk'; font-weight:600; font-size:15px; color:#F2EFE8;" }, "WhatsApp message"), btn({ onClick: W.onCloseModal, style: "background:transparent; border:none; cursor:pointer;" }, sIcon(20, 20, "#9FB6AA", 2.2, '<path d="' + CLOSE + '"/>'))),
    div({ style: "padding:0 16px 12px;" },
      div({ style: "background:rgba(255,255,255,.06); border:1px solid rgba(176,120,43,.35); border-radius:10px; padding:10px 12px; display:flex; align-items:center; gap:11px;" }, div({ style: "width:40px; height:40px; border-radius:8px; background:" + W.thumbBg + "; display:flex; align-items:center; justify-content:center; flex-shrink:0;" }, houseThumb(20, 20, W.thumbInk)), div({ style: "flex:1; min-width:0;" }, div({ style: "color:#F2EFE8; font-weight:600; font-size:13.5px;" }, W.title), div({ style: "color:#9FB6AA; font-size:11.5px;" }, W.society + " · " + W.deal)), div({ style: "font-family:'Space Grotesk'; font-weight:700; font-size:15px; color:#B0782B;" }, W.priceLabel)),
      div({ style: "display:flex; gap:10px; margin-top:10px;" }, div({ style: "flex:1;" }, div({ style: "font-size:10px; letter-spacing:1px; text-transform:uppercase; color:#7E968A; margin-bottom:5px;" }, "Language"), langRow), div({ style: "width:150px;" }, div({ style: "font-size:10px; letter-spacing:1px; text-transform:uppercase; color:#7E968A; margin-bottom:5px;" }, "Tone"), toneRow))),
    canvas);
  if (W.ready) shell.appendChild(div({ style: "padding:12px 14px; display:flex; gap:9px; border-top:1px solid rgba(255,255,255,.08);" },
    btn({ onClick: W.onCopy, style: "flex:1.4; display:flex; align-items:center; justify-content:center; gap:8px; background:#B0782B; color:#0C2B24; border:none; border-radius:10px; padding:12px; font-family:'Space Grotesk'; font-weight:700; font-size:13.5px; cursor:pointer;" }, sIcon(16, 16, "#0C2B24", 2.2, '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'), W.copyLabel),
    btn({ onClick: W.onRegen, style: "flex:1; display:flex; align-items:center; justify-content:center; gap:7px; background:rgba(255,255,255,.06); color:#F2EFE8; border:1px solid rgba(255,255,255,.14); border-radius:10px; padding:12px; font-family:'Space Grotesk'; font-weight:600; font-size:12.5px; cursor:pointer;" }, sIcon(15, 15, "#B0782B", 2.2, '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>'), "Regenerate"),
    btn({ onClick: W.onEdit, style: "width:46px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,.06); color:#F2EFE8; border:1px solid rgba(255,255,255,.14); border-radius:10px; cursor:pointer;" }, sIcon(16, 16, "#F2EFE8", 2, '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'))));
  return overlay(W.onCloseModal, shell, "padding:30px;");
}

// ---- Lead form modal (new + edit, shared mobile/desktop) ----
function leadFormModal(app) {
  const f = app.state.leadForm;
  const chip = (on, c) => ({ border: "1px solid " + (on ? (c || "#143E34") : "#D7DCD2"), background: on ? (c || "#143E34") : "#fff", color: on ? "#fff" : "#5C665F", borderRadius: "8px", padding: "8px 12px", fontFamily: "'Space Grotesk'", fontWeight: 600, fontSize: "12.5px", cursor: "pointer", whiteSpace: "nowrap" });
  const inpStyle = "width:100%; border:1px solid #E4E0D5; border-radius:8px; padding:10px 12px; font-family:inherit; font-size:13.5px; color:#19211D; background:#fff; box-sizing:border-box;";
  const lbl = t => div({ style: "font-size:11px; letter-spacing:.5px; text-transform:uppercase; color:#8A938C; margin-bottom:7px;" }, t);
  const field = (label, key, ph) => { const i = h("input", { value: f[key] || "", onInput: e => app.setLeadFormField(key, e.target.value), placeholder: ph, style: inpStyle }); i.setAttribute("data-focus", "lf_" + key); return div(null, lbl(label), i); };
  const rowWrap = (children) => { const r = div({ style: "display:flex; gap:7px; flex-wrap:wrap;" }); children.forEach(c => r.appendChild(c)); return r; };

  const configRow = rowWrap(["1BHK", "2BHK", "3BHK", "Commercial", "Plot"].map(t => btn({ onClick: () => app.setLeadFormField("config", t), style: chip(f.config === t) }, t)));
  const dealRow = rowWrap(["sale", "rent"].map(d => btn({ onClick: () => app.setLeadFormField("deal", d), style: chip(f.deal === d) }, d === "sale" ? "Buy" : "Rent")));
  const budgetRow = rowWrap((f.deal === "rent" ? [["low", "₹15–22k"], ["mid", "₹28–38k"], ["high", "₹45–60k"]] : [["low", "₹50–65L"], ["mid", "₹75–90L"], ["high", "₹1.1–1.5Cr"], ["premium", "₹1.8–2.2Cr"]]).map(([band, label]) => {
    const on = app.budgetRange({ deal: f.deal, budgetMin: f.budgetMin, budgetMax: f.budgetMax }) === app.budgetRange((function () { const bands = { "sale:low": [5000000, 6500000], "sale:mid": [7500000, 9000000], "sale:high": [11000000, 15000000], "sale:premium": [18000000, 22000000], "rent:low": [15000, 22000], "rent:mid": [28000, 38000], "rent:high": [45000, 60000] }; const b = bands[(f.deal === "rent" ? "rent:" : "sale:") + band]; return { deal: f.deal, budgetMin: b[0], budgetMax: b[1] }; })());
    return btn({ onClick: () => app.setLeadBudget(band), style: chip(on) }, label);
  }));
  const sourceRow = rowWrap(["99acres", "MagicBricks", "Walk-in", "Referral", "Website"].map(sc => btn({ onClick: () => app.setLeadFormField("source", sc), style: chip(f.source === sc, app.sourceColor(sc)) }, sc)));
  const agentRow = rowWrap(app._d.agents.map(a => btn({ onClick: () => app.setLeadFormField("agentId", a.id), style: chip(f.agentId === a.id, a.color) }, a.first)));

  const inner = div({ style: "width:460px; max-width:100%; max-height:92vh; overflow-y:auto; background:#F2EFE8; border-radius:16px; box-shadow:0 30px 80px rgba(0,0,0,.35);" },
    div({ style: "padding:18px 20px 14px; display:flex; align-items:center;" }, div({ style: "flex:1; font-family:'Space Grotesk'; font-weight:600; font-size:18px;" }, f.mode === "edit" ? "Edit lead" : "New lead"), closeX(() => app.closeLeadForm())),
    div({ style: "padding:0 20px 20px; display:flex; flex-direction:column; gap:14px;" },
      field("Name", "name", "e.g. Rohit Sharma"),
      field("Phone", "phone", "+91 98xxx xxxxx"),
      div(null, lbl("Deal"), dealRow),
      div(null, lbl("Config"), configRow),
      field("Locality", "locality", "Wakad"),
      div(null, lbl("Budget"), budgetRow),
      field("Timeline", "timeline", "Within 1 month"),
      div(null, lbl("Source"), sourceRow),
      div(null, lbl("Assign to"), agentRow),
      (function () { const i = h("textarea", { value: f.notes || "", onInput: e => app.setLeadFormField("notes", e.target.value), placeholder: "Notes (optional)", style: inpStyle + " min-height:56px; resize:none;" }); i.setAttribute("data-focus", "lf_notes"); return div(null, lbl("Notes"), i); })(),
      btn({ onClick: () => app.saveLeadForm(), style: "margin-top:4px; width:100%; background:#143E34; color:#F2EFE8; border:none; border-radius:10px; padding:14px; font-family:'Space Grotesk'; font-weight:700; font-size:14.5px; cursor:pointer;" }, f.mode === "edit" ? "Save changes" : "Save lead"),
      div({ style: "font-size:11.5px; color:#8A938C; text-align:center;" }, "Auto-composes the requirement line and routes to the chosen agent.")));
  return overlay(() => app.closeLeadForm(), inner);
}

// ---- Contact form modal ----
function contactFormModal(app) {
  const f = app.state.contactForm;
  const chip = on => ({ flex: "1", border: "1px solid " + (on ? "#143E34" : "#D7DCD2"), background: on ? "#143E34" : "#fff", color: on ? "#fff" : "#5C665F", borderRadius: "8px", padding: "9px 6px", fontFamily: "'Space Grotesk'", fontWeight: 600, fontSize: "12.5px", cursor: "pointer" });
  const inpStyle = "width:100%; border:1px solid #E4E0D5; border-radius:8px; padding:10px 12px; font-family:inherit; font-size:13.5px; color:#19211D; background:#fff; box-sizing:border-box;";
  const lbl = t => div({ style: "font-size:11px; letter-spacing:.5px; text-transform:uppercase; color:#8A938C; margin-bottom:7px;" }, t);
  const field = (label, key, ph) => { const i = h("input", { value: f[key] || "", onInput: e => app.setContactField(key, e.target.value), placeholder: ph, style: inpStyle }); i.setAttribute("data-focus", "cf_" + key); return div(null, lbl(label), i); };
  const roleRow = div({ style: "display:flex; gap:7px;" }); ["Seller", "Landlord"].forEach(r => roleRow.appendChild(btn({ onClick: () => app.setContactField("role", r), style: chip(f.role === r) }, r)));
  const inner = div({ style: "width:400px; max-width:100%; background:#F2EFE8; border-radius:16px; box-shadow:0 30px 80px rgba(0,0,0,.35); overflow:hidden;" },
    div({ style: "padding:18px 20px 14px; display:flex; align-items:center;" }, div({ style: "flex:1; font-family:'Space Grotesk'; font-weight:600; font-size:18px;" }, f.mode === "edit" ? "Edit contact" : "New contact"), closeX(() => app.closeContactForm())),
    div({ style: "padding:0 20px 20px; display:flex; flex-direction:column; gap:14px;" },
      field("Name", "name", "e.g. Sunil Agarwal"),
      field("Phone", "phone", "+91 98xxx xxxxx"),
      f.mode === "new" ? div(null, lbl("Role"), roleRow) : null,
      btn({ onClick: () => app.saveContactForm(), style: "width:100%; background:#143E34; color:#F2EFE8; border:none; border-radius:10px; padding:13px; font-family:'Space Grotesk'; font-weight:700; font-size:14px; cursor:pointer;" }, f.mode === "edit" ? "Save changes" : "Add contact"),
      f.mode === "new" ? div({ style: "font-size:11.5px; color:#8A938C; text-align:center;" }, "Starts with one listing you can edit from their record.") : null));
  return overlay(() => app.closeContactForm(), inner);
}

// ---- Global search overlay ----
function searchModal(app) {
  const R = app.searchResults();
  const inp = h("input", { value: app.state.searchQ, onInput: e => app.setState({ searchQ: e.target.value }), placeholder: "Search leads, properties, people…", style: "flex:1; border:none; outline:none; background:transparent; font-family:inherit; font-size:15px; color:#19211D;" });
  inp.setAttribute("data-focus", "searchbox");
  const body = div({ style: "max-height:60vh; overflow-y:auto; padding:6px 8px 10px;" });
  const section = (title, items, render) => { if (!items.length) return; body.appendChild(div({ style: "font-size:10px; letter-spacing:1px; text-transform:uppercase; color:#8A938C; font-weight:700; padding:10px 10px 5px;" }, title)); items.forEach(it => body.appendChild(render(it))); };
  const go = fn => () => { fn(); app.closeSearch(); };
  section("Leads", R.leads, l => btn({ onClick: go(() => app.computeDesktop() ? app.openDeskLead(l.id) : app.openLead(l.id)), style: "text-align:left; width:100%; background:transparent; border:none; border-radius:8px; padding:9px 10px; cursor:pointer; display:flex; align-items:center; gap:9px; font-family:inherit;" },
    span({ style: "width:8px; height:8px; border-radius:50%; background:" + app.stageInfo(l.stage).c + ";" }), div({ style: "flex:1; min-width:0;" }, div({ style: "font-weight:600; font-size:14px;" }, l.name), div({ style: "font-size:12px; color:#5C665F;" }, app.reqLine(l.req))), span({ style: "font-size:11px; color:#8A938C;" }, l.stage)));
  section("Properties", R.props, p => btn({ onClick: go(() => app.openProp(p.id, app.computeDesktop() ? "desktop" : "mobile")), style: "text-align:left; width:100%; background:transparent; border:none; border-radius:8px; padding:9px 10px; cursor:pointer; display:flex; align-items:center; gap:9px; font-family:inherit;" },
    div({ style: "flex:1; min-width:0;" }, div({ style: "font-weight:600; font-size:14px;" }, p.society), div({ style: "font-size:12px; color:#5C665F;" }, p.title)), span({ style: "font-family:'Space Grotesk'; font-weight:700; font-size:13px; color:#B0782B;" }, p.priceLabel)));
  section("People", R.people, name => btn({ onClick: go(() => app.openPerson(name, app.computeDesktop() ? "desktop" : "mobile")), style: "text-align:left; width:100%; background:transparent; border:none; border-radius:8px; padding:9px 10px; cursor:pointer; display:flex; align-items:center; gap:9px; font-family:inherit;" },
    span({ style: "width:30px; height:30px; border-radius:50%; background:#E7E2D6; color:#143E34; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:600;" }, app.ini(name)), div({ style: "flex:1;" }, div({ style: "font-weight:600; font-size:14px;" }, name))));
  if (app.state.searchQ.trim() && !R.leads.length && !R.props.length && !R.people.length) body.appendChild(div({ style: "padding:22px; text-align:center; color:#8A938C; font-size:13px;" }, "No matches for “" + app.state.searchQ + "”."));
  if (!app.state.searchQ.trim()) body.appendChild(div({ style: "padding:22px; text-align:center; color:#8A938C; font-size:13px;" }, "Type a name, society, locality, or number."));

  const inner = div({ style: "width:520px; max-width:100%; background:#F2EFE8; border-radius:14px; box-shadow:0 30px 80px rgba(0,0,0,.4); overflow:hidden;" },
    div({ style: "display:flex; align-items:center; gap:10px; padding:14px 16px; border-bottom:1px solid #E4E0D5;" }, sIcon(18, 18, "#8A938C", 2, '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'), inp, closeX(() => app.closeSearch())),
    body);
  return div({ onClick: () => app.closeSearch(), style: "position:fixed; inset:0; background:rgba(12,43,36,.5); z-index:60; display:flex; align-items:flex-start; justify-content:center; padding:60px 20px;" }, (function () { inner.addEventListener("click", e => e.stopPropagation()); return inner; })());
}

// ---- Toasts ----
function toastStack(app) {
  if (!app.state.toasts.length) return null;
  const stack = div({ style: "position:fixed; left:50%; bottom:26px; transform:translateX(-50%); z-index:80; display:flex; flex-direction:column; gap:8px; align-items:center; pointer-events:none;" });
  app.state.toasts.forEach(t => {
    const c = t.tone === "warn" ? { bg: "#8A5350", ic: "#EFE3E2" } : { bg: "#143E34", ic: "#B0782B" };
    stack.appendChild(div({ style: "background:" + c.bg + "; color:#F2EFE8; border-radius:10px; padding:11px 16px; font-size:13px; font-weight:500; box-shadow:0 10px 30px rgba(12,43,36,.35); display:flex; align-items:center; gap:9px; animation:riseIn .25s ease both; max-width:90vw;" },
      sIcon(15, 15, c.ic, 2.6, t.tone === "warn" ? '<path d="M12 9v4M12 17h.01"/>' : '<path d="' + CHECK + '"/>'), t.text));
  });
  return stack;
}

// ---- Notification center ----
function notifModal(app) {
  const items = app.notifications();
  const iconFor = k => ({ clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', cal: '<path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>', user: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>', bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>' }[k] || '<circle cx="12" cy="12" r="9"/>');
  const body = div({ style: "max-height:64vh; overflow-y:auto; padding:6px 8px 12px;" });
  const go = id => () => { app.closeNotif(); app.computeDesktop() ? app.openDeskLead(id) : app.openLead(id); };
  if (!items.length) body.appendChild(div({ style: "padding:28px; text-align:center; color:#8A938C; font-size:13px;" }, "All clear — nothing needs you right now."));
  items.forEach(n => body.appendChild(btn({ onClick: go(n.leadId), style: "text-align:left; width:100%; background:transparent; border:none; border-radius:9px; padding:11px 10px; cursor:pointer; display:flex; gap:11px; align-items:flex-start; font-family:inherit;" },
    span({ style: "width:32px; height:32px; border-radius:8px; flex-shrink:0; background:" + n.color + "18; display:flex; align-items:center; justify-content:center;" }, sIcon(16, 16, n.color, 2, iconFor(n.icon))),
    div({ style: "flex:1; min-width:0;" }, div({ style: "font-weight:600; font-size:13.5px; color:#19211D;" }, n.title), div({ style: "font-size:12px; color:#5C665F; margin-top:1px;" }, n.sub)))));
  const inner = div({ style: "width:420px; max-width:100%; background:#F2EFE8; border-radius:14px; box-shadow:0 30px 80px rgba(0,0,0,.4); overflow:hidden;" },
    div({ style: "padding:15px 16px; display:flex; align-items:center; gap:9px; border-bottom:1px solid #E4E0D5;" }, sIcon(18, 18, "#143E34", 2, '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'), div({ style: "flex:1; font-family:'Space Grotesk'; font-weight:600; font-size:15px;" }, "Notifications"), closeX(() => app.closeNotif())),
    body,
    div({ style: "padding:9px 14px; border-top:1px solid #E4E0D5; font-size:11px; color:#8A938C; text-align:center;" }, "Native reminders — no more sticky notes or missed calls."));
  return div({ onClick: () => app.closeNotif(), style: "position:fixed; inset:0; background:rgba(12,43,36,.4); z-index:60; display:flex; align-items:flex-start; justify-content:flex-end; padding:66px 20px 20px;" }, (function () { inner.addEventListener("click", e => e.stopPropagation()); return inner; })());
}

// ---- IP watermark overlay (agent view) ----
function watermarkLayer(app) {
  const text = app.watermarkText();
  const wrap = div({ style: "position:fixed; inset:0; z-index:2; pointer-events:none; overflow:hidden; opacity:.05;" });
  const rows = 8, cols = 3;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    wrap.appendChild(div({ style: "position:absolute; left:" + (c * 38 - 5) + "%; top:" + (r * 13 + 3) + "%; transform:rotate(-24deg); font-family:'IBM Plex Sans'; font-size:12px; font-weight:600; color:#143E34; white-space:nowrap;" }, text));
  }
  return wrap;
}

window.__extraModals = { leadFormModal, contactFormModal, searchModal, toastStack, notifModal, watermarkLayer };

// =====================================================================
// MOUNT + RENDER
// =====================================================================
function mount(app) {
  const root = document.getElementById("app");
  // capture focus + caret before wiping
  const active = document.activeElement;
  let focusKey = null, caret = null;
  if (active && active.getAttribute && active.getAttribute("data-focus")) {
    focusKey = active.getAttribute("data-focus");
    if (active.selectionStart != null) caret = active.selectionStart;
  }

  const frag = document.createDocumentFragment();
  const s = app.state;
  const isDesktopRaw = app.computeDesktop();
  const loggedIn = s.loggedIn;

  if (!loggedIn) {
    frag.appendChild(S.loginScreen(app));
  } else if (!isDesktopRaw) {
    // MOBILE frame
    const frame = div({ style: "width:100%; max-width:430px; min-height:100dvh; background:#F2EFE8; position:relative; display:flex; flex-direction:column; box-shadow:0 0 0 1px rgba(20,62,52,.06), 0 24px 60px rgba(12,43,36,.14); overflow:hidden;" });
    const screen = s.screen;
    if (screen === "inbox") frame.appendChild(S.inboxScreen(app));
    else if (screen === "home") frame.appendChild(S.homeScreen(app));
    else if (screen === "lead") frame.appendChild(S.leadScreen(app));
    else if (screen === "whatsapp") frame.appendChild(S.whatsappScreen(app));
    else if (screen === "props") frame.appendChild(S.propsScreen(app));
    else if (screen === "propDetail") frame.appendChild(S.propDetailScreen(app));
    else if (screen === "contacts") frame.appendChild(S.contactsScreen(app));
    else if (screen === "person") frame.appendChild(S.personScreen(app));
    else if (screen === "calendar") frame.appendChild(S.calendarScreen(app));
    else if (screen === "soon") frame.appendChild(S.soonScreen(app));
    else frame.appendChild(S.inboxScreen(app));

    // tab bar
    const showTab = (screen === "inbox" || screen === "soon" || screen === "home" || screen === "props" || screen === "contacts" || screen === "calendar");
    if (showTab) frame.appendChild(S.tabBar(app));

    // in-frame sheets
    if (s.sheetOpen) frame.appendChild(newLeadSheet(app));

    frag.appendChild(div({ style: "min-height:100dvh; display:flex; justify-content:center; align-items:flex-start; background:radial-gradient(120% 90% at 50% 0%, #EDE9DE 0%, #E1DCCF 100%);" }, frame));
  } else {
    // DESKTOP
    const DV = app.desktopVals();
    app._DV = DV;
    frag.appendChild(window.__desktop.desktopShell(app, DV));
    if (DV.waModal && DV.W) frag.appendChild(waModal(app, DV.W));
  }

  // global overlays (both modes)
  // actions sheet needs a RAIL model for the current detail screen
  if (s.railSheetOpen && !isDesktopRaw) {
    let RAIL = null;
    if (s.screen === "lead") RAIL = app.railForLead(s.leadId, "mobile");
    else if (s.screen === "propDetail") RAIL = app.railForProperty(s.propDetailId, "mobile");
    else if (s.screen === "person") RAIL = app.railForPerson(s.personId, "mobile");
    if (RAIL) frag.appendChild(actionsSheet(app, RAIL));
  }
  if (s.callOpen) { const C = app.callView(); if (C) frag.appendChild(callModal(app, C)); }
  if (s.intgOpen) { const I = app.intgView(); if (I) frag.appendChild(intgModal(app, I)); }
  if (s.reassignFrom) frag.appendChild(reassignModal(app, reassignVM(app)));
  if (s.addAgentOpen) frag.appendChild(addAgentModal(app));
  if (s.addPropOpen) frag.appendChild(addPropModal(app));
  if (s.leadForm) frag.appendChild(window.__extraModals.leadFormModal(app));
  if (s.contactForm) frag.appendChild(window.__extraModals.contactFormModal(app));
  if (s.searchOpen) frag.appendChild(window.__extraModals.searchModal(app));
  if (s.notifOpen) frag.appendChild(window.__extraModals.notifModal(app));
  // IP watermark on the agent (mobile) app only, once logged in
  if (loggedIn && !isDesktopRaw) frag.appendChild(window.__extraModals.watermarkLayer(app));
  const toasts = window.__extraModals.toastStack(app);
  if (toasts) frag.appendChild(toasts);

  root.textContent = "";
  root.appendChild(frag);

  // restore focus
  if (focusKey) {
    const el = root.querySelector('[data-focus="' + focusKey + '"]');
    if (el) { el.focus(); if (caret != null && el.setSelectionRange) { try { el.setSelectionRange(caret, caret); } catch (e) {} } }
  }
}

function reassignVM(app) {
  const raFrom = app.state.reassignFrom;
  const raAgent = raFrom ? app.agentById(raFrom) : null;
  const raTarget = app.state.reassignTo ? app.agentById(app.state.reassignTo) : null;
  return {
    fromName: raAgent ? raAgent.name : "", fromFirst: raAgent ? raAgent.first : "",
    count: app.state.leads.filter(l => l.agentId === raFrom && !l.stage.startsWith("Closed")).length,
    toName: raTarget ? raTarget.first : "",
    done: app.state.reassignDone, notDone: !app.state.reassignDone,
    targets: app.activeAgents().filter(a => a.id !== raFrom).map(a => { const on = app.state.reassignTo === a.id; return { initials: a.initials, first: a.first, color: a.color, active: on, onClick: () => app.setState({ reassignTo: a.id }), style: { display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "10px 12px", cursor: "pointer", fontFamily: "inherit", border: "1px solid " + (on ? "#143E34" : "#E4E0D5"), background: on ? "#EEF3EE" : "#fff", borderRadius: "10px" } }; }),
    onConfirm: () => app.doReassign(), onClose: () => app.closeReassign(),
  };
}

window.__mount = mount;

// boot
document.addEventListener("DOMContentLoaded", () => {
  const app = new window.__App();
  window.__appInstance = app;
  mount(app);
});
})();
