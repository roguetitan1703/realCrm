// Assembles the mock-ups: each _src/*.body.html becomes ../<name>.html with
// _base.css inlined, so every file is self-contained.
const fs = require('fs');
const path = require('path');
const src = __dirname;
const out = path.resolve(src, '..');
const css = fs.readFileSync(path.join(src, '_base.css'), 'utf8');
const pages = JSON.parse(fs.readFileSync(path.join(src, 'pages.json'), 'utf8'));

const font = '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@400;600;700&display=swap" rel="stylesheet">';

for (const p of pages) {
  const body = fs.readFileSync(path.join(src, p.file + '.body.html'), 'utf8');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${p.title}</title>${font}
<style>${css}</style></head>
<body>
<div class="page-head"><nav><a href="index.html">← All screens</a></nav><h1>${p.title}</h1><p>${p.blurb}</p></div>
${body}
</body></html>`;
  fs.writeFileSync(path.join(out, p.file + '.html'), html);
}

const idx = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Phone UI — fresh design</title>${font}
<style>${css}
.idx{max-width:900px;margin:0 auto}.idx li{list-style:none;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:8px}
.idx li a{font-weight:600;font-size:16px;text-decoration:none}.idx li p{color:var(--ink-2);font-size:14px;margin-top:2px}</style></head>
<body><div class="idx"><div class="page-head"><h1>The real estate CRM by Delpat — phone UI, from the flows</h1>
<p>Static mock-ups, 390×844 (and 360×640 where it matters). Read <code>flows.md</code> first; <code>decisions.md</code> holds what Om must decide. Names and numbers are fictional.</p></div>
<ul>${pages.map(p => `<li><a href="${p.file}.html">${p.title}</a><p>${p.blurb}</p></li>`).join('\n')}</ul></div></body></html>`;
fs.writeFileSync(path.join(out, 'index.html'), idx);
console.log('built', pages.length + 1, 'files');
