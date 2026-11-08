import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERSONA_LIMITS, DEFAULT_ROSTER, PRESENCE_LABEL, slugId, initials, normalizePersona,
  normalizeRoster, findPersona, activePersona, addPersona, updatePersona, removePersona,
  selectPersona, presenceOf, personaInstruction, mentionQuery, matchMention, rosterCounts,
} from '../dist/personas.js';

test('a stored roster is untrusted input and is repaired, never thrown at',()=>{
  assert.deepEqual(normalizeRoster(null).personas.map(p=>p.id),['orbit'],'an empty roster keeps one identity');
  assert.equal(normalizeRoster(undefined).activeId,'orbit');
  const repaired=normalizeRoster({activeId:'gone',personas:[{name:'  Reviewer  '},{id:'dup',name:'A'},{id:'dup',name:'B'}]});
  assert.equal(repaired.activeId,'reviewer','a dangling active id falls back to the first persona');
  assert.equal(repaired.personas[0].name,'Reviewer','whitespace is collapsed');
  assert.deepEqual(repaired.personas.map(p=>p.id),['reviewer','dup'],'duplicate ids are dropped, not merged');
});

test('persona text is clamped to the limits the UI advertises',()=>{
  const persona=normalizePersona({name:'x'.repeat(200),title:'y'.repeat(200),instructions:'z'.repeat(20000)});
  assert.equal(persona.name.length,PERSONA_LIMITS.nameChars);
  assert.equal(persona.title.length,PERSONA_LIMITS.titleChars);
  assert.equal(persona.instructions.length,PERSONA_LIMITS.instructionsChars);
  assert.ok(PERSONA_LIMITS.instructionsChars<=8000,'the instruction cap must stay inside the settings textarea cap');
});

test('an unknown accent becomes a real one instead of an unstyled element',()=>{
  assert.equal(normalizePersona({accent:'chartreuse'}).accent,'teal');
  assert.equal(normalizePersona({accent:'rose'}).accent,'rose');
});

test('ids are stable and derived from the name',()=>{
  assert.equal(slugId('Code Reviewer'),'code-reviewer');
  assert.equal(slugId('  Ünïcode  Name '),'unicode-name');
  assert.equal(slugId('!!!'),'persona');
  assert.equal(initials('Orbit'),'OR');
  assert.equal(initials('Code Reviewer'),'CR');
  assert.equal(initials(''),'?');
  assert.equal(initials('李 明'),'李明');
});

test('the roster refuses to grow past its cap or lose its last member',()=>{
  let roster=normalizeRoster(DEFAULT_ROSTER);
  for(let i=0;i<PERSONA_LIMITS.max-1;i++)roster=addPersona(roster,{name:'P'+i});
  assert.equal(roster.personas.length,PERSONA_LIMITS.max);
  assert.throws(()=>addPersona(roster,{name:'One more'}),/keeps 8 personas/);
  assert.throws(()=>addPersona(roster,{name:'   '}),/needs a name/);
  let single=normalizeRoster(DEFAULT_ROSTER);
  assert.throws(()=>removePersona(single,'orbit'),/at least one persona/);
  single=addPersona(single,{name:'Scout'});
  assert.equal(removePersona(single,'orbit').personas.length,1,'removing the active persona hands over to the survivor');
  assert.equal(removePersona(single,'orbit').activeId,'scout');
});

test('adding a persona never reuses an id',()=>{
  let roster=addPersona(normalizeRoster(DEFAULT_ROSTER),{name:'Scout'});
  roster=addPersona(roster,{name:'Scout'});
  assert.deepEqual(roster.personas.map(p=>p.id),['orbit','scout','scout-2']);
});

test('updating a persona cannot change its id',()=>{
  const roster=addPersona(normalizeRoster(DEFAULT_ROSTER),{name:'Scout'});
  const next=updatePersona(roster,'scout',{id:'hijacked',title:'Researcher'});
  assert.equal(findPersona(next,'scout').title,'Researcher');
  assert.equal(findPersona(next,'scout').id,'scout','chats and routines point at the id');
});

test('selecting a persona that does not exist changes nothing',()=>{
  const roster=normalizeRoster(DEFAULT_ROSTER);
  assert.equal(selectPersona(roster,'nope').activeId,'orbit');
  assert.equal(activePersona(selectPersona(roster,'orbit')).name,'Orbit');
});

test('presence distinguishes waiting on a person from working',()=>{
  assert.equal(presenceOf({running:true}),'working');
  assert.equal(presenceOf({running:true,needsInput:true}),'waiting','a stalled run is not progress');
  assert.equal(presenceOf({}),'idle');
  assert.deepEqual(Object.keys(PRESENCE_LABEL),['working','waiting','idle']);
});

test('a persona contributes standing instructions, and nothing when it has none',()=>{
  assert.equal(personaInstruction({name:'Orbit'}),'You are answering as Orbit.');
  assert.match(personaInstruction({name:'Reviewer',title:'Code review',instructions:'Cite the line.'}),/answering as Reviewer \(Code review\)\.[\s\S]*Cite the line\./);
  assert.equal(personaInstruction(null),'');
});

test('a typed @name is offered as a completion only at the end of the composer',()=>{
  assert.equal(mentionQuery('ask @Sco'),'Sco');
  assert.equal(mentionQuery('ask @'),'');
  assert.equal(mentionQuery('ask @Scout about it'),null);
  assert.equal(mentionQuery('me@example'),null,'an address is not a mention');
});

test('a mention routes the turn and is removed from the request',()=>{
  const roster=addPersona(normalizeRoster(DEFAULT_ROSTER),{name:'Scout'});
  const hit=matchMention('@Scout summarize this page',roster);
  assert.equal(hit.persona.name,'Scout');
  assert.equal(hit.rest,'summarize this page');
  assert.equal(matchMention('mail me at me@Scout.dev',roster),null,'a mention must start a word');
  assert.equal(matchMention('nothing here',roster),null);
  assert.equal(matchMention('@Orbit hi',roster).persona.name,'Orbit');
});

test('the rail counts conversations per persona',()=>{
  const roster=addPersona(normalizeRoster(DEFAULT_ROSTER),{name:'Scout'});
  assert.deepEqual(rosterCounts(roster,[{persona:'scout'},{persona:'scout'},{persona:'gone'},{}]),{orbit:0,scout:2});
});
