import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { marked } from 'marked';
const root = new URL('../', import.meta.url);
const repo = 'https://github.com/cskwork/pi-jev-router/blob/main/';
const render = file => marked.parse(readFileSync(new URL(file, root), 'utf8')
  .replaceAll('](README.en.md)', '](?lang=en)').replaceAll('](README.md)', '](?lang=ko)')
  .replaceAll('](examples/web-development.json)', `](${repo}examples/web-development.json)`)
  .replaceAll('](LICENSE)', `](${repo}LICENSE)`));
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pi router Jev · 사용 설명서 / Documentation</title>
<meta name="description" content="Pi 모델 라우팅: Claude, Codex, Jev 직접 API, 로컬 Laya multilingual. Korean and English setup, recovery, and SDLC Kit guidance.">
<script>
const explicit = new URLSearchParams(location.search).get('lang');
const preferred = (navigator.languages || [navigator.language]).find(value => /^(ko|en)(-|$)/i.test(value));
document.documentElement.lang = explicit === 'en' || explicit === 'ko' ? explicit : /^en(-|$)/i.test(preferred || '') ? 'en' : 'ko';
</script>
<style>
:root{color-scheme:light dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.75;background:#f9f8f5;color:#252924}
body{margin:0}header{border-bottom:1px solid #d6dad2;padding:1rem max(1rem,calc((100% - 880px)/2));display:flex;gap:1.2rem;align-items:center;flex-wrap:wrap}header strong{margin-right:auto}a{color:#276545;text-underline-offset:.2em}a:focus-visible{outline:2px solid #276545;outline-offset:4px}main{max-width:880px;margin:2.5rem auto 5rem;padding:0 1.2rem}h1{font-size:2.3rem;line-height:1.25}h2{margin-top:2.5rem;line-height:1.4}h3{margin-top:2rem}p,li{overflow-wrap:anywhere}pre{overflow:auto;padding:1rem 1.2rem;background:#eef0e9;border:1px solid #d6dad2;border-radius:6px;line-height:1.55}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.88em}p code,li code,td code{background:#eef0e9;padding:.1rem .3rem;border-radius:3px}table{display:block;max-width:100%;overflow:auto;border-collapse:collapse;font-size:.92rem}th,td{text-align:left;padding:.65rem .8rem;border:1px solid #d6dad2;vertical-align:top}th{background:#eef0e9}img{max-width:100%;height:auto}html[lang=ko] article[lang=en],html[lang=en] article[lang=ko]{display:none}html[lang=ko] a[data-lang=ko],html[lang=en] a[data-lang=en]{font-weight:700}footer{border-top:1px solid #d6dad2;padding:1rem;text-align:center;color:#666}
@media(prefers-color-scheme:dark){:root{background:#171b18;color:#e5e9e3}a{color:#9bdbb4}header,footer,pre,th,td{border-color:#39433a}pre,p code,li code,td code,th{background:#242d25}footer{color:#abb5a9}}
@media(max-width:600px){main{margin-top:1.5rem}h1{font-size:1.85rem}header{gap:.8rem}}
</style></head><body>
<header><strong>Pi router Jev</strong><a data-lang="ko" href="?lang=ko" lang="ko">한국어</a><a data-lang="en" href="?lang=en" lang="en">English</a><a href="https://github.com/cskwork/pi-jev-router">GitHub</a><a href="https://pi.dev/packages/pi-router-jev">Pi catalog</a></header>
<main><article lang="ko">${render('README.md')}</article><article lang="en">${render('README.en.md')}</article></main>
<footer>MIT · Original router: MejiasDev · Fork: cskwork</footer></body></html>\n`;
mkdirSync(new URL('docs/', root), { recursive: true });
writeFileSync(new URL('docs/index.html', root), html);
writeFileSync(new URL('docs/.nojekyll', root), '');
console.log('Built docs/index.html from both READMEs');
