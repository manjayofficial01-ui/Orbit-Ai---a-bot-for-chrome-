import fs from 'node:fs';
import path from 'node:path';
const root = 'D:/0000 App Building with Gemini/Extension/2nd Orbit Ai Bot/dist';
const outDir = 'C:/Users/Manjay Dangol/AppData/Local/Temp/opencode/orbit-scroll-check';
fs.mkdirSync(outDir, { recursive: true });
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
html = html.replace('<link rel="stylesheet" href="styles.css">', `<style>\n${css}\n</style>`);
html = html.replace('<script type="module" src="app.js"></script>', '<!-- fixture: no app script -->');
const para = 'Based on the title alone, it appears to be a beginner-oriented comparison of different surfaces with the creator explaining which one they personally use for which tasks. ';
let msgs = `<article class="message user"><div class="role">You</div><div class="body">Summarize and explain this page</div></article>`;
msgs += `<article class="message assistant"><div class="role">Orbit</div><div class="body"><p>Here is what I can make of this page:</p>`;
for (let i = 0; i < 12; i++) msgs += `<p>Filler paragraph ${i + 1}. ${para}</p>`;
msgs += `</div></article>`;
html = html.replace('<section id="messages" tabindex="-1" aria-label="Conversation" aria-live="polite"></section>',
  `<section id="messages" tabindex="-1" aria-label="Conversation" aria-live="polite">${msgs}</section>`);
const out = path.join(outDir, 'fixture.html');
fs.writeFileSync(out, html, 'utf8');
console.log('wrote', out, html.length);
