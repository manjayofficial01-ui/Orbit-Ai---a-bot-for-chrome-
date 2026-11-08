import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Static gates for the 4.0 surface: the roster, the inline cards, the voice and the
// routines. These live in browser-only paths, so this locks the shape that makes the
// behaviour hold; the pure logic is unit-tested in personas/cards/routines/voice.
const root=new URL('../',import.meta.url);
const [app,agentRun,html,styles,manifest,background]=await Promise.all([
  readFile(new URL('src/app.js',root),'utf8'),
  readFile(new URL('src/agent-run.js',root),'utf8'),
  readFile(new URL('dist/index.html',root),'utf8'),
  readFile(new URL('dist/styles.css',root),'utf8'),
  readFile(new URL('src/manifest.json',root),'utf8'),
  readFile(new URL('src/background.js',root),'utf8'),
]);

test('the roster is a first-class surface, not a setting',()=>{
  assert.match(html,/id="rosterStrip"[^>]*role="group"/,'the persona strip is a named group');
  assert.match(html,/id="rosterList"/);
  assert.match(html,/id="rosterAdd"[^>]*aria-label="Add a persona"/,'the add control is named');
  assert.match(app,/function renderRoster\(\)/);
  assert.match(app,/chip\.setAttribute\('aria-pressed',String\(ui\.rosterFilter===persona\.id\)\)/,'a chip says whether it is the active filter');
  assert.match(app,/function renderPersonaSwitch\(activeId\)/,'the persona panel switches as well as edits');
});

test('a persona never carries credentials',async()=>{
  const source=await readFile(new URL('src/personas.js',root),'utf8');
  assert.doesNotMatch(source,/\b(apiKey|key|token)\s*:/,'a persona record must not hold a credential field');
  assert.match(app,/const config=\(\)=>\{const persona=personaOfChat\(current\(\)\);/,'the persona contributes a model override and nothing else');
  assert.match(app,/\{model:persona\.model\}/,'only the model is taken from the persona');
});

test('the header pill carries the persona, the conversation and the model',()=>{
  assert.match(html,/id="chatHead"[^>]*aria-haspopup="dialog"/);
  assert.match(html,/id="chatHeadAvatar"/);
  assert.match(html,/id="chatPresence"/);
  assert.match(app,/function renderChatHead\(\)/);
  assert.match(app,/dot\.className='presence presence-'\+personaPresence\(persona\?\.id\)/);
});

test('presence distinguishes waiting on a person from working',()=>{
  assert.match(app,/function personaPresence\(id\)/);
  assert.match(app,/if\(chat&&\[\.\.\.cardResolvers\.values\(\)\]\.some\(e=>e\.chatId===chat\.id\)\)return 'waiting'/,'an open card is not progress');
  assert.match(app,/if\(task\?\.needsInput\)return 'waiting'/);
});

test('an approval is a card in the transcript, with a dialog only as the bare-document fallback',()=>{
  assert.match(app,/configureCards\(presentCard\)/,'the panel injects the presenter');
  assert.match(app,/function presentCard\(card\)/);
  assert.match(app,/cardResolvers\.set\(card\.requestId/);
  assert.match(app,/function answerCard\(card,choice\)/);
  assert.match(app,/settleCard\(card,choice\)/,'the answer is recorded on the card');
  assert.match(agentRun,/askCard\(\{[\s\S]{0,300}kind: 'approval'/,'the step gate asks through a card');
  assert.match(agentRun,/fallback: \(\) => askConfirm\(/,'a document with no panel still gets a real dialog');
  assert.doesNotMatch(app,/[^a-zA-Z.]confirm\(/,'window.confirm stays banned');
});

test('stopping a run releases every card it is blocked on',()=>{
  assert.match(app,/\$\('stop'\)\.onclick=\(\)=>\{cancelPendingCards\('Stopped'\);controller\?\.abort\(\);\}/);
  assert.match(app,/function cancelPendingCards\(reason\)/);
  assert.match(app,/finally\{cancelPendingCards\('Stopped'\);/,'the loop ending also settles whatever is open');
  assert.match(app,/if\(m\.card&&!isSettled\(m\.card\)\)settleCard\(m\.card,'Expired'\)/,'a card from a dead run is not still waiting');
});

test('what is waiting on you is one list, fed by cards, tasks and routines',()=>{
  assert.match(html,/id="needsSection"/);
  assert.match(html,/id="needsYou"[^>]*role="group"/);
  assert.match(app,/function needsEntries\(\)/);
  assert.match(app,/for\(const entry of cardResolvers\.values\(\)\)/);
  assert.match(app,/if\(task\.needsInput\)rows\.push/);
  assert.match(app,/for\(const routine of dueRoutines\(state\.routines,Date\.now\(\)\)\)/);
});

test('agent steps render as chips, and the transcript is not the model log',()=>{
  assert.match(app,/function activityRow\(line\)/);
  assert.match(app,/element\('details',undefined,'activity-block'\)/,'the run activity is a collapsible block');
  assert.match(app,/const parsed=\/\^\\\[\(\[a-z-\]\+\) · step \(\\d\+\)\\\]/,'the step line is parsed into a type and a number');
  assert.match(app,/answer\.activity=\(answer\.activity\|\|\[\]\)\.concat/,'steps go to activity, not to the answer body');
  assert.match(app,/answer\.content=res\.cancelled\?/,'the body is a one-line outcome');
});

test('an answer can be read aloud without a key or a network',()=>{
  assert.match(html,/id="speak"[^>]*aria-label="Read the last answer aloud"/);
  assert.match(html,/id="autoSpeak"/);
  assert.match(app,/import \{plainSpeech,speechAvailable,speak,stopSpeaking,voices\}/);
  assert.match(app,/if\(state\.autoSpeak&&speechAvailable\(\)\)speak\(/,'auto-read is opt-in and feature-detected');
  assert.match(styles,/\.skin-choices\{/,'the appearance panel styles the voice and skin controls');
});

test('a routine is scheduled, bounded, and never claims to run in the background',()=>{
  assert.match(html,/data-settings-panel="routines"/);
  assert.match(html,/id="routinesList"/);
  assert.match(app,/async function syncAlarms\(\)/);
  assert.match(app,/await chrome\.alarms\.create\(alarmName\(routine\.id\),\{when\}\)/);
  assert.match(app,/async function runDueRoutines\(\)/);
  assert.match(app,/chrome\.alarms\.onAlarm\.addListener/);
  assert.match(manifest,/"alarms"/,'the permission the scheduler actually needs');
  assert.match(background,/orbit-routine:/);
  assert.match(background,/orbitRoutineDue/,'a closed panel leaves a flag, not a silent run');
  assert.match(app,/skipContext:true/,'a scheduled prompt has no tab the person chose to share');
});

test('the skins are token blocks, and every text pair is a variable',()=>{
  for(const skin of ['midnight','daylight','atelier','foundry']){
    assert.match(styles,new RegExp('\\[data-skin="'+skin+'"\\]\\{'),`${skin} must declare its tokens`);
  }
  assert.match(styles,/\[data-skin="midnight"\]\{[\s\S]{0,900}--text:#/,'a skin sets an ink token');
  assert.match(styles,/var\(--surface\)/,'surfaces use the theme variables');
  assert.match(app,/root\.dataset\.skin=skin/);
  assert.match(app,/root\.dataset\.theme=SKINS\[skin\]\.dark\?'dark':'light'/);
});

test('the new components are styled and the hidden attribute actually hides',()=>{
  assert.match(styles,/\.orbit-card\{/);
  assert.match(styles,/\.activity-chip\{/);
  assert.match(styles,/\.roster-chip/);
  assert.match(styles,/\.needs-you-bar/);
  assert.match(styles,/\.mention-pop\{/);
  assert.match(styles,/\[hidden\]\{display:none!important\}/,'an author display rule outranks the hidden attribute without this');
});

test('the composer keeps one row and gains a mention list, not another toolbar',()=>{
  assert.equal([...html.matchAll(/class="composer-row"/g)].length,1,'exactly one composer row');
  assert.match(html,/id="mentionPop"[^>]*role="listbox"/);
  assert.match(app,/function renderMentionPop\(\)/);
  assert.match(app,/if\(\$\('mentionPop'\)&&!\$\('mentionPop'\)\.hidden\)\{pickMention\(\);return;\}/,'Enter completes a mention before it sends');
});

test('the persona and routine limits are enforced in code, not by asking nicely',()=>{
  assert.match(app,/import \{PRESENCE_LABEL,normalizeRoster/,'the roster is normalized on the way in');
  assert.match(app,/state\.roster=normalizeRoster\(state\.roster\)/,'stored state is repaired at boot');
  assert.match(app,/state\.routines=normalizeRoutines\(state\.routines\)/);
});

test('the Arena research pipeline is wired: menu, slash command, provenance, sign-in hand-back',()=>{
  assert.match(app,/label:'Research with Arena'/,'the Research mode sits in the Agent menu');
  assert.match(app,/slash\?\.skill\?\.slug==='research'/,'the /research command starts the pipeline instead of a chat reply');
  assert.match(app,/async function runResearch\(/);
  assert.match(app,/selectResearchers\(state\.roster,lead\?\.id\)/,'the fan-out comes from the roster, never a hardcoded list');
  assert.match(app,/provenance:'Arena · '/,'the Arena brief carries its model in the name line');
  assert.match(app,/function messagePersona\(/,'research messages show their own author');
  assert.match(app,/messagePersona\(m\)\?\.name\|\|'Orbit'/,'the name line honours a message provenance');
  assert.match(app,/ensureArenaSignedIn\(\{signal:controller\.signal\}\)/,'a login wall mid-run hands back to the person and resumes');
  assert.match(app,/arenaWaitSignedIn/,'the watcher polls the relay tab');
  assert.match(app,/connectRow\.hidden=!arena/,'the Connect row appears only for the Arena preset');
  assert.match(html,/id="arenaConnect"/,'Settings offers a Connect Arena button');
  assert.match(html,/id="arenaConnectRow"/);
  assert.match(styles,/\.orbit-card\.kind-signin/,'the sign-in card is styled');
  assert.match(agentRun,/researchTools\?\.researchArena/,'the agent loop can call Arena research');
  assert.match(agentRun,/researchTools\?\.askPersona/,'the agent loop can consult a persona');
  assert.match(app,/researchTools:researchToolsFor\(\{signal:controller\.signal,onNote:say\}\)/,'the panel run passes its handlers');
});
