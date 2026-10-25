import {copyFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const scripts=['app.js','core.js','page-access.js','agent.js','agent-run.js','background.js','reach-core.js','reach-client.js','research-protocol.js','research-loop.js'];
await mkdir(path.join(root,'dist','native-host'),{recursive:true});
for(const file of scripts)await copyFile(path.join(root,'src',file),path.join(root,'dist',file));
await copyFile(path.join(root,'src','manifest.json'),path.join(root,'dist','manifest.json'));
for(const file of ['orbit_reach_host.py','install.py'])await copyFile(path.join(root,'native-host',file),path.join(root,'dist','native-host',file));
console.log(`Built ${scripts.length} extension modules and the Reach native-host installer into dist/.`);
