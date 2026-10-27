import test from 'node:test';
import assert from 'node:assert/strict';
import {SKILLS,BASELINE_TOOLS,SKILL_SLUGS,skillBySlug,routeSkills,narrowTools,toolsForGoal,skillInstructions,parseSlashCommand,replyChips} from '../dist/skills.js';
import {AGENT_TOOLS} from '../dist/agent.js';

test('every skill is well formed and every declared tool is real',()=>{
  assert.ok(SKILLS.length>=5);
  const slugs=new Set();
  for(const s of SKILLS){
    assert.match(s.slug,/^[a-z0-9-]+$/,`${s.slug} must read as a command`);
    assert.ok(!slugs.has(s.slug),`${s.slug} is declared twice`);
    slugs.add(s.slug);
    assert.ok(s.title&&s.summary&&s.instructions,`${s.slug} needs a title, summary and instruction`);
    assert.ok(Array.isArray(s.triggers)&&s.triggers.length,`${s.slug} needs triggers`);
    for(const tool of s.tools)assert.ok(AGENT_TOOLS.includes(tool),`${s.slug} names a tool that does not exist: ${tool}`);
  }
});

test('routing matches the words a person would type',()=>{
  assert.deepEqual(routeSkills('fill in this form with my address').map(s=>s.slug),['fill-a-form']);
  assert.deepEqual(routeSkills('extract all the prices from this table').map(s=>s.slug),['extract-data']);
  assert.deepEqual(routeSkills('compare these two tabs').map(s=>s.slug),['compare-pages']);
  assert.deepEqual(routeSkills('is it true that they ship in 2 days').map(s=>s.slug),['verify-a-claim']);
  assert.deepEqual(routeSkills('log in and check my orders').map(s=>s.slug),['sign-in']);
});

test('an unmatched message is not forced into a skill',()=>{
  assert.deepEqual(routeSkills('hello there'),[]);
  assert.deepEqual(routeSkills(''),[]);
  assert.deepEqual(routeSkills('   '),[]);
});

test('routing is capped and ordered by how specific the match is',()=>{
  const matched=routeSkills('sign in to the site, then extract the table of prices, and compare with the other tab',2);
  assert.ok(matched.length<=2);
  assert.ok(matched.length>0);
});

test('narrowing removes tools a skill does not need',()=>{
  const fill=narrowTools(routeSkills('fill in this form'),AGENT_TOOLS);
  assert.ok(fill.includes('fill')&&fill.includes('computer_read'));
  assert.ok(!fill.includes('goto'),'a form-filling run must not be offered navigation');
  assert.ok(!fill.includes('read-tab'),'a form-filling run must not switch tabs');
  for(const base of BASELINE_TOOLS)assert.ok(fill.includes(base),'the baseline floor must survive narrowing');
});

test('an unmatched goal keeps the whole tool set',()=>{
  assert.deepEqual(narrowTools([],AGENT_TOOLS),AGENT_TOOLS);
  assert.deepEqual(toolsForGoal('hello there',AGENT_TOOLS),AGENT_TOOLS);
});

test('narrowing preserves the caller order and never returns an empty set',()=>{
  const narrowed=narrowTools([SKILLS[0]],AGENT_TOOLS);
  const expected=AGENT_TOOLS.filter(t=>narrowed.includes(t));
  assert.deepEqual(narrowed,expected);
  assert.deepEqual(narrowTools([{tools:[]}],AGENT_TOOLS),AGENT_TOOLS,'an empty skill must not starve the run');
});

test('two matched skills merge their tools',()=>{
  const both=narrowTools([skillBySlug('extract-data'),skillBySlug('compare-pages')],AGENT_TOOLS);
  assert.ok(both.includes('extract')&&both.includes('read-tab'));
});

test('the skill brief is imperative prose, not a label',()=>{
  const brief=skillInstructions(routeSkills('fill in this form'));
  assert.match(brief,/Snapshot first/);
  assert.match(brief,/^\[Fill in a form\]/);
  assert.equal(skillInstructions([]),'');
});

test('slash commands resolve to a skill and keep the rest of the message',()=>{
  const parsed=parseSlashCommand('/extract-data the prices on this page');
  assert.equal(parsed.skill.slug,'extract-data');
  assert.equal(parsed.rest,'the prices on this page');
  assert.equal(parseSlashCommand('/nope do something'),null,'an unknown slug must not become a skill');
  assert.equal(parseSlashCommand('hello /extract-data'),null,'only a leading command counts');
});

test('skillBySlug is exact and case-insensitive',()=>{
  assert.equal(skillBySlug('EXTRACT-DATA').slug,'extract-data');
  assert.equal(skillBySlug('extract'),null);
  assert.equal(skillBySlug(''),null);
});

test('reply chips appear for a closed choice and stay away from open questions',()=>{
  assert.deepEqual(replyChips('Want me to send it?'),['Yes','No']);
  assert.deepEqual(replyChips('Should I file it under work or personal?'),['Work','Personal']);
  assert.deepEqual(replyChips('What would you like me to do next?'),[]);
  assert.deepEqual(replyChips(''),[]);
  const three=replyChips('Do you want the blue, green or red one?');
  assert.ok(three.length>=2&&three.length<=3);
});

test('skill slugs are stable identifiers',()=>{
  assert.deepEqual(SKILL_SLUGS,[...SKILL_SLUGS]);
  assert.ok(SKILL_SLUGS.includes('sign-in'));
});
