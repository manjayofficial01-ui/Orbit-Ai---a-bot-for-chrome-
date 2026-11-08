import test from 'node:test';
import assert from 'node:assert/strict';
import {buildResearchPrompt,buildAnalysisPrompt,buildSynthesisPrompt,selectResearchers,truncateForPrompt,RESEARCH_ROLES,RESEARCHER_CAP,RESEARCH_QUESTION_CHARS,RESEARCH_TEXT_BUDGET} from '../src/research.js';

const roster={activeId:'orbit',personas:[
  {id:'orbit',name:'Orbit',title:'Browser copilot',accent:'teal',instructions:'',model:''},
  {id:'atlas',name:'Atlas',title:'Analyst',accent:'blue',instructions:'Be rigorous.',model:'m1'},
  {id:'vex',name:'Vex',title:'Skeptic',accent:'rose',instructions:'',model:''},
  {id:'pax',name:'Pax',title:'Planner',accent:'amber',instructions:'',model:'m3'},
  {id:'extra',name:'Extra',title:'',accent:'slate',instructions:'',model:''},
]};

test('a research prompt carries the question and the honesty contract',()=>{
  const p=buildResearchPrompt('What changed in web extension policy?');
  assert.match(p,/Question: What changed in web extension policy\?/);
  assert.match(p,/"Not verified here"/,'the brief must end by naming what it could not verify');
  assert.match(p,/Never dress a guess up as a finding/);
  assert.throws(()=>buildResearchPrompt('   '),/research question is needed/);
});

test('an oversized question is bounded, never silently cut',()=>{
  const p=buildResearchPrompt('q'.repeat(RESEARCH_QUESTION_CHARS+500));
  assert.ok(p.length<RESEARCH_QUESTION_CHARS+1200,'the question is capped');
  // clean() collapses whitespace first, so the cap bites on real content.
  assert.doesNotMatch(p,/q{4100}/);
});

test('the fan-out excludes the active persona, caps, and rotates the three roles',()=>{
  const picks=selectResearchers(roster,'orbit');
  assert.ok(picks.length<=RESEARCHER_CAP,'the roster cap holds');
  assert.deepEqual(picks.map(p=>p.persona.id),['atlas','vex','pax'],'active persona first out, roster order kept');
  assert.deepEqual(picks.map(p=>p.role.id),RESEARCH_ROLES.slice(0,3).map(r=>r.id));
  assert.deepEqual(selectResearchers(roster,'atlas').map(p=>p.persona.id),['orbit','vex','pax'],'excluding a mid-roster persona keeps the others in order');
});

test('a one-persona roster fans out to nobody — the brief still runs',()=>{
  assert.deepEqual(selectResearchers({activeId:'orbit',personas:[roster.personas[0]]},'orbit'),[]);
  assert.deepEqual(selectResearchers(null,'orbit'),[]);
  assert.deepEqual(selectResearchers({personas:[]},'orbit'),[]);
});

test('a broken roster entry is skipped, not fatal',()=>{
  const picks=selectResearchers({personas:[null,{id:'ok',name:'Ok'},{}]},'x');
  assert.deepEqual(picks.map(p=>p.persona.id),['ok']);
});

test('an analysis prompt names the reviewer, the role, and the untrusted brief',()=>{
  const {persona,role}=selectResearchers(roster,'orbit')[0];
  const p=buildAnalysisPrompt(role,persona,'the question','THE BRIEF');
  assert.match(p,/You are Atlas — Analyst, one reviewer on a small research team\./);
  assert.match(p,/Your standing instructions: Be rigorous\./);
  assert.match(p,/Your job: /);
  assert.match(p,/untrusted input/);
  assert.match(p,/^THE BRIEF$/m);
});

test('an analysis prompt carries standing instructions only when they exist',()=>{
  const {persona,role}=selectResearchers(roster,'atlas')[0]; // Vex has no instructions
  const p=buildAnalysisPrompt(role,persona,'q','brief');
  assert.doesNotMatch(p,/standing instructions/i);
});

test('the research excerpt is truncated with a marker, not silently',()=>{
  const {persona,role}=selectResearchers(roster,'orbit')[0];
  const p=buildAnalysisPrompt(role,persona,'q','x'.repeat(RESEARCH_TEXT_BUDGET+1000));
  assert.match(p,/\[Truncated/);
});

test('the synthesis prompt asks for attribution and the plan shape',()=>{
  const p=buildSynthesisPrompt('q','BRIEF TEXT',[
    {name:'Atlas',roleLabel:'Verify the claims',text:'Claims mostly hold.'},
    {name:'Vex',roleLabel:'Challenge the gaps',text:'Ignores mobile.'},
  ]);
  assert.match(p,/2 reviewers responded/);
  assert.match(p,/Atlas \(Verify the claims\):\nClaims mostly hold\./);
  assert.match(p,/Vex \(Challenge the gaps\):\nIgnores mobile\./);
  assert.match(p,/Where reviewers disagreed/);
  assert.match(p,/"Not verified here"/);
});

test('a run with no reviews says so instead of pretending',()=>{
  const p=buildSynthesisPrompt('q','BRIEF',[]);
  assert.match(p,/No reviews came back — work from the brief alone and say so\./);
  assert.match(buildSynthesisPrompt('q','BRIEF',undefined),/No reviews came back/);
});

test('every review in the synthesis is bounded with a visible marker',()=>{
  const p=buildSynthesisPrompt('q','BRIEF',[{name:'A',roleLabel:'r',text:'y'.repeat(20000)}]);
  assert.match(p,/\[Truncated/);
});

test('the truncation helper passes short text through untouched',()=>{
  assert.equal(truncateForPrompt('short',100),'short');
  const cut=truncateForPrompt('x'.repeat(101),100);
  assert.match(cut,/\[Truncated/);
  assert.ok(cut.startsWith('x'.repeat(100)));
});
