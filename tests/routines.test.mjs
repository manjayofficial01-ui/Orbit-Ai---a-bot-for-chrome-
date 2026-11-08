import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUTINE_LIMITS, normalizeTime, normalizeRoutine, normalizeRoutines, addRoutine,
  updateRoutine, removeRoutine, nextRunAt, dueRoutines, markRun, describeSchedule,
  describeNextRun, alarmName,
} from '../dist/routines.js';

// A fixed local reference: Monday 2 November 2026, 10:00.
const MON=new Date(2026,10,2,10,0,0,0).getTime();
const MIN=60000;

test('a time is normalized or rejected outright',()=>{
  assert.equal(normalizeTime('9:05'),'09:05');
  assert.equal(normalizeTime('23:59'),'23:59');
  assert.equal(normalizeTime('24:00'),'','there is no 24:00');
  assert.equal(normalizeTime('9:5'),'');
  assert.equal(normalizeTime('noon'),'');
});

test('a routine is repaired into something that can actually fire',()=>{
  const routine=normalizeRoutine({name:'  Morning  ',kind:'nonsense',minutes:2,time:'99:99',prompt:'p'});
  assert.equal(routine.name,'Morning');
  assert.equal(routine.kind,'daily');
  assert.equal(routine.minutes,ROUTINE_LIMITS.minMinutes,'an interval shorter than the floor is raised, not silently kept');
  assert.equal(routine.time,'09:00','an impossible time falls back rather than never firing');
  assert.equal(routine.enabled,true);
});

test('the routine list is capped and de-duplicated',()=>{
  const many=Array.from({length:20},(_,i)=>({id:'r'+i,prompt:'p'}));
  assert.equal(normalizeRoutines(many).length,ROUTINE_LIMITS.max);
  assert.equal(normalizeRoutines([{id:'a',prompt:'p'},{id:'a',prompt:'q'}]).length,1);
  assert.deepEqual(normalizeRoutines(null),[]);
});

test('a new routine needs a prompt and a real interval',()=>{
  assert.throws(()=>addRoutine([],{name:'x',prompt:'  '}),/needs something to ask/);
  assert.throws(()=>addRoutine([],{name:'x',prompt:'p',kind:'interval',minutes:5}),/shortest interval is 15/);
  assert.equal(addRoutine([],{name:'x',prompt:'p',kind:'interval',minutes:30})[0].minutes,30);
});

test('an interval routine is anchored to its last run, so a closed panel catches up once',()=>{
  const routine=normalizeRoutine({kind:'interval',minutes:60,lastRunAt:MON-5*60*MIN,enabled:true});
  assert.equal(nextRunAt(routine,MON),MON,'five missed hours produce one run now, not five');
  const fresh=normalizeRoutine({kind:'interval',minutes:60});
  assert.equal(nextRunAt(fresh,MON),MON+60*MIN,'a routine that never ran waits one interval');
  assert.equal(nextRunAt({...routine,enabled:false},MON),0,'a paused routine has no deadline');
});

test('a daily routine fires at its time today, or tomorrow once that time has passed',()=>{
  const morning=normalizeRoutine({kind:'daily',time:'08:30'});
  assert.equal(nextRunAt(morning,MON),new Date(2026,10,3,8,30,0,0).getTime(),'08:30 already passed at 10:00');
  const evening=normalizeRoutine({kind:'daily',time:'18:00'});
  assert.equal(nextRunAt(evening,MON),new Date(2026,10,2,18,0,0,0).getTime());
});

test('a weekday routine skips the weekend',()=>{
  const friday=new Date(2026,10,6,20,0,0,0).getTime();
  const routine=normalizeRoutine({kind:'weekdays',time:'09:00'});
  assert.equal(nextRunAt(routine,friday),new Date(2026,10,9,9,0,0,0).getTime(),'Friday evening means Monday morning');
  const monday=normalizeRoutine({kind:'weekdays',time:'09:00'});
  assert.equal(nextRunAt(monday,MON),new Date(2026,10,3,9,0,0,0).getTime());
});

test('only enabled, non-empty routines are due',()=>{
  const now=MON;
  const list=[
    normalizeRoutine({id:'a',prompt:'p',kind:'interval',minutes:60,lastRunAt:now-120*MIN}),
    normalizeRoutine({id:'b',prompt:'p',kind:'interval',minutes:60,lastRunAt:now-120*MIN,enabled:false}),
    normalizeRoutine({id:'c',prompt:'',kind:'interval',minutes:60,lastRunAt:now-120*MIN}),
    normalizeRoutine({id:'d',prompt:'p',kind:'interval',minutes:60}),
  ];
  assert.deepEqual(dueRoutines(list,now).map(r=>r.id),['a']);
});

test('recording a run moves the deadline forward',()=>{
  const routine=normalizeRoutine({kind:'interval',minutes:60});
  const after=markRun(routine,{at:MON,status:'ok'});
  assert.equal(after.lastRunAt,MON);
  assert.equal(after.lastStatus,'ok');
  assert.equal(nextRunAt(after,MON),MON+60*MIN);
});

test('schedules are described in words a person uses',()=>{
  assert.equal(describeSchedule(normalizeRoutine({kind:'interval',minutes:30})),'Every 30 minutes');
  assert.equal(describeSchedule(normalizeRoutine({kind:'interval',minutes:120})),'Every 2 hours');
  assert.equal(describeSchedule(normalizeRoutine({kind:'daily',time:'07:15'})),'Daily at 07:15');
  assert.equal(describeSchedule(normalizeRoutine({kind:'weekdays',time:'09:00'})),'Weekdays at 09:00');
  assert.equal(describeNextRun(normalizeRoutine({kind:'interval',minutes:60,lastRunAt:MON}),MON),'In 1 hour');
  assert.equal(describeNextRun(normalizeRoutine({kind:'interval',minutes:60,lastRunAt:MON-90*MIN}),MON),'Due now');
  assert.equal(describeNextRun({...normalizeRoutine({kind:'daily'}),enabled:false},MON),'Paused');
});

test('alarm names are namespaced so Orbit cannot cancel a foreign alarm',()=>{
  assert.equal(alarmName('abc'),'orbit-routine:abc');
  assert.ok(alarmName('x'.repeat(80)).length<60);
});

test('updating and removing a routine keeps the list well formed',()=>{
  let list=addRoutine([],{name:'Digest',prompt:'Summarize my tabs'});
  const id=list[0].id;
  list=updateRoutine(list,id,{enabled:false});
  assert.equal(list[0].enabled,false);
  assert.equal(removeRoutine(list,id).length,0);
});
