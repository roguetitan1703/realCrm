// ============================================================================
// ui.js — Bhumi Propcity "Desk" design-system primitives.
// One definition each: tokens + buttons, pills, cards, table, inputs, the
// follow-up scheduler, toasts, section headers, and the Desk desktop shell.
// Everything reads from window.theme so the white-label swap stays in theme.js.
//
// Direction (chosen 2026-07-06): charcoal stationery + a SINGLE ochre accent.
// The accent is the money/won metal — nothing else gets a brand accent.
// Stage/source pills keep their functional colours (they encode data).
// ============================================================================
(function () {
"use strict";
const { h, div, span, btn } = window.__h;
const { sIcon } = window.__ri;
const THEME = window.theme;

// ---- tokens (short names for authoring) ------------------------------------
const T = {
  char:   THEME.color.charcoal,   // #22242A sidebar / brand
  charD:  THEME.color.charcoalD,  // #191B20 depth
  acc:    THEME.color.accent,     // #B8791C ochre — money/won/active/metal
  accT:   THEME.color.accentTint, // #F3E7CC accent wash
  linen:  THEME.color.linen,      // #F1EFEA ground
  card:   THEME.color.card,       // #FCFBF8 surface
  ink:    THEME.color.inkText,    // #1F2126 text
  line:   THEME.color.line,       // #E1DDD3 hairline
  muted:  THEME.color.mutedText,  // #6B6B66 secondary
  overdue: THEME.signal.overdue,  // #B23A2E
  serif:  THEME.type.display,     // Fraunces
  sans:   THEME.type.body,        // IBM Plex Sans
  body:   THEME.type.body,        // alias
  display: THEME.type.display,    // alias
  // derived surfaces
  linenHi: "#EAE7DE",             // table header / segment track
  rowHover:"#F7F4EE",
  cardEdge:"#EAE6DC",
};

// small helper: merge a base style string with overrides (string or nothing)
function sty() { return Array.prototype.filter.call(arguments, Boolean).join(""); }

// ---------------------------------------------------------------------------
// One-time stylesheet — the things inline styles can't do well: hover, sticky,
// focus rings, and the responsive rail collapse for the detail (module) shell.
// A design system needs real CSS; this keeps it in one governed place.
// ---------------------------------------------------------------------------
(function injectCSS() {
  if (document.getElementById("ui-desk-css")) return;
  const css = `
  .ui-tr:hover > td { background:${T.rowHover}; }
  .ui-tr.on > td { background:#F3EEE4; }
  .ui-th.sortable { cursor:pointer; }
  .ui-th.sortable:hover { color:${T.ink}; }
  .ui-chip:hover { border-color:${T.char}; }
  .ui-btn:focus-visible, .ui-chip:focus-visible, .ui-seg button:focus-visible,
  .ui-vw button:focus-visible, .ui-qa:focus-visible { outline:2px solid ${T.acc}; outline-offset:2px; }
  .ui-qa:hover { background:${T.linen}; border-color:${T.line}; }
  /* ---- detail shell ----
     DEFAULT (wide): rail is a normal 320px column, fully open beside content.
     NARROW (<1100px): rail collapses to a 62px icon strip that expands on hover. */
  .ui-detail { display:grid; grid-template-columns:minmax(0,1fr) 320px; gap:20px;
    padding:20px 26px 48px; align-items:start; }
  .ui-rail { position:sticky; top:20px; align-self:start;
    background:${T.card}; border:1px solid ${T.line}; border-radius:12px; overflow:hidden;
    box-shadow:0 1px 2px rgba(0,0,0,.04); }
  .ui-rail-strip { display:none; }            /* hidden when open */
  .ui-rail-full  { display:block; }           /* the real content, always shown when wide */
  /* collapsed strip = a single "Actions" tab: chevron + vertical label, nothing else */
  .ui-rail-tab { display:flex; flex-direction:column; align-items:center; gap:12px;
    padding:16px 0; cursor:pointer; width:100%; }
  .ui-rail-tab .chev { color:${T.muted}; }
  .ui-rail-tab .lbl { writing-mode:vertical-rl; transform:rotate(180deg); font-size:11px;
    letter-spacing:.18em; text-transform:uppercase; color:${T.muted}; font-weight:700; }
  @media (max-width:1100px){
    .ui-detail { grid-template-columns:minmax(0,1fr); padding-right:80px; position:relative; }
    .ui-rail { position:absolute; top:20px; right:26px; width:54px; height:auto;
      transition:width .22s cubic-bezier(.4,0,.2,1), box-shadow .22s; z-index:30; }
    .ui-rail .ui-rail-strip { display:block; }
    .ui-rail .ui-rail-full  { display:none; }
    .ui-rail:hover, .ui-rail:focus-within { width:320px;
      box-shadow:0 18px 40px -14px rgba(0,0,0,.28); max-height:calc(100vh - 100px); overflow-y:auto; }
    .ui-rail:hover .ui-rail-strip, .ui-rail:focus-within .ui-rail-strip { display:none; }
    .ui-rail:hover .ui-rail-full,  .ui-rail:focus-within .ui-rail-full  { display:block; }
  }
  /* stage track */
  .ui-stage { display:flex; gap:3px; }
  .ui-stage button { flex:1; border:none; cursor:pointer; padding:9px 4px 8px;
    font-size:11.5px; font-weight:600; font-family:${T.sans}; text-align:center;
    line-height:1.15; position:relative; }
  .ui-stage button:first-child { border-radius:8px 0 0 8px; }
  .ui-stage button:last-child { border-radius:0 8px 8px 0; }
  .ui-vw button:hover { color:${T.ink}; }
  .ui-menu { position:absolute; z-index:40; background:#fff; border:1px solid ${T.line};
    border-radius:9px; box-shadow:0 12px 30px -10px rgba(0,0,0,.25); padding:5px; min-width:180px; }
  .ui-menu button { display:block; width:100%; text-align:left; border:none; background:none;
    padding:8px 11px; font-size:13px; border-radius:6px; cursor:pointer; color:${T.ink}; font-family:${T.sans}; }
  .ui-menu button:hover { background:${T.linen}; }
  .ui-menu button.on { color:${T.acc}; font-weight:600; }
  `;
  const el = document.createElement("style");
  el.id = "ui-desk-css"; el.textContent = css;
  (document.head || document.documentElement).appendChild(el);
})();

// ---------------------------------------------------------------------------
// BUTTONS — pri (charcoal) · metal (ochre, money/won) · ghost · danger · icon
// ---------------------------------------------------------------------------
const BTN_BASE = "font-family:" + T.sans + "; font-weight:600; font-size:13px; border-radius:8px; padding:9px 15px; border:1px solid transparent; cursor:pointer; display:inline-flex; align-items:center; gap:7px; line-height:1;";
const BTN = {
  pri:    "background:" + T.char + "; color:#fff;",
  metal:  "background:" + T.acc + "; color:#fff;",
  ghost:  "background:#fff; color:" + T.ink + "; border-color:" + T.line + ";",
  danger: "background:#fff; color:" + T.overdue + "; border-color:#E4C4C0;",
  icon:   "background:#fff; color:" + T.muted + "; border-color:" + T.line + "; padding:9px;",
};
function button(variant, props, ...children) {
  const v = BTN[variant] || BTN.pri;
  const extra = (props && props.style) || "";
  const p = Object.assign({}, props, { style: sty(BTN_BASE, v, typeof extra === "string" ? extra : "") });
  return btn(p, ...children);
}

// ---------------------------------------------------------------------------
// PILLS — stage (filled tint) · source (outline) · plain
// stageInfo/sourceColor come straight from theme so they stay data-signals.
// ---------------------------------------------------------------------------
function stagePill(name, opts) {
  const s = THEME.stage[name] || THEME.stage.New;
  const small = opts && opts.small;
  return span({ style: "display:inline-flex; align-items:center; gap:5px; font-size:" + (small ? "11px" : "11.5px") + "; font-weight:600; border-radius:20px; padding:" + (small ? "2px 8px" : "3px 9px") + "; color:" + s.color + "; background:" + s.tint + ";" },
    span({ style: "width:6px; height:6px; border-radius:50%; background:" + s.color + ";" }),
    s.label);
}
function sourcePill(name) {
  const c = (THEME.source[name] && THEME.source[name].color) || T.muted;
  return span({ style: "display:inline-flex; align-items:center; font-size:11px; font-weight:600; border:1px solid " + c + "; color:" + c + "; border-radius:5px; padding:2px 8px;" }, name);
}
function statusPill(name) {
  const s = THEME.status[name] || THEME.status.Closed;
  return span({ style: "display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:600; border-radius:20px; padding:3px 9px; color:" + s.color + "; background:" + s.tint + ";" },
    span({ style: "width:6px; height:6px; border-radius:50%; background:" + s.color + ";" }), s.label);
}
// count badge (used on nav)
function countBadge(n, active) {
  return span({ style: "font-size:10px; font-weight:700; border-radius:20px; padding:1px 7px; " + (active ? "background:" + T.acc + "; color:#fff;" : "background:rgba(255,255,255,.12); color:#dcdcd6;") }, String(n));
}

// ---------------------------------------------------------------------------
// MONEY — ₹ figures are first-class serif tabular objects in the accent colour.
// ---------------------------------------------------------------------------
function rupee(label, opts) {
  const size = (opts && opts.size) || "15px";
  const won = opts && opts.won; // won also uses accent (it's the same metal)
  return span({ style: "font-family:" + T.serif + "; font-weight:600; font-variant-numeric:tabular-nums; color:" + T.acc + "; font-size:" + size + ";" }, label);
}

// ---------------------------------------------------------------------------
// AVATAR — agent initials chip
// ---------------------------------------------------------------------------
function avatar(initials, color, size) {
  const d = size || 24;
  return span({ style: "width:" + d + "px; height:" + d + "px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:" + Math.round(d * 0.42) + "px; font-weight:700; color:#fff; background:" + (color || T.char) + "; flex-shrink:0;" }, initials);
}

// ---------------------------------------------------------------------------
// INPUTS — text · segmented control · quick-chip · date/time
// ---------------------------------------------------------------------------
const INP_BASE = "width:100%; border:1px solid " + T.line + "; border-radius:8px; padding:9px 11px; font-size:13px; background:#fff; font-family:" + T.sans + "; color:" + T.ink + ";";
function input(props) {
  const extra = (props && props.style) || "";
  return h("input", Object.assign({}, props, { style: sty(INP_BASE, extra) }));
}
function segmented(options, activeVal, onPick, opts) {
  const full = opts && opts.full;
  const wrap = div({ style: "display:inline-flex; " + (full ? "width:100%; " : "") + "border:1px solid " + T.line + "; border-radius:8px; overflow:hidden;" });
  options.forEach((o, i) => {
    const val = typeof o === "string" ? o : o.value;
    const label = typeof o === "string" ? o : o.label;
    const on = val === activeVal;
    wrap.appendChild(btn({ onClick: () => onPick && onPick(val),
      style: (full ? "flex:1; " : "") + "border:none; " + (i ? "border-left:1px solid " + T.line + "; " : "") + "background:" + (on ? T.char : "#fff") + "; color:" + (on ? "#fff" : T.muted) + "; padding:7px 13px; font-size:12.5px; font-weight:600; cursor:pointer; font-family:" + T.sans + ";" }, label));
  });
  return wrap;
}
function chip(label, on, onClick) {
  return btn({ onClick, style: "border:1px solid " + (on ? T.char : T.line) + "; background:" + (on ? T.char : "#fff") + "; color:" + (on ? "#fff" : T.ink) + "; padding:5px 11px; border-radius:20px; font-size:12px; cursor:pointer; font-family:" + T.sans + ";" }, label);
}

// ---------------------------------------------------------------------------
// SECTION HEADER — uppercase micro-label, optional right slot
// ---------------------------------------------------------------------------
function sectionHead(label, rightNode) {
  return div({ style: "display:flex; align-items:center; justify-content:space-between; margin:0 0 12px;" },
    span({ style: "font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:" + T.muted + "; font-weight:700;" }, label),
    rightNode || null);
}

// ---------------------------------------------------------------------------
// CARD — one frame with slots. Property / lead / person cards reuse this.
// ---------------------------------------------------------------------------
function card(props, ...children) {
  const extra = (props && props.style) || "";
  return div(Object.assign({}, props, { style: sty("background:" + T.card + "; border:1px solid " + T.line + "; border-radius:11px;", extra) }), ...children);
}
// property card with a house-glyph thumbnail + status badge
function propertyCard(model) {
  const thumbBg = model.thumbBg || "#E7EFF4";
  const thumbInk = model.thumbInk || "#3A7CA5";
  return card({ onClick: model.onOpen, style: "overflow:hidden; cursor:pointer; width:100%;" },
    div({ style: "height:82px; display:flex; align-items:center; justify-content:center; position:relative; background:" + thumbBg + ";" },
      sIcon(30, 30, thumbInk, 1.5, '<path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/>'),
      model.status ? span({ style: "position:absolute; top:7px; left:7px; font-size:10px; font-weight:600; padding:2px 8px; border-radius:20px; color:#fff; background:" + (THEME.status[model.status] ? THEME.status[model.status].color : T.muted) + ";" }, model.status) : null),
    div({ style: "padding:11px 13px;" },
      div({ style: "font-weight:600; font-size:13.5px;" }, model.society),
      div({ style: "font-size:11.5px; color:" + T.muted + ";" }, model.line || model.title),
      div({ style: "display:flex; align-items:baseline; justify-content:space-between; margin-top:7px;" },
        rupee(model.priceLabel, { size: "17px" }),
        model.meta ? span({ style: "font-size:11px; color:" + T.muted + ";" }, model.meta) : null)));
}

// ---------------------------------------------------------------------------
// TABLE — dense, sortable-looking collection. columns:[{key,label,align,sortable}]
// rows: array of {cells:[node|string], onClick, active}
// ---------------------------------------------------------------------------
function table(columns, rows, opts) {
  opts = opts || {};
  const sortKey = opts.sortKey;
  const tbl = h("table", { style: "width:100%; border-collapse:collapse; font-size:14px; font-family:" + T.sans + ";" });
  const thead = h("thead");
  const trh = h("tr");
  columns.forEach(c => {
    const th = h("th", { className: "ui-th" + (c.onSort ? " sortable" : ""), onClick: c.onSort || null,
      style: "text-align:" + (c.align || "left") + "; font-size:11px; letter-spacing:.07em; text-transform:uppercase; color:" + T.muted + "; font-weight:700; padding:13px 22px; border-bottom:1px solid " + T.line + "; background:" + T.linenHi + "; white-space:nowrap; position:sticky; top:0; z-index:1;" },
      c.label,
      c.key === sortKey ? span({ style: "color:" + T.acc + "; margin-left:4px;" }, opts.sortDir === "asc" ? "▲" : "▼") : null);
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  tbl.appendChild(thead);
  const tbody = h("tbody");
  rows.forEach(r => {
    const tr = h("tr", { className: "ui-tr" + (r.active ? " on" : ""), onClick: r.onClick || null,
      style: "cursor:" + (r.onClick ? "pointer" : "default") + ";" + (r.active ? " box-shadow:inset 3px 0 0 " + T.acc + ";" : "") });
    r.cells.forEach((cell, i) => tr.appendChild(h("td", { style: "padding:15px 22px; border-bottom:1px solid " + T.line + "; text-align:" + (columns[i] && columns[i].align || "left") + "; vertical-align:middle;" },
      typeof cell === "object" && cell && cell.nodeType ? cell : document.createTextNode(cell == null ? "" : String(cell)))));
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  return tbl;
}

// ---------------------------------------------------------------------------
// VIEW SWITCH — list / cards / board icon toggle (shared everywhere).
// views:[{key:'list'|'cards'|'board', on, onClick}]
// ---------------------------------------------------------------------------
const VIEW_GLYPH = {
  list:  '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  table: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  cards: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  board: '<rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="15" rx="1"/>',
  agenda:'<path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>',
};
function viewSwitch(views) {
  const wrap = div({ className: "ui-vw", style: "display:inline-flex; border:1px solid " + T.line + "; border-radius:8px; overflow:hidden; background:#fff;" });
  views.forEach((v, i) => wrap.appendChild(btn({ onClick: v.onClick, title: v.key,
    style: "border:none; " + (i ? "border-left:1px solid " + T.line + "; " : "") + "background:" + (v.on ? T.char : "#fff") + "; color:" + (v.on ? "#fff" : T.muted) + "; padding:8px 10px; cursor:pointer; display:flex; align-items:center;" },
    sIcon(16, 16, "currentColor", 2, VIEW_GLYPH[v.key] || VIEW_GLYPH.list))));
  return wrap;
}
// simple dropdown menu anchored to a trigger button (sort, etc.)
function menu(triggerLabel, items, activeVal) {
  const wrap = div({ style: "position:relative;" });
  const panel = div({ className: "ui-menu", style: "display:none; right:0; top:calc(100% + 5px);" });
  items.forEach(it => panel.appendChild(btn({ className: (it.value === activeVal ? "on" : ""), onClick: () => { panel.style.display = "none"; it.onClick && it.onClick(); } }, it.label)));
  const trig = btn({ className: "ui-btn", onClick: (e) => { e.stopPropagation(); const open = panel.style.display === "block"; panel.style.display = open ? "none" : "block"; },
    style: "display:inline-flex; align-items:center; gap:6px; font-size:13px; color:" + T.ink + "; border:1px solid " + T.line + "; background:#fff; padding:8px 13px; border-radius:8px; cursor:pointer; font-family:" + T.sans + "; font-weight:500;" }, triggerLabel, span({ style: "color:" + T.muted + ";" }, "▾"));
  document.addEventListener("click", () => { panel.style.display = "none"; });
  wrap.appendChild(trig); wrap.appendChild(panel);
  return wrap;
}

// ---------------------------------------------------------------------------
// FILTER-SORT BAR — the ONE toolbar every module uses (§5c).
//   [ segments (pill group) ]   [ filter chips ]  ·······  [ sort ▾ ] [ view ]
// model: { segments:[{label,count,on,onClick}], filters:[{label,on,onClick}],
//          sort:{label, options:[{label,value,onClick}], value}, views:[...] }
// ---------------------------------------------------------------------------
function filterBar(model) {
  const bar = div({ style: "display:flex; align-items:center; gap:12px; padding:12px 26px; border-bottom:1px solid " + T.line + "; background:" + T.linen + "; flex-wrap:wrap;" });
  // segments — a connected pill group (the module's primary slices)
  if (model.segments && model.segments.length) {
    const seg = div({ style: "display:inline-flex; background:#fff; border:1px solid " + T.line + "; border-radius:9px; padding:3px; gap:2px;" });
    model.segments.forEach(s => seg.appendChild(btn({ onClick: s.onClick,
      style: "border:none; background:" + (s.on ? T.char : "transparent") + "; color:" + (s.on ? "#fff" : T.muted) + "; padding:7px 13px; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer; font-family:" + T.sans + "; display:inline-flex; align-items:center; gap:7px;" },
      s.label,
      s.count != null ? span({ style: "font-size:11px; font-weight:700; padding:0 6px; border-radius:10px; background:" + (s.on ? "rgba(255,255,255,.18)" : T.linenHi) + "; color:" + (s.on ? "#fff" : T.muted) + ";" }, String(s.count)) : null)));
    bar.appendChild(seg);
  }
  // secondary filter chips
  (model.filters || []).forEach(f => bar.appendChild(chip(f.label, f.on, f.onClick)));
  bar.appendChild(span({ style: "flex:1; min-width:12px;" }));
  // sort dropdown
  if (model.sort) bar.appendChild(menu("Sort: " + model.sort.label, model.sort.options, model.sort.value));
  // view switch
  if (model.views) bar.appendChild(viewSwitch(model.views));
  return bar;
}

// ---------------------------------------------------------------------------
// FOLLOW-UP SCHEDULER (§5e) — action type · quick chips · native date+time.
// state: {action:'call'|'site'|'meeting', quick, date, time}
// handlers: onAction(v) onQuick(v) onDate(e) onTime(e) onSave()
// Quick chips map to concrete dates; "Pick date…" reveals the native inputs.
// ---------------------------------------------------------------------------
function scheduler(model) {
  const box = div({ style: "border:1px solid " + T.line + "; border-radius:11px; background:#fff; padding:14px;" });
  box.appendChild(span({ style: "display:block; font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:" + T.muted + "; font-weight:700; margin-bottom:8px;" }, "Action"));
  box.appendChild(segmented(
    [{ value: "call", label: "Call" }, { value: "site", label: "Site visit" }, { value: "meeting", label: "Meeting" }],
    model.action, model.onAction, { full: true }));
  box.appendChild(span({ style: "display:block; font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:" + T.muted + "; font-weight:700; margin:12px 0 8px;" }, "When"));
  const chips = div({ style: "display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;" });
  [["today", "Today"], ["tomorrow", "Tomorrow"], ["weekend", "This weekend"], ["pick", "Pick date…"]].forEach(([v, l]) =>
    chips.appendChild(chip(l, model.quick === v, () => model.onQuick && model.onQuick(v))));
  box.appendChild(chips);
  const di = div({ style: "display:flex; gap:8px;" },
    input({ type: "date", value: model.date || "", onChange: model.onDate, style: "font-size:12.5px;" }),
    input({ type: "time", value: model.time || "", onChange: model.onTime, style: "font-size:12.5px;" }));
  box.appendChild(di);
  box.appendChild(button("pri", { onClick: model.onSave, style: "width:100%; justify-content:center; margin-top:11px;" }, model.saveLabel || "Schedule — adds to calendar"));
  if (model.savedMsg) box.appendChild(div({ style: "margin-top:9px; display:flex; align-items:center; gap:7px; font-size:12px; color:" + THEME.signal.success + "; font-weight:600;" },
    sIcon(14, 14, THEME.signal.success, 2.6, '<path d="M20 6 9 17l-5-5"/>'), model.savedMsg));
  return box;
}

// ---------------------------------------------------------------------------
// TOAST — charcoal chip, accent check.
// ---------------------------------------------------------------------------
function toast(text, tone) {
  const isErr = tone === "error";
  return div({ style: "display:inline-flex; align-items:center; gap:9px; background:" + (isErr ? "#5A2C27" : T.char) + "; color:#fff; border-radius:9px; padding:11px 15px; font-size:13px; font-family:" + T.sans + "; box-shadow:0 8px 20px -8px rgba(0,0,0,.4);" },
    sIcon(15, 15, isErr ? "#E7B8B2" : T.acc, 2.4, isErr ? '<path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="10"/>' : '<path d="M20 6 9 17l-5-5"/>'),
    text);
}

// ---------------------------------------------------------------------------
// EMPTY STATE — invitation to act.
// ---------------------------------------------------------------------------
function emptyState(title, sub, action) {
  return div({ style: "text-align:center; color:" + T.muted + "; padding:34px 18px; border:1px dashed " + T.line + "; border-radius:11px;" },
    div({ style: "font-family:" + T.serif + "; font-size:17px; color:" + T.ink + "; margin-bottom:5px;" }, title),
    sub ? div({ style: "font-size:12.5px;" }, sub) : null,
    action ? div({ style: "margin-top:12px;" }, button("ghost", { onClick: action.onClick }, action.label)) : null);
}

// ---------------------------------------------------------------------------
// NEXT-BEST-ACTION banner — charcoal, ochre glyph, one CTA.
// ---------------------------------------------------------------------------
function nbaBanner(model) {
  return div({ style: "display:flex; align-items:center; gap:13px; background:" + T.char + "; color:#fff; border-radius:10px; padding:13px 15px;" },
    span({ style: "width:40px; height:40px; border-radius:9px; background:rgba(255,255,255,.1); display:flex; align-items:center; justify-content:center; flex-shrink:0;" },
      sIcon(19, 19, T.acc, 2, '<path d="' + (model.iconPath || "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.4 2.5 1.2 3.6.6 4.7L8 9.6a16 16 0 0 0 6 6l1.2-1.2 4.7.6a2 2 0 0 1 1.7 2Z") + '"/>')),
    div({ style: "min-width:0;" },
      span({ style: "display:block; font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:" + T.accT + "; font-weight:700;" }, model.label || "Next best action"),
      span({ style: "display:block; font-family:" + T.serif + "; font-size:16px; margin-top:2px;" }, model.title)),
    span({ style: "flex:1;" }),
    model.cta ? button("metal", { onClick: model.cta.onClick, style: "background:" + T.acc + "; white-space:nowrap;" }, model.cta.label) : null);
}

// ---------------------------------------------------------------------------
// STAGE TRACK — a single-line connected progress stepper (fixes the broken
// wrapping chip-row). Past = tinted, current = filled ochre, future = muted.
// stages:[{name, state:'done'|'current'|'todo'|'lost', onClick}]
// The terminal "Closed Lost" is offered separately as a quiet mark-lost link.
// ---------------------------------------------------------------------------
function stageTrack(stages, onLost) {
  const track = div({ className: "ui-stage" });
  stages.forEach(s => {
    const bg = s.state === "current" ? T.acc : s.state === "done" ? T.accT : "#EFEDE6";
    const fg = s.state === "current" ? "#fff" : s.state === "done" ? "#7A5410" : "#A6A49C";
    track.appendChild(btn({ onClick: s.onClick, title: s.name, style: "background:" + bg + "; color:" + fg + ";" }, s.name));
  });
  const wrap = div(null, track);
  if (onLost) wrap.appendChild(div({ style: "margin-top:9px; text-align:right;" },
    btn({ onClick: onLost.onClick, className: "ui-btn", style: "background:none; border:none; cursor:pointer; font-size:12px; color:" + T.muted + "; font-family:" + T.sans + "; text-decoration:underline; text-underline-offset:2px; padding:0;" }, onLost.label || "Mark as lost")));
  return wrap;
}

// ---------------------------------------------------------------------------
// ACTION RAIL — ONE card that DOCKS to the right edge as a slim icon strip and
// EXPANDS ON HOVER into the full sectioned panel (overlay, not reflow).
//   model.strip:   [{ iconPath, accent, title, onClick }]  (collapsed view)
//   model.sections:[{ label, aside, node }]                (expanded view)
// The expanded panel is one card with hairline-divided sections (not N cards).
// ---------------------------------------------------------------------------
function actionRail(model) {
  const sections = model.sections || [];
  // collapsed strip — a single "Actions" tab: chevron + vertical label only.
  const stripEl = div({ className: "ui-rail-strip" },
    div({ className: "ui-rail-tab" },
      sIcon(16, 16, "currentColor", 2, '<path d="M15 6l-6 6 6 6"/>', { className: "chev" }),
      span({ className: "lbl" }, "Actions")));
  // expanded full panel — sectioned
  const fullEl = div({ className: "ui-rail-full" });
  sections.filter(Boolean).forEach((s, i) => {
    const block = div({ style: "padding:16px;" + (i ? " border-top:1px solid " + T.line + ";" : "") });
    if (s.label) block.appendChild(div({ style: "font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:" + T.muted + "; font-weight:700; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between;" }, s.label, s.aside || null));
    block.appendChild(s.node);
    fullEl.appendChild(block);
  });
  const railCard = div({ className: "ui-rail", tabindex: "0" }, stripEl, fullEl);
  return railCard;
}

// quick-action tile grid (used inside the rail)
function quickActions(items) {
  const grid = div({ style: "display:grid; grid-template-columns:1fr 1fr; gap:8px;" });
  items.forEach(a => grid.appendChild(btn({ onClick: a.onClick, className: "ui-qa",
    style: "background:#fff; border:1px solid " + T.line + "; border-radius:9px; padding:13px 6px; font-size:12px; cursor:pointer; color:" + T.ink + "; display:flex; flex-direction:column; gap:6px; align-items:center; font-family:" + T.sans + "; font-weight:500;" },
    sIcon(18, 18, T.muted, 1.9, '<path d="' + a.iconPath + '"/>'), a.label)));
  return grid;
}

// ---------------------------------------------------------------------------
// MODULE SHELL — the one skeleton every collection module snaps into (§5c):
//   [ filterBar ] + [ scrollable content per view-mode ]
// ---------------------------------------------------------------------------
function moduleShell(filterModel, content) {
  const scroll = div({ style: "flex:1; overflow:auto; min-height:0;" }, content);
  return div({ style: "flex:1; display:flex; flex-direction:column; min-height:0;" }, filterBar(filterModel), scroll);
}

// DETAIL SHELL — record header + content with a right-docked ActionRail (§5c).
// The rail floats to the right edge as a slim strip and expands on hover; the
// content keeps its right padding reserved so nothing hides behind the strip.
//   header: node. main: node. rail: node (from actionRail()).
function detailShell(headerNode, mainNode, railNode) {
  const body = div({ className: "ui-detail" }, div({ style: "min-width:0;" }, mainNode), railNode);
  const scroll = div({ style: "flex:1; overflow:auto; min-height:0;" });
  if (headerNode) scroll.appendChild(headerNode);
  scroll.appendChild(body);
  return div({ style: "flex:1; display:flex; flex-direction:column; min-height:0;" }, scroll);
}

// ---------------------------------------------------------------------------
// DESK SHELL — charcoal sidebar (labelled sections) + main column.
// nav: [{sectionLabel} | {label, iconPath, active, badge, onClick}]
// header: {title, count, onSearch, onAdd, addLabel}  (title serif)
// body: node rendered in the scrollable main area.
// ---------------------------------------------------------------------------
function deskSidebar(model) {
  const B = THEME.brand;
  const rail = h("nav", { style: "width:214px; flex-shrink:0; background:" + T.char + "; color:#c9c9c4; display:flex; flex-direction:column;" });
  rail.appendChild(div({ style: "padding:16px 18px 14px; border-bottom:1px solid rgba(255,255,255,.08);" },
    div({ style: "width:38px; height:38px; border:1.5px solid " + T.acc + "; border-radius:5px; display:flex; align-items:center; justify-content:center; font-family:" + T.serif + "; font-weight:600; color:" + T.acc + "; font-size:15px;" }, B.initials),
    div({ style: "font-family:" + T.serif + "; font-size:16px; font-weight:600; color:#fff; margin-top:10px;" }, B.firmName),
    div({ style: "font-size:11px; color:#8b8b85; margin-top:2px;" }, B.officeLine)));
  const navWrap = div({ style: "flex:1; padding:10px; overflow-y:auto;" });
  (model.nav || []).forEach(n => {
    if (n.sectionLabel) { navWrap.appendChild(div({ style: "font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:#7c7c76; margin:12px 10px 5px; font-weight:600;" }, n.sectionLabel)); return; }
    navWrap.appendChild(btn({ onClick: n.onClick,
      style: "display:flex; align-items:center; gap:10px; width:100%; padding:8px 12px; font-size:13px; text-decoration:none; border:none; border-radius:7px; margin-bottom:1px; cursor:pointer; font-family:" + T.sans + "; background:" + (n.active ? T.linen : "transparent") + "; color:" + (n.active ? T.char : "#b6b6b0") + "; font-weight:" + (n.active ? "600" : "500") + ";" },
      span({ style: "width:16px; display:flex; align-items:center; justify-content:center; color:" + (n.active ? T.acc : "inherit") + ";" }, sIcon(16, 16, "currentColor", 1.9, n.iconPath)),
      span({ style: "flex:1; text-align:left;" }, n.label),
      (n.badge != null) ? countBadge(n.badge, n.active) : null));
  });
  rail.appendChild(navWrap);
  if (model.footer) {
    rail.appendChild(div({ style: "padding:11px 16px; border-top:1px solid rgba(255,255,255,.08); font-size:11px; color:#8b8b85; display:flex; align-items:center; gap:9px;" },
      avatar(model.footer.initials || "RS", T.acc, 28),
      div({ style: "flex:1; min-width:0;" }, div({ style: "font-size:12px; font-weight:600; color:#e6e6e0;" }, model.footer.name), div({ style: "font-size:10.5px;" }, model.footer.role)),
      model.footer.onSwitch ? btn({ onClick: model.footer.onSwitch, title: "Switch to agent app", style: "background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.14); border-radius:7px; padding:6px; cursor:pointer; display:flex;" }, sIcon(15, 15, T.acc, 2, '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>')) : null));
  }
  return rail;
}
function deskHeader(model) {
  return div({ style: "display:flex; align-items:center; gap:14px; padding:15px 22px; border-bottom:1px solid " + T.line + "; flex-shrink:0; background:" + T.linen + ";" },
    model.crumb ? div({ style: "display:flex; align-items:center; gap:8px;" },
      model.crumb.onBack ? btn({ onClick: model.crumb.onBack, style: "background:none; border:none; cursor:pointer; color:" + T.acc + "; font-size:12.5px; padding:0; font-family:" + T.sans + ";" }, model.crumb.parent) : span({ style: "font-size:12.5px; color:" + T.muted + ";" }, model.crumb.parent),
      span({ style: "color:" + T.muted + "; font-size:12.5px;" }, "›")) : null,
    h("h1", { style: "font-family:" + T.serif + "; font-size:21px; font-weight:600; margin:0;" }, model.title),
    model.count ? span({ style: "font-size:12px; color:" + T.muted + "; border:1px solid " + T.line + "; border-radius:20px; padding:2px 10px;" }, model.count) : null,
    span({ style: "flex:1;" }),
    model.onSearch ? btn({ onClick: model.onSearch, style: "display:flex; align-items:center; gap:8px; border:1px solid " + T.line + "; background:#fff; border-radius:8px; padding:8px 12px; font-size:12.5px; color:" + T.muted + "; width:210px; cursor:pointer; font-family:" + T.sans + ";" },
      sIcon(14, 14, T.muted, 2, '<circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/>'), model.searchLabel || "Search…") : null,
    (model.actions || []).map(a => a),
    model.onAdd ? button("pri", { onClick: model.onAdd }, "+ " + (model.addLabel || "New")) : null);
}
// full desktop chrome: sidebar + [header, filter?, body]
function deskShell(sidebarModel, headerNode, bodyNodes) {
  const main = div({ style: "flex:1; display:flex; flex-direction:column; min-width:0; overflow:hidden;" });
  if (headerNode) main.appendChild(headerNode);
  (Array.isArray(bodyNodes) ? bodyNodes : [bodyNodes]).forEach(n => n && main.appendChild(n));
  return div({ style: "display:flex; height:100vh; background:" + T.linen + "; color:" + T.ink + "; font-family:" + T.sans + ";" },
    deskSidebar(sidebarModel), main);
}

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------
window.__ui = {
  T,
  button, BTN, BTN_BASE,
  stagePill, sourcePill, statusPill, countBadge, rupee, avatar,
  input, segmented, chip, menu,
  sectionHead, card, propertyCard, table,
  filterBar, viewSwitch,
  scheduler, toast, emptyState, nbaBanner,
  stageTrack, actionRail, quickActions, moduleShell, detailShell,
  deskSidebar, deskHeader, deskShell,
};
})();
