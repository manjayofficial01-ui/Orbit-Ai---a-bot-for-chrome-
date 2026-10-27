import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Static gates for the OpenDuet-era chat surface: the skills menu, tap-answer chips and the
// provenance/voice contract. They live in browser-only code paths, so this locks the source
// shape that makes the behaviour hold; the router itself is unit-tested in skills.test.mjs.
const root=new URL('../',import.meta.url);
const [app,agent,appRun,pageAccess,html,styles,skills]=await Promise.all([
  readFile(new URL('src/app.js',root),'utf8'),
  readFile(new URL('src/agent.js',root),'utf8'),
  readFile(new URL('src/agent-run.js',root),'utf8'),
  readFile(new URL('src/page-access.js',root),'utf8'),
  readFile(new URL('dist/index.html',root),'utf8'),
  readFile(new URL('dist/styles.css',root),'utf8'),
  readFile(new URL('src/skills.js',root),'utf8'),
]);

test('the chat prompt carries the provenance and voice contract',()=>{
  assert.match(app,/const PROVENANCE_RULES=/,'provenance guidance must be declared once');
  assert.match(app,/const VOICE_RULES=/,'the voice contract must be declared once');
  assert.match(app,/never dress that up as something you looked up here/,'honest provenance');
  assert.match(app,/mark it plainly as unverified/,'an unsourced answer must say it is unsourced');
  assert.match(app,/one thought per paragraph/,'the concise voice contract');
  assert.match(app,/\$\{PROVENANCE_RULES\}/,'the contract must actually reach the system message');
  assert.match(app,/\$\{VOICE_RULES\}/);
});

test('a skill match shapes the run without changing what is allowed',()=>{
  assert.match(app,/const matched=slash\?\[slash\.skill\]:routeSkills\(lastUser\?\.content\|\|''\)/,'the chat turn routes skills');
  assert.match(app,/skillInstructions\(matched\)/,'matched skills contribute their brief');
  assert.match(appRun,/routeSkills\(goal\)/,'the operator loop routes the goal');
  assert.match(appRun,/narrowTools\(matchedSkills,AGENT_TOOLS\)/,'the operator loop narrows its tools');
  assert.match(appRun,/buildAgentSystemPrompt\(\{tools:offeredTools,skillBrief:skillInstructions\(matchedSkills\)\}\)/);
});

test('a slash command is stripped before the model reads it',()=>{
  assert.match(app,/parseSlashCommand\(m\.content\)\?\.rest\|\|m\.content/,'the command prefix must not reach the model as the request');
  assert.match(app,/parseSlashCommand\(user\.content\)\?\.rest\|\|user\.content/,'the conversation title must not be a command');
});

test('reply chips render only under the newest finished answer',()=>{
  assert.match(app,/function drawReplyChips\(chat,index,message\)/);
  assert.match(app,/index!==chat\.messages\.length-1\)return null/,'only the last message gets chips');
  assert.match(app,/message\.role!=='assistant'\|\|message\.state!=='complete'/,'a streaming or user message never gets chips');
  assert.match(app,/const chips=drawReplyChips\(chat,i,m\);if\(chips\)box\.append\(chips\)/,'chips are rendered after the message');
  assert.match(app,/role','group'\)/,'the chip row is announced as a group');
});

test('the skills menu is built with DOM nodes, never innerHTML',()=>{
  assert.match(app,/function openSkillsMenu\(\)/);
  assert.match(app,/menu\.setAttribute\('role','menu'\)/);
  assert.match(app,/b\.setAttribute\('role','menuitem'\)/,'each entry is a menuitem');
  assert.match(app,/\$\('prompt'\)\.value=`\/\$\{skill\.slug\} `/,'picking a skill writes an editable command');
  assert.doesNotMatch(app,/openSkillsMenu[\s\S]{0,900}innerHTML/,'the menu must not use innerHTML');
});

test('the composer is one row: a + attach menu and an Agent split, disabled while busy',()=>{
  assert.match(html,/id="attach" class="icon composer-icon"/,'the + control exists');
  assert.match(html,/aria-label="Attach a page, screenshot, file, or pick a skill"/,'the + control is named');
  assert.match(html,/<button id="agent" class="agent-main"[^>]*>Agent<\/button>/,'the agent control keeps a visible name');
  assert.match(html,/id="agentMode"/,'the agent mode caret exists');
  assert.doesNotMatch(html,/class="toolbar"/,'the two-row toolbar is gone');
  assert.equal([...html.matchAll(/class="composer-row"/g)].length,1,'exactly one composer row');
  assert.match(app,/'regenerate','export','attach','agent','agentMode','checkin','settings','expand','float'/,'every composer control is disabled during a run');
});

test('the removed buttons live in the two menus with their old handlers',()=>{
  assert.match(app,/function openAttachMenu\(\)/,'the + menu');
  assert.match(app,/label:'Add page…',sub:'[^']+',onclick:safe\(\(\)=>openPageTools\(showPreview\)\)/);
  assert.match(app,/label:'Screenshot',sub:'[^']+',onclick:safe\(async\(\)=>showPreview\(await captureActiveScreenshot\(\)\)\)/);
  assert.match(app,/label:'Attach file',sub:'[^']+',onclick:\(\)=>\$\('fileInput'\)\.click\(\)/);
  assert.match(app,/function openAgentModeMenu\(\)/,'the agent mode menu');
  assert.match(app,/label:'Act on this page',sub:'[^']+',onclick:safe\(runAgent\)/);
  assert.match(app,/label:'Research with Reach',sub:'[^']+',disabled:!hasText,onclick:safe\(runResearch\)/,'research needs text');
  assert.match(app,/label:'Start as task',sub:'[^']+',disabled:!hasText,onclick:safe\(startTaskFromPrompt\)/,'tasks need text');
});

test('the new surfaces are styled in both themes',()=>{
  assert.match(styles,/\.reply-chips\{/);
  assert.match(styles,/\.skills-menu\{/);
  assert.match(styles,/@media\(max-width:720px\)\{\.reply-chips/,'chips and menu need a phone layout');
  assert.match(styles,/var\(--surface\)/,'surfaces must use theme variables, not hardcoded colors');
});

test('skill declarations never name a tool the operator cannot run',()=>{
  const declared=[...skills.matchAll(/tools:\s*\[([^\]]*)\]/g)]
    .flatMap(m=>m[1].split(',').map(s=>s.trim().replace(/^'|'$/g,'')).filter(Boolean));
  assert.ok(declared.length>0,'skills must declare their tools');
  const agentTools=[...agent.matchAll(/^\s*'([a-z_-]+)',$/gm)].map(m=>m[1]);
  for(const tool of declared)assert.ok(agentTools.includes(tool),`${tool} is declared by a skill but is not an agent tool`);
});

test('a secret is requested in a masked box and never enters the model context',()=>{
  assert.match(appRun,/export function askSecret\(label\)/);
  assert.match(appRun,/input\.type='password'/,'the entry box must be masked');
  assert.match(appRun,/input\.autocomplete='off'/,'the browser must not offer to save it');
  assert.match(appRun,/const value=await askSecret\(a\.text\)/,'the loop must actually ask');
  assert.match(appRun,/func:secretFill/,'the value goes to the page, not to the model');
  // The value must not be placed anywhere that is persisted or replayed.
  assert.doesNotMatch(appRun,/results\.push\(\{[^}]*value[^}]*\}\)/,'the secret must never enter step results');
  assert.doesNotMatch(appRun,/transcript\.push\([^)]*value/,'the secret must never enter the transcript');
  assert.doesNotMatch(appRun,/chrome\.storage[\s\S]{0,80}value/,'the secret must never be stored');
  assert.match(appRun,/written\.detail/,'only the page\'s own confirmation travels back');
});

test('a page-side secret write exists and reports length, never the value',()=>{
  assert.match(pageAccess,/export function secretFill\(token,ref,value,expectedURL\)/);
  assert.match(pageAccess,/return written===value\?\{ok:true,detail:'filled '\+value\.length\+' characters'\}/,'the confirmation must not echo the value');
  assert.match(pageAccess,/el\.disabled\|\|el\.readOnly/,'a disabled field is refused');
  assert.match(pageAccess,/value\.length>4000/,'the value is bounded');
});

test('a hand-back pauses the run and re-reads the page before acting again',()=>{
  assert.match(appRun,/export function askHandover\(reason\)/);
  assert.match(appRun,/const go=await askHandover\(a\.text\)/);
  assert.match(appRun,/if\(!go\)\{[\s\S]{0,400}?cancelled:true/,'stopping must end the run, not continue');
  const handover=appRun.slice(appRun.indexOf("else if(a.tool==='computer_request_help')"),appRun.indexOf("else if(a.tool==='computer_list_files')"));
  assert.match(handover,/await takeSnapshot\(activeTabId\)/,'every ref is stale after a hand-back');
  assert.ok(handover.indexOf('takeSnapshot')<handover.indexOf('control handed back'),'the re-read must happen before the loop continues');
});

test('the workspace tools are handled in the panel, not on the page',()=>{
  assert.match(appRun,/const names=await listWorkspaceFiles\(\)/);
  assert.match(appRun,/const content=await readWorkspaceFile\(a\.ref\)/);
  assert.match(appRun,/const saved=await writeWorkspaceFile\(a\.ref,a\.text\)/);
  assert.match(pageAccess,/The workspace is handled in the panel, not on the page/,'the page must not pretend to do it');
});

test('the two blocking dialogs are styled for both themes',()=>{
  assert.match(styles,/\.secret-dialog,\.handover-dialog\{/);
  assert.match(styles,/\.secret-dialog input\{/);
});

test('every advertised action has a handler somewhere',async()=>{
  const {AGENT_TOOLS}=await import('../dist/agent.js');
  // A tool in the prompt but not in the loop or the page actuator is a tool that reports a
  // box that never opens. That happened once with computer_request_secret; this is the gate.
  for(const tool of AGENT_TOOLS){
    const routed=appRun.includes(`'${tool}'`)||pageAccess.includes(`'${tool}'`);
    assert.ok(routed,`${tool} is offered to the model but nothing handles it`);
  }
});

test('the unimplemented demonstration tool is not advertised',async()=>{
  const {AGENT_TOOLS}=await import('../dist/agent.js');
  assert.ok(!AGENT_TOOLS.includes('demonstration'),'an unimplemented tool must not be offered');
});

// ---------------------------------------------------------------------------
// 3.1 — tasks, the check-in, and learned memories.
// ---------------------------------------------------------------------------

test('the task, check-in and task-bar controls exist and are disabled while busy',()=>{
  assert.match(html,/<button id="checkin" class="wide secondary"[^>]*>What's new\?<\/button>/,'the check-in lives in the sidebar, at workspace level');
  assert.match(html,/id="tasksSection"/);
  assert.match(html,/id="taskBar"/);
  assert.match(app,/'attach','agent','agentMode','checkin'/,'the check-in is disabled during a run');
});

test('a task is a conversation of its own, opened with the task frame',()=>{
  assert.match(app,/goal:taskBrief\(task\.ask\)/,'the run inside the task reads the framed ask');
  assert.match(app,/content:'On it\.'/,'chat keeps the OpenDuet one-line reply');
  assert.match(app,/taskCard:\{taskId:task\.id/,'and a card for the work');
  assert.match(app,/function taskCardElement\(card\)/);
  assert.match(app,/taskStatus\(task\)/,'the card shows the computed status, never a stored one');
  assert.match(app,/task\.running=true;task\.needsInput=false;task\.failure=null;task\.resolvedAt=null/,'starting a run resets the stored facts');
});

test('a task waiting on the person is marked Needs input, never silent',()=>{
  const secretBlock=appRun.slice(appRun.indexOf("else if(a.tool==='computer_request_secret')"),appRun.indexOf("const value=await askSecret"));
  assert.match(secretBlock,/type:'needs-input'/,'the secret dialog must announce the pause first');
  const helpBlock=appRun.slice(appRun.indexOf("else if(a.tool==='computer_request_help')"),appRun.indexOf('const go=await askHandover'));
  assert.match(helpBlock,/type:'needs-input'/,'so must the hand-back');
  assert.match(app,/if\(e\.type==='needs-input'\)\{task\.needsInput=true/,'the task record flips while the dialog is open');
});

test('starting a task refuses to nest inside a task',()=>{
  assert.match(app,/You are inside a task\. Start tasks from your main chat\./);
});

test('deleting a task conversation removes the task record and says so',()=>{
  assert.match(app,/state\.tasks\.findIndex\(t=>t\.chatId===id\)/);
  assert.match(app,/deleting it removes the task too/);
});

test('the check-in is bounded, read-only, and remembers when it last ran',()=>{
  assert.match(app,/CHECKIN_LIMITS\.openTabsMax/);
  assert.match(app,/permissions\.contains\(\{origins:\[origin\]\}\)/,'ungranted pages are skipped, never granted silently');
  assert.match(app,/filterSuggestions\(parsed\.suggestions,\{openTitles,hiddenTitles\}\)/,'the bounds are enforced in code, not by asking nicely');
  assert.match(app,/state\.checkin\.lastRunAt=now/,'the window anchor updates');
  assert.match(app,/skipped\.push/,'skipped pages are said out loud in the request');
});

test('learned memories reach the system message under the untrusted banner',()=>{
  assert.match(app,/const learned=memoryContext\(memoriesCache\)/);
  assert.match(app,/User-provided memory notes:\\n\$\{cfg\.memory\}\$\{learned\?/,'the banner joins the standing notes');
  assert.match(app,/configureMemory\(\{[\s\S]*?writeLocal\(\{orbitMemories:list\}\)/,'persistence goes through the guarded writer');
  assert.match(app,/function renderMemories\(\)/,'the person reviews what was learned');
  assert.match(html,/id="memoryList"/);
  assert.match(html,/id="memoryLearned"/);
});
