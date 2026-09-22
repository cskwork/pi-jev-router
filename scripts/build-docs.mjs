import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { marked } from 'marked';

const root = new URL('../', import.meta.url);
const repoUrl = 'https://github.com/cskwork/pi-jev-router';
const repoBlob = `${repoUrl}/blob/main/`;
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));

const ui = {
  ko: { toc: '목차', start: '설치 가이드', github: 'GitHub에서 보기', copy: '복사', copied: '복사됨', langNav: '언어 선택', skip: '본문으로 건너뛰기' },
  en: { toc: 'On this page', start: 'Get started', github: 'View on GitHub', copy: 'Copy', copied: 'Copied', langNav: 'Language', skip: 'Skip to content' },
};

const escapeAttr = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const slugify = text => text
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, '').toLowerCase().trim()
  .replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-');

const source = file => readFileSync(new URL(file, root), 'utf8')
  .replaceAll('](README.en.md)', '](?lang=en)').replaceAll('](README.md)', '](?lang=ko)')
  .replaceAll('](examples/web-development.json)', `](${repoBlob}examples/web-development.json)`)
  .replaceAll('](LICENSE)', `](${repoBlob}LICENSE)`);

const wrapTables = html => html.replaceAll('<table>', '<div class="table-wrap"><table>').replaceAll('</table>', '</table></div>');

function render(file, lang) {
  const t = ui[lang];
  const tokens = marked.lexer(source(file));
  const ids = new Set();
  const renderer = {
    heading({ tokens: inline, depth, text }) {
      const body = this.parser.parseInline(inline);
      if (depth !== 2) return `<h${depth}>${body}</h${depth}>\n`;
      const id = `${lang}-${slugify(text)}`;
      return `<h2 id="${id}"><a class="anchor" href="#${id}">${body}</a></h2>\n`;
    },
  };
  marked.use({ renderer });

  // Intro = everything before the first h2. The first paragraph holds the README language switch, which the header replaces.
  const firstSection = tokens.findIndex(token => token.type === 'heading' && token.depth === 2);
  const intro = tokens.slice(0, firstSection);
  const title = intro.find(token => token.type === 'heading' && token.depth === 1);
  const paragraphs = intro.filter(token => token.type === 'paragraph' && !token.raw.includes('?lang='));
  const [lede, ...rest] = paragraphs;

  const sections = [];
  let current = null;
  for (const token of tokens.slice(firstSection)) {
    if (token.type === 'heading' && token.depth === 2) {
      current = { title: token.text, id: `${lang}-${slugify(token.text)}`, tokens: [token] };
      if (ids.has(current.id)) throw new Error(`duplicate section id ${current.id} in ${file}`);
      ids.add(current.id);
      sections.push(current);
    } else if (current) {
      current.tokens.push(token);
    }
  }

  const toc = sections.map(section => `<li><a href="#${section.id}">${marked.parseInline(section.title)}</a></li>`).join('');
  const hero = `<section class="hero">
<h1>${marked.parseInline(title.text)}</h1>
<p class="lede">${marked.parseInline(lede.text)}</p>
<div class="install" role="group" aria-label="pi install"><code>pi install npm:pi-router-jev</code><button type="button" class="copy" data-copy="pi install npm:pi-router-jev">${t.copy}</button></div>
<p class="actions"><a class="button primary" href="#${sections[0].id}">${t.start}</a><a class="button" href="${repoUrl}">${t.github}</a></p>
</section>
${rest.map(token => `<p class="note">${marked.parseInline(token.text)}</p>`).join('\n')}`;

  const body = sections.map(section => `<section class="doc" aria-labelledby="${section.id}">${wrapTables(marked.parser(section.tokens))}</section>`).join('\n');
  return {
    toc: `<nav lang="${lang}" aria-label="${escapeAttr(t.toc)}"><p class="toc-title">${t.toc}</p><ol>${toc}</ol></nav>`,
    article: `<article lang="${lang}">\n${hero}\n${body}\n</article>`,
    copyLabels: `data-copy-${lang}="${escapeAttr(t.copy)}" data-copied-${lang}="${escapeAttr(t.copied)}"`,
  };
}

const ko = render('README.md', 'ko');
const en = render('README.en.md', 'en');

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pi router Jev · 사용 설명서 / Documentation</title>
<meta name="description" content="Pi 모델 라우팅: Claude, Codex, Jev 직접 API, 로컬 Laya multilingual. Korean and English setup, recovery, and SDLC Kit guidance.">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f7f7f4">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#13171a">
<meta property="og:title" content="Pi router Jev">
<meta property="og:description" content="Task-aware model routing for Pi with Jev, local multilingual Laya, Claude and Codex">
<meta property="og:image" content="https://cskwork.github.io/pi-jev-router/logo.png">
<link rel="icon" href="logo.png" type="image/png">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<script>
(() => {
  const explicit = new URLSearchParams(location.search).get('lang');
  const stored = localStorage.getItem('pi-router-jev.lang');
  const preferred = (navigator.languages || [navigator.language]).find(value => /^(ko|en)(-|$)/i.test(value));
  const pick = value => value === 'en' || value === 'ko' ? value : null;
  document.documentElement.lang = pick(explicit) || pick(stored) || (/^en(-|$)/i.test(preferred || '') ? 'en' : 'ko');
})();
</script>
<style>
:root{
  --canvas:#f7f7f4;--surface:#fdfdfb;--surface-2:#eef0eb;--ink:#1c211e;--muted:#5c655f;--line:#e0e4dd;
  --accent:#1f7a52;--accent-ink:#f4faf6;--accent-soft:#e6f2ea;--shadow:0 1px 2px rgba(28,33,30,.06);
  --radius:8px;--header:64px;--z-header:10;--z-copy:1;
  color-scheme:light dark;
  font-family:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,system-ui,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;
  font-size:16px;line-height:1.7;background:var(--canvas);color:var(--ink);
  -webkit-font-smoothing:antialiased;text-size-adjust:100%;
}
@media(prefers-color-scheme:dark){:root{
  --canvas:#13171a;--surface:#181d21;--surface-2:#1f262b;--ink:#e6eae7;--muted:#a3ada7;--line:#2a3237;
  --accent:#6fd9a6;--accent-ink:#0f1a15;--accent-soft:#1a2b23;--shadow:0 1px 2px rgba(0,0,0,.35); /* taste-ok: tinted dark-mode shadow on dark canvas */
}}
*,*::before,*::after{box-sizing:border-box}
html[lang=ko]{word-break:keep-all}
html[lang=ko] [lang=en],html[lang=en] [lang=ko]{display:none}
body{margin:0;min-height:100dvh}
a{color:var(--accent);text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:.2em;text-decoration-color:color-mix(in srgb,var(--accent) 45%,transparent)}
a:hover{text-decoration-color:var(--accent)}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:2px}
.skip{position:absolute;left:1rem;top:-3rem;z-index:var(--z-header);padding:.5rem .8rem;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius)}
.skip:focus{top:.6rem}

/* header */
.top{position:sticky;top:0;z-index:var(--z-header);height:var(--header);display:flex;align-items:center;gap:1.25rem;padding:0 max(1.25rem,calc((100% - 1120px)/2));background:var(--canvas);border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:.6rem;margin-right:auto;color:var(--ink);text-decoration:none;font-weight:600;letter-spacing:-.01em;white-space:nowrap}
.brand img{width:28px;height:28px;border-radius:7px}
.version{font-size:.75rem;font-weight:500;color:var(--muted);padding:.1rem .45rem;border:1px solid var(--line);border-radius:999px;font-variant-numeric:tabular-nums}
.lang{display:inline-flex;padding:2px;border:1px solid var(--line);border-radius:999px;background:var(--surface)}
.lang a{padding:.25rem .7rem;border-radius:999px;font-size:.85rem;color:var(--muted);text-decoration:none}
.lang a[aria-current=true]{background:var(--accent);color:var(--accent-ink);font-weight:600}
.top-links{display:flex;gap:1rem;font-size:.9rem}
.top-links a{color:var(--muted);text-decoration:none}
.top-links a:hover{color:var(--ink)}

/* layout */
.layout{display:grid;grid-template-columns:220px minmax(0,760px);gap:4rem;max-width:1120px;margin:0 auto;padding:2.5rem 1.25rem 6rem}
.side{position:sticky;top:calc(var(--header) + 2rem);align-self:start}
.side summary{display:none}
.toc-title{margin:0 0 .6rem;font-size:.75rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.side ol{list-style:none;margin:0;padding:0;border-left:1px solid var(--line)}
.side li a{display:block;padding:.3rem 0 .3rem .9rem;margin-left:-1px;border-left:1px solid transparent;font-size:.9rem;color:var(--muted);text-decoration:none;transition:color .15s,border-color .15s}
.side li a:hover{color:var(--ink)}
.side li a.active{color:var(--accent);border-left-color:var(--accent);font-weight:600}

/* hero */
.hero{padding:1rem 0 2.5rem;border-bottom:1px solid var(--line)}
.hero h1{margin:0 0 .9rem;font-size:clamp(2rem,4.5vw,2.75rem);line-height:1.15;letter-spacing:-.025em;font-weight:700}
.lede{margin:0 0 1.5rem;font-size:1.1rem;line-height:1.65;color:var(--muted);max-width:60ch}
.install{display:inline-flex;align-items:center;gap:.5rem;max-width:100%;margin-bottom:1.2rem;padding:.35rem .35rem .35rem .9rem;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius)}
.install code{font-size:.95rem;overflow-wrap:anywhere}
.actions{display:flex;flex-wrap:wrap;gap:.6rem;margin:0}
.button{display:inline-flex;align-items:center;min-height:44px;padding:0 1.1rem;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);color:var(--ink);font-weight:500;text-decoration:none;white-space:nowrap;transition:background .15s,border-color .15s}
.button:hover{border-color:var(--muted)}
.button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:600}
.button.primary:hover{filter:brightness(1.06)}
.note{margin:1.5rem 0 0;font-size:.95rem;color:var(--muted)}

/* content */
.doc{padding-top:3rem}
h2{margin:0 0 1rem;font-size:1.5rem;line-height:1.3;letter-spacing:-.015em;font-weight:700;scroll-margin-top:calc(var(--header) + 1.5rem)}
h2 .anchor{color:inherit;text-decoration:none}
h2 .anchor:hover::after{content:" #";color:var(--muted);font-weight:400}
h3{margin:2rem 0 .6rem;font-size:1.125rem;line-height:1.4;font-weight:600}
p,li{overflow-wrap:anywhere}
p{margin:0 0 1rem}
ul,ol{margin:0 0 1rem;padding-left:1.4rem}
li{margin:.35rem 0}
li::marker{color:var(--muted)}
strong{font-weight:600}
code{font-family:ui-monospace,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;font-size:.875em}
p code,li code,td code,th code{padding:.1em .35em;background:var(--surface-2);border-radius:4px}
pre{position:relative;margin:0 0 1.25rem;padding:1rem 1.1rem;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius);line-height:1.6;overflow:auto}
pre code{font-size:.875rem}
.copy{position:absolute;top:.5rem;right:.5rem;z-index:var(--z-copy);min-height:32px;padding:0 .7rem;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--muted);font:inherit;font-size:.8rem;cursor:pointer;transition:color .15s,border-color .15s}
.copy:hover{color:var(--ink);border-color:var(--muted)}
.copy[data-state=done]{color:var(--accent);border-color:var(--accent)}
.install .copy{position:static}
.table-wrap{margin:0 0 1.25rem;border:1px solid var(--line);border-radius:var(--radius);overflow:auto;box-shadow:var(--shadow)}
table{width:100%;border-collapse:collapse;font-size:.9rem;line-height:1.55}
th,td{padding:.65rem .85rem;text-align:left;vertical-align:top;border-top:1px solid var(--line)}
tr:first-child>th{border-top:0}
th{background:var(--surface-2);font-weight:600;white-space:nowrap}
img{max-width:100%;height:auto}

footer{border-top:1px solid var(--line);padding:1.5rem 1.25rem;font-size:.85rem;color:var(--muted);text-align:center}
footer a{color:inherit}

@media(max-width:900px){
  .layout{grid-template-columns:minmax(0,1fr);gap:1.5rem;padding-top:1.5rem}
  .side{position:static}
  .side details{border:1px solid var(--line);border-radius:var(--radius);background:var(--surface)}
  .side summary{display:flex;align-items:center;min-height:44px;padding:0 1rem;font-size:.9rem;font-weight:600;cursor:pointer;list-style:none}
  .side summary::-webkit-details-marker{display:none}
  .side summary::after{content:"+";margin-left:auto;color:var(--muted)}
  .side details[open] summary::after{content:"−"}
  .side nav{padding:.25rem 1rem .75rem}
  .side ol{border-left:0}
  .side li a{padding-left:0;border-left:0;min-height:40px;display:flex;align-items:center}
}
@media(max-width:640px){
  .top{gap:.75rem;padding:0 1rem}
  .top-links,.version{display:none}
  .lang a{padding:.25rem .6rem}
  .hero{padding-top:.5rem}
}
@media(prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
</head>
<body>
<a class="skip" href="#content" lang="ko">${ui.ko.skip}</a><a class="skip" href="#content" lang="en">${ui.en.skip}</a>
<header class="top">
  <a class="brand" href="./"><img src="logo.png" alt="" width="28" height="28">Pi router Jev<span class="version">v${version}</span></a>
  <nav class="lang" aria-label="${ui.ko.langNav} / ${ui.en.langNav}"><a data-lang="ko" href="?lang=ko" hreflang="ko">한국어</a><a data-lang="en" href="?lang=en" hreflang="en">English</a></nav>
  <nav class="top-links" aria-label="Links"><a href="${repoUrl}">GitHub</a><a class="secondary" href="https://www.npmjs.com/package/pi-router-jev">npm</a><a class="secondary" href="https://pi.dev/packages/pi-router-jev">Pi catalog</a></nav>
</header>
<main class="layout">
  <aside class="side"><details open><summary><span lang="ko">${ui.ko.toc}</span><span lang="en">${ui.en.toc}</span></summary>${ko.toc}${en.toc}</details></aside>
  <div id="content" ${ko.copyLabels} ${en.copyLabels}>
${ko.article}
${en.article}
  </div>
</main>
<footer>MIT · Original router by <a href="https://github.com/mejiasd3v/pi-jev-router">MejiasDev</a> · Fork by <a href="https://github.com/cskwork">cskwork</a></footer>
<script>
(() => {
  const html = document.documentElement;
  const content = document.getElementById('content');
  const label = key => content.dataset[key + (html.lang === 'en' ? 'En' : 'Ko')];

  const syncLang = () => {
    document.querySelectorAll('.lang a').forEach(a => a.setAttribute('aria-current', a.dataset.lang === html.lang ? 'true' : 'false'));
    document.querySelectorAll('.copy').forEach(b => { b.dataset.state = ''; b.textContent = label('copy'); });
  };
  document.querySelectorAll('.lang a').forEach(a => a.addEventListener('click', event => {
    event.preventDefault();
    html.lang = a.dataset.lang;
    localStorage.setItem('pi-router-jev.lang', html.lang);
    history.replaceState(null, '', '?lang=' + html.lang + location.hash);
    syncLang();
  }));

  document.querySelectorAll('pre > code').forEach(code => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy';
    button.dataset.copy = code.textContent;
    code.parentElement.appendChild(button);
  });
  content.addEventListener('click', async event => {
    const button = event.target.closest('.copy');
    if (!button || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.dataset.state = 'done';
      button.textContent = label('copied');
      setTimeout(() => { button.dataset.state = ''; button.textContent = label('copy'); }, 1600);
    } catch { button.textContent = label('copy'); }
  });
  syncLang();

  const links = new Map([...document.querySelectorAll('.side li a')].map(a => [a.getAttribute('href').slice(1), a]));
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      links.forEach(a => a.classList.remove('active'));
      links.get(entry.target.id)?.classList.add('active');
    }
  }, { rootMargin: '-15% 0px -70% 0px' });
  links.forEach((_, id) => { const target = document.getElementById(id); if (target) observer.observe(target); });

  const details = document.querySelector('.side details');
  const wide = matchMedia('(min-width: 901px)');
  const setToc = () => { details.open = wide.matches; };
  setToc();
  wide.addEventListener('change', setToc);
})();
</script>
</body>
</html>
`;

mkdirSync(new URL('docs/', root), { recursive: true });
writeFileSync(new URL('docs/index.html', root), html);
writeFileSync(new URL('docs/.nojekyll', root), '');
copyFileSync(new URL('assets/logo.png', root), new URL('docs/logo.png', root));
console.log(`Built docs/index.html (v${version}) from both READMEs`);
