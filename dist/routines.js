// Orbit routines — a prompt that comes back on its own.
//
// OpenMausBot's routines are a harness feature: a scheduler that fires a turn into a
// bot. An extension cannot keep a process alive, but it does not need one — Chrome
// wakes the service worker for an alarm, and the panel picks the work up. The
// schedule math lives here as pure functions so it is testable without a browser and
// identical on both sides.
//
// The honest limitation, stated where it is implemented rather than in a footnote:
// an alarm can only mark a routine due. If no Orbit surface is open when it fires, the
// run happens the next time you open one. Orbit does not pretend to have run in the
// background.

export const ROUTINE_LIMITS={max:12,nameChars:48,promptChars:4000,minMinutes:15,maxMinutes:1440};
export const SCHEDULE_KINDS=['interval','daily','weekdays'];

const DAY=86400000;

function clean(value,max){return String(value??'').replace(/\s+/g,' ').trim().slice(0,max);}

/** `HH:MM` in 24-hour local time, or '' when it is not a real time. */
export function normalizeTime(value){
  const match=/^(\d{1,2}):(\d{2})$/.exec(String(value||'').trim());
  if(!match)return '';
  const hours=Number(match[1]),minutes=Number(match[2]);
  if(hours>23||minutes>59)return '';
  return String(hours).padStart(2,'0')+':'+String(minutes).padStart(2,'0');
}

export function normalizeRoutine(raw,index=0){
  const source=raw&&typeof raw==='object'?raw:{};
  const kind=SCHEDULE_KINDS.includes(source.kind)?source.kind:'daily';
  const minutes=Math.min(ROUTINE_LIMITS.maxMinutes,Math.max(ROUTINE_LIMITS.minMinutes,Math.round(Number(source.minutes)||60)));
  const time=normalizeTime(source.time)||'09:00';
  const prompt=String(source.prompt??'').slice(0,ROUTINE_LIMITS.promptChars);
  return {
    id:clean(source.id,40)||'routine-'+Math.random().toString(36).slice(2,10),
    name:clean(source.name,ROUTINE_LIMITS.nameChars)||'Routine '+(index+1),
    prompt,
    personaId:clean(source.personaId,40),
    kind,
    minutes,
    time,
    enabled:source.enabled!==false,
    lastRunAt:Number(source.lastRunAt)||0,
    lastStatus:clean(source.lastStatus,120),
  };
}

export function normalizeRoutines(list){
  const source=Array.isArray(list)?list:[];
  const seen=new Set();
  const routines=[];
  for(const entry of source.slice(0,ROUTINE_LIMITS.max)){
    const routine=normalizeRoutine(entry,routines.length);
    if(seen.has(routine.id))continue;
    seen.add(routine.id);
    routines.push(routine);
  }
  return routines;
}

/** A new routine, refusing the shapes that would never fire or never stop firing. */
export function addRoutine(list,{name,prompt,personaId='',kind='daily',time='09:00',minutes=60}={}){
  const routines=normalizeRoutines(list);
  if(routines.length>=ROUTINE_LIMITS.max)throw Error(`Orbit keeps ${ROUTINE_LIMITS.max} routines. Delete one first.`);
  if(!String(prompt||'').trim())throw Error('A routine needs something to ask.');
  if(kind==='interval'&&Number(minutes)<ROUTINE_LIMITS.minMinutes)throw Error(`The shortest interval is ${ROUTINE_LIMITS.minMinutes} minutes.`);
  return [...routines,normalizeRoutine({name,prompt,personaId,kind,time,minutes,enabled:true},routines.length)];
}

export function updateRoutine(list,id,patch={}){
  return normalizeRoutines(list).map(r=>r.id===id?normalizeRoutine({...r,...patch,id:r.id},0):r);
}

export function removeRoutine(list,id){
  return normalizeRoutines(list).filter(r=>r.id!==id);
}

/** `2026-11-01` + `08:30` in local time. Built from parts so a DST shift cannot move it an hour. */
function atLocal(day,time){
  const [hours,minutes]=time.split(':').map(Number);
  const date=new Date(day);
  date.setHours(hours,minutes,0,0);
  return date.getTime();
}

/**
 * When this routine should next fire, as epoch milliseconds.
 *
 * An interval routine is anchored to its last run, so a panel that was closed for a
 * day produces one catch-up run rather than twenty-four: every missed slot collapses
 * into "due now", and markRun() re-anchors it afterwards.
 */
export function nextRunAt(routine,now=Date.now()){
  if(!routine||routine.enabled===false)return 0;
  if(routine.kind==='interval'){
    const every=Math.max(ROUTINE_LIMITS.minMinutes,routine.minutes||60)*60000;
    const anchor=routine.lastRunAt||now;
    if(anchor+every>now)return anchor+every;
    return now;
  }
  const time=routine.time||'09:00';
  if(routine.kind==='weekdays'){
    for(let step=0;step<8;step++){
      const day=new Date(now);
      day.setDate(day.getDate()+step);
      const weekday=day.getDay();
      if(weekday===0||weekday===6)continue;
      const stamp=atLocal(day,time);
      if(stamp>now)return stamp;
    }
    return atLocal(new Date(now+7*DAY),time);
  }
  const today=atLocal(new Date(now),time);
  if(today>now)return today;
  return atLocal(new Date(now+DAY),time);
}

/** The routines that should run at `now`, oldest deadline first. */
export function dueRoutines(list,now=Date.now()){
  return normalizeRoutines(list)
    .filter(r=>r.enabled&&r.prompt&&nextRunAt(r,now)<=now)
    .sort((a,b)=>nextRunAt(a,now)-nextRunAt(b,now));
}

/** Record a run. The next deadline is recomputed from the new anchor. */
export function markRun(routine,{at=Date.now(),status=''}={}){
  return normalizeRoutine({...routine,lastRunAt:at,lastStatus:status},0);
}

const WEEKDAY_NAMES=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export function describeSchedule(routine){
  if(!routine)return '';
  if(routine.kind==='interval'){
    const minutes=routine.minutes||60;
    if(minutes<60)return `Every ${minutes} minutes`;
    const hours=minutes/60;
    return Number.isInteger(hours)?`Every ${hours} hour${hours===1?'':'s'}`:`Every ${minutes} minutes`;
  }
  if(routine.kind==='weekdays')return `Weekdays at ${routine.time||'09:00'}`;
  return `Daily at ${routine.time||'09:00'}`;
}

/** A human line for the next deadline, for the routine row and the needs-you strip. */
export function describeNextRun(routine,now=Date.now()){
  const next=nextRunAt(routine,now);
  if(!next)return 'Paused';
  const minutes=Math.round((next-now)/60000);
  if(minutes<=1)return 'Due now';
  if(minutes<60)return `In ${minutes} min`;
  const hours=Math.round(minutes/60);
  if(hours<24)return `In ${hours} hour${hours===1?'':'s'}`;
  const day=new Date(next);
  return `${WEEKDAY_NAMES[day.getDay()]} at ${routine.time||'09:00'}`;
}

/** The alarm name the service worker registers. Namespaced so Orbit never cancels a foreign alarm. */
export function alarmName(id){
  return 'orbit-routine:'+String(id||'').slice(0,40);
}
