// ============================================================================
// RENDER LAYER — ports the Bhumi Propcity .dc markup to the h() helper.
// Behavior-faithful to the original design.
// ============================================================================
(function () {
"use strict";
const { h, div, span, btn } = window.__h;
const FIRM = window.__FIRM;
const BRAND = window.theme.brand;

// svg builders
function sIcon(w, hh, stroke, sw, inner, extra) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("width", w); s.setAttribute("height", hh); s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("fill", "none"); s.setAttribute("stroke", stroke); s.setAttribute("stroke-width", sw);
  s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
  if (extra) for (const k in extra) s.setAttribute(k, extra[k]);
  s.innerHTML = inner;
  return s;
}
function fIcon(w, hh, fill, inner, extra) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("width", w); s.setAttribute("height", hh); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", fill);
  if (extra) for (const k in extra) s.setAttribute(k, extra[k]);
  s.innerHTML = inner;
  return s;
}
// house/building thumbnail glyph
const HOUSE = '<path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/>';
const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const WA_PATH = "M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Z";
const BACK = '<path d="M15 18l-6-6 6-6"/>';
const CLOSE = '<path d="M18 6 6 18M6 6l12 12"/>';
const PLUS = '<path d="M12 5v14M5 12h14"/>';

// =====================================================================
// ActionRail (mirrors ActionRail.dc.html)
// =====================================================================
function ActionRail(model) {
  const wrap = div({ style: "width:100%; display:flex; flex-direction:column; gap:14px; font-family:'IBM Plex Sans',system-ui,sans-serif; color:#19211D;" });
  if (!model) return wrap;

  wrap.appendChild(div({ style: "display:flex; align-items:center; gap:8px;" },
    span({ style: "width:7px; height:7px; border-radius:50%; background:#B0782B;" }),
    span({ style: "font-size:11px; letter-spacing:1.4px; text-transform:uppercase; color:#8A938C; font-weight:600;" }, "Actions"),
    span({ style: "flex:1;" }),
    span({ style: "font-size:11.5px; color:#8A938C; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:150px;" }, model.subject)
  ));

  wrap.appendChild(btn({ onClick: model.primary.onClick, style: "text-align:left; display:flex; align-items:center; gap:12px; background:#143E34; border:1px solid #0C2B24; border-radius:12px; padding:14px 15px; cursor:pointer; box-shadow:0 10px 22px rgba(12,43,36,.16); width:100%;" },
    span({ style: "width:42px; height:42px; border-radius:11px; background:rgba(176,120,43,.18); display:flex; align-items:center; justify-content:center; flex-shrink:0;" },
      sIcon(21, 21, model.primary.iconStroke, 2, '<path d="' + model.primary.iconPath + '"></path>', { fill: model.primary.iconFill })),
    span({ style: "flex:1; min-width:0;" },
      span({ style: "display:block; font-family:'Space Grotesk',sans-serif; font-weight:600; font-size:15px; color:#F2EFE8;" }, model.primary.label),
      span({ style: "display:block; font-size:12px; color:#9FB6AA; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" }, model.primary.sub)),
    sIcon(18, 18, "#B0782B", 2.2, '<path d="M9 18l6-6-6-6"></path>', { style: "flex-shrink:0;" })
  ));

  const quickGrid = div({ style: "display:grid; grid-template-columns:1fr 1fr; gap:8px;" });
  model.quick.forEach(a => quickGrid.appendChild(btn({ onClick: a.onClick, style: a.style },
    sIcon(17, 17, a.iconStroke, 2, '<path d="' + a.iconPath + '"></path>', { fill: a.iconFill, style: "flex-shrink:0;" }),
    span({ style: "font-family:'Space Grotesk',sans-serif; font-weight:600; font-size:13px;" }, a.label))));
  wrap.appendChild(div(null,
    div({ style: "font-size:10px; letter-spacing:1.4px; text-transform:uppercase; color:#A7AFA6; font-weight:600; margin-bottom:9px;" }, "Quick actions"),
    quickGrid));

  if (model.panelOpen) {
    const panel = div({ style: "background:#F7F5EE; border:1px solid #E6E1D4; border-radius:12px; padding:13px 14px; animation:railRise .26s ease both;" });
    panel.appendChild(div({ style: "display:flex; align-items:center; margin-bottom:11px;" },
      span({ style: "font-family:'Space Grotesk',sans-serif; font-weight:600; font-size:13.5px; color:#19211D;" }, model.panelTitle),
      span({ style: "flex:1;" }),
      btn({ onClick: model.onClosePanel, style: "width:24px; height:24px; border:none; background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center;" },
        sIcon(15, 15, "#8A938C", 2.2, '<path d="M18 6 6 18M6 6l12 12"></path>'))));

    if (model.isCallPanel && model.call) {
      const c = model.call;
      panel.appendChild(div({ style: "display:flex; gap:5px; background:#E7E2D6; border:1px solid #DDD8CB; border-radius:9px; padding:3px; margin-bottom:12px;" },
        btn({ onClick: c.onCall, style: c.callStyle }, "Call"),
        btn({ onClick: c.onSms, style: c.smsStyle }, "SMS")));
      if (c.isCall) {
        panel.appendChild(div({ style: "display:flex; flex-direction:column; align-items:center; gap:12px; padding:6px 0 4px;" },
          div({ style: "font-family:'Space Grotesk',sans-serif; font-weight:600; font-size:22px; letter-spacing:.5px; color:#19211D;" }, c.phone),
          btn({ style: "width:58px; height:58px; border-radius:50%; background:#1E7F5C; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 8px 18px rgba(30,127,92,.32);" },
            sIcon(24, 24, "#fff", 2, '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2Z"></path>')),
          div({ style: "display:flex; align-items:center; gap:8px; font-size:11.5px; color:#8A938C; text-align:center;" },
            sIcon(13, 13, "#B0782B", 2, '<circle cx="12" cy="12" r="10"></circle><path d="M12 8v4l3 2"></path>'),
            "Auto-logs to the timeline. Live dialling connects with your telephony account.")));
      } else {
        const smsCol = div({ style: "display:flex; flex-direction:column; gap:8px;" });
        c.smsTemplates.forEach(t => smsCol.appendChild(div({ style: "background:#fff; border:1px solid #E9E5DA; border-radius:9px; padding:10px 11px;" },
          div({ style: "font-size:11px; font-weight:700; letter-spacing:.4px; text-transform:uppercase; color:#B0782B; margin-bottom:5px;" }, t.title),
          div({ style: "font-size:12.5px; color:#3A423B; line-height:1.5;" }, t.text))));
        smsCol.appendChild(div({ style: "font-size:11px; color:#8A938C; display:flex; align-items:center; gap:7px; margin-top:2px;" },
          sIcon(13, 13, "#B0782B", 2, '<circle cx="12" cy="12" r="10"></circle><path d="M12 8v4l3 2"></path>'),
          "Templates send from your registered SMS sender ID once connected."));
        panel.appendChild(smsCol);
      }
    }

    if (model.isFollowPanel && model.follow) {
      const f = model.follow;
      if (f.hasFollowUp) panel.appendChild(div({ style: "display:flex; align-items:center; gap:9px; background:#fff; border:1px solid #E9E5DA; border-radius:9px; padding:9px 11px; margin-bottom:10px;" },
        sIcon(16, 16, "#143E34", 2, '<path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"></path>'),
        div({ style: "flex:1;" }, div({ style: "font-weight:600; font-size:12.5px;" }, f.followAction), div({ style: "font-size:11.5px; color:#8A938C;" }, f.followWhen))));
      panel.appendChild(div({ style: "font-size:11.5px; color:#5C665F; margin-bottom:9px;" }, "Pick the next action — it lands on the agent's Today list."));
      panel.appendChild(div({ style: "display:flex; gap:8px;" },
        btn({ onClick: f.onSite, style: "flex:1; font-family:'Space Grotesk',sans-serif; font-weight:600; font-size:12.5px; color:#143E34; background:#fff; border:1px solid #C9D3C9; border-radius:9px; padding:11px; cursor:pointer;" }, "Site visit · Sat 11am"),
        btn({ onClick: f.onCall, style: "flex:1; font-family:'Space Grotesk',sans-serif; font-weight:600; font-size:12.5px; color:#143E34; background:#fff; border:1px solid #C9D3C9; border-radius:9px; padding:11px; cursor:pointer;" }, "Call · tomorrow")));
      if (f.saved) panel.appendChild(div({ style: "margin-top:10px; display:flex; align-items:center; gap:8px; font-size:12px; color:#2E7D4E; font-weight:600; animation:railRise .28s ease both;" },
        sIcon(15, 15, "#2E7D4E", 2.6, '<path d="' + CHECK + '"></path>'), "Added to " + f.savedOwner + "'s Today list"));
    }

    if (model.isStatusPanel && model.status) {
      const optRow = div({ style: "display:flex; gap:8px;" });
      model.status.options.forEach(s => optRow.appendChild(btn({ onClick: s.onClick, style: s.style }, s.name)));
      panel.appendChild(optRow);
      if (model.status.saved) panel.appendChild(div({ style: "margin-top:10px; display:flex; align-items:center; gap:8px; font-size:12px; color:#2E7D4E; font-weight:600; animation:railRise .28s ease both;" },
        sIcon(15, 15, "#2E7D4E", 2.6, '<path d="' + CHECK + '"></path>'), "Status updated — matching refreshed"));
    }

    if (model.isAssignPanel && model.assign) {
      const g = div({ style: "display:grid; grid-template-columns:1fr 1fr; gap:8px;" });
      model.assign.agents.forEach(ag => g.appendChild(btn({ onClick: ag.onClick, style: ag.style },
        span({ style: "width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:600; color:#fff; background:" + ag.color + ";" }, ag.initials),
        span({ style: "flex:1; text-align:left; font-weight:600; font-size:13px;" }, ag.first),
        ag.suggested ? span({ style: "font-size:8px; font-weight:700; letter-spacing:.5px; color:#B0782B; background:#F7EFDC; border-radius:4px; padding:2px 5px;" }, "SUGGESTED") : null,
        ag.active ? sIcon(15, 15, "#2E7D4E", 2.6, '<path d="' + CHECK + '"></path>') : null)));
      panel.appendChild(g);
    }
    wrap.appendChild(panel);
  }

  if (model.manage && model.manage.length) {
    const col = div({ style: "display:flex; flex-direction:column; gap:7px;" });
    model.manage.forEach(m => col.appendChild(btn({ onClick: m.onClick, style: m.style },
      sIcon(15, 15, m.stroke, 2, '<path d="' + m.iconPath + '"></path>', { style: "flex-shrink:0;" }),
      span({ style: "flex:1;" }, m.label))));
    wrap.appendChild(div(null, div({ style: "font-size:10px; letter-spacing:1.4px; text-transform:uppercase; color:#A7AFA6; font-weight:600; margin-bottom:9px;" }, "Manage"), col));
  }
  return wrap;
}

window.__ActionRail = ActionRail;
window.__ri = { sIcon, fIcon, HOUSE, CHECK, WA_PATH, BACK, CLOSE, PLUS };
})();
