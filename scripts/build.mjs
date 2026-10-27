import {copyFile,mkdir,cp,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const scripts=['app.js','core.js','dialogs.js','page-access.js','agent.js','agent-run.js','skills.js','memory.js','tasks.js','checkin.js','background.js','ocr.js'];
for(const file of scripts)await copyFile(path.join(root,'src',file),path.join(root,'dist',file));
await copyFile(path.join(root,'src','manifest.json'),path.join(root,'dist','manifest.json'));
// Vendored OCR engine (see vendor/VENDOR.md). Copied, never downloaded at runtime.
await cp(path.join(root,'vendor','tesseract'),path.join(root,'dist','vendor','tesseract'),{recursive:true});
const vendored=await stat(path.join(root,'dist','vendor','tesseract','lang','eng.traineddata.gz'));
if(!vendored.isFile())throw Error('dist/vendor/tesseract is incomplete');
console.log(`Built ${scripts.length} extension modules and the vendored OCR engine into dist/.`);
