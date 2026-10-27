import test from 'node:test';
import assert from 'node:assert/strict';
import {TASK_FRAME,taskBrief,TASK_LIMITS,titleFrom,taskStatus,TASK_STATUS_LABEL,TASK_GROUP_ORDER,groupTasks} from '../src/tasks.js';

test('the task brief carries the frame so a task never hands itself on', () => {
  const brief = taskBrief('Reconcile the invoice list');
  assert.ok(brief.startsWith(TASK_FRAME));
  assert.match(brief, /The person.s task:/);
  assert.match(brief, /Reconcile the invoice list/);
  assert.match(TASK_FRAME, /conversation of its own|runs apart from their main chat/);
  assert.match(TASK_FRAME, /Do the work here yourself/);
});

test('titleFrom takes the first line, first sentence, and cuts with an ellipsis', () => {
  assert.equal(titleFrom('Reconcile the invoices.\nThen email Rosa.'), 'Reconcile the invoices');
  assert.equal(titleFrom('   \n\nSecond line is the ask'), 'Second line is the ask');
  assert.equal(titleFrom(''), 'New task');
  const long = titleFrom('Please go through the whole vendor list and pull every contact email you can find into one table for me');
  assert.ok(long.length <= TASK_LIMITS.titleChars, 'the title is capped');
  assert.ok(long.endsWith('…'), 'a cut title says it was cut');
  assert.ok(!long.slice(0, -1).endsWith(' '), 'the cut lands on a word boundary');
});

test('taskStatus is computed, first match wins, and waiting on the person outranks working', () => {
  assert.equal(taskStatus({ running: true, needsInput: true, failure: 'x' }), 'needs_input');
  assert.equal(taskStatus({ running: true }), 'working');
  assert.equal(taskStatus({ resolvedAt: 1, failure: 'x' }), 'resolved', 'done is done even if a failure is recorded');
  assert.equal(taskStatus({ failure: 'Stopped.' }), 'failed');
  assert.equal(taskStatus({}), 'ready_for_review', 'a finished turn reads as ready for review');
  assert.equal(taskStatus(null), 'failed');
  for (const s of ['working', 'needs_input', 'ready_for_review', 'resolved', 'failed'])
    assert.ok(TASK_STATUS_LABEL[s], 'every status has a label: ' + s);
});

test('groupTasks presents in the fixed order and drops empty groups', () => {
  const tasks = [
    { id: 'a', resolvedAt: 1 },
    { id: 'b', failure: 'x' },
    { id: 'c', running: true },
    { id: 'd', needsInput: true },
    { id: 'e' },
    { id: 'f' },
  ];
  const groups = groupTasks(tasks);
  assert.deepEqual(groups.map((g) => g.status), ['ready_for_review', 'needs_input', 'failed', 'working', 'resolved']);
  assert.equal(groups[0].tasks.length, 2);
  assert.equal(groupTasks([]).length, 0);
  assert.deepEqual(TASK_GROUP_ORDER, ['ready_for_review', 'needs_input', 'failed', 'working', 'resolved']);
});

test('task bounds are honest about what a personal extension can hold', () => {
  assert.ok(TASK_LIMITS.count >= 5 && TASK_LIMITS.count <= 50);
  assert.ok(TASK_LIMITS.askChars >= 2000);
});
