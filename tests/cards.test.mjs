import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_KINDS, makeCard, isSettled, settleCard, cardOutcome, keyboardChoice,
  configureCards, hasCardPresenter, askCard,
} from '../dist/cards.js';

test('a card normalizes its kind, options and identity',()=>{
  const card=makeCard({kind:'nonsense',title:'t'});
  assert.equal(card.kind,'question','an unknown kind is a question, never an unstyled block');
  assert.ok(CARD_KINDS.includes(card.kind));
  assert.ok(card.requestId.startsWith('card-'),'every card gets an id so an answer can be matched to it');
  assert.equal(makeCard({kind:'approval'}).options.length,2,'an approval without options still has Allow and Deny');
});

test('options are bounded and blank ones are dropped',()=>{
  const card=makeCard({options:['a','','b','c','d','e','f']});
  assert.deepEqual(card.options,['a','b','c','d'],'four choices is the cap');
});

test('a card settles once and keeps the answer',()=>{
  const card=makeCard({kind:'approval'});
  assert.equal(isSettled(card),false);
  settleCard(card,'Allow');
  assert.equal(isSettled(card),true);
  settleCard(card,'Deny');
  assert.equal(card.choice,'Allow','a second answer cannot overwrite the record');
  assert.equal(cardOutcome(card),'Approved');
});

test('the settled line reads as a record, not as a command',()=>{
  assert.equal(cardOutcome(makeCard({kind:'approval'})),'','an open card says nothing');
  assert.equal(cardOutcome(settleCard(makeCard({kind:'approval'}),'Deny')),'Denied');
  assert.equal(cardOutcome(settleCard(makeCard({kind:'approval'}),'Stop the run')),'Denied');
  assert.equal(cardOutcome(settleCard(makeCard({kind:'question',options:['Yes','No']}),'Yes')),'Answered: Yes');
});

test('number keys pick an option and Escape declines',()=>{
  const card=makeCard({kind:'approval'});
  assert.equal(keyboardChoice(card,'1'),'Allow');
  assert.equal(keyboardChoice(card,'2'),'Deny');
  assert.equal(keyboardChoice(card,'9'),'');
  assert.equal(keyboardChoice(card,'Escape'),'Deny','escape on an approval is a refusal, never an approval');
  assert.equal(keyboardChoice(settleCard(makeCard({kind:'approval'}),'Allow'),'1'),'','a settled card ignores keys');
});

test('a question without a presenter fails loudly instead of hanging',async()=>{
  configureCards(null);
  assert.equal(hasCardPresenter(),false);
  await assert.rejects(()=>askCard({title:'Anyone?'}),/No card presenter/);
  const fallback=await askCard({title:'Anyone?'},{fallback:card=>card.title});
  assert.equal(fallback,'Anyone?','the caller-supplied dialog is used when nothing is mounted');
});

test('a configured presenter receives the normalized card and owns the answer',async()=>{
  let seen=null;
  configureCards(async card=>{seen=card;return 'Allow';});
  const answer=await askCard({kind:'approval',title:'Run this step?'});
  assert.equal(answer,'Allow');
  assert.equal(seen.kind,'approval');
  assert.equal(seen.title,'Run this step?');
  configureCards(null);
});
