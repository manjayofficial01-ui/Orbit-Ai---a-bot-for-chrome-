// Orbit personas — the roster.
//
// One assistant with one voice is the wrong shape for a browser copilot. The work
// you do in a tab splits into kinds that want different standing instructions: a
// reviewer that never writes prose, a researcher that always cites, a form filler
// that asks before typing. OpenMausBot makes that a roster of bots you talk to like
// contacts. Orbit takes the same shape without taking its dependencies: a persona is
// a name, a colour, a standing instruction and an optional model override.
//
// A persona never carries credentials. Keys stay bound to the endpoint they were
// saved for (see keyFor() in app.js), so switching persona cannot move a key to a
// host you did not choose. That is the one property the port must not lose.

export const PERSONA_LIMITS={max:8,nameChars:32,titleChars:48,instructionsChars:8000};
export const PERSONA_ACCENTS=['teal','blue','violet','amber','rose','slate'];
export const DEFAULT_ROSTER={
  activeId:'orbit',
  personas:[{id:'orbit',name:'Orbit',title:'Browser copilot',accent:'teal',instructions:'',model:''}],
};

/** Presence words the roster, the rail and the chat header all read from one place. */
export const PRESENCE_LABEL={working:'Working',waiting:'Needs you',idle:'Idle'};

function clean(value,max){
  return String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
}

/** A stable, URL-safe id from a display name. Collisions are resolved by normalizeRoster. */
export function slugId(name){
  const base=String(name||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,24);
  return base||'persona';
}

/** Up to two letters for an avatar plate. Never returns an empty string. */
export function initials(name){
  const words=String(name||'').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if(!words.length)return '?';
  if(words.length===1)return [...words[0]].slice(0,2).join('').toUpperCase();
  return ([...words[0]][0]+[...words[1]][0]).toUpperCase();
}

/**
 * Coerce one stored record into a persona the rest of the app can trust.
 * Anything missing is filled from the fallback; nothing throws, because a roster
 * read from storage is untrusted input.
 */
export function normalizePersona(raw,index=0){
  const source=raw&&typeof raw==='object'?raw:{};
  const name=clean(source.name,PERSONA_LIMITS.nameChars)||'Persona '+(index+1);
  const accent=PERSONA_ACCENTS.includes(source.accent)?source.accent:PERSONA_ACCENTS[index%PERSONA_ACCENTS.length];
  const id=clean(source.id,40)||slugId(name);
  return {
    id,
    name,
    title:clean(source.title,PERSONA_LIMITS.titleChars),
    accent,
    instructions:String(source.instructions??'').slice(0,PERSONA_LIMITS.instructionsChars),
    model:clean(source.model,120),
  };
}

/** A roster is never empty: a panel with no persona has no identity to send a turn as. */
export function normalizeRoster(raw){
  const source=raw&&typeof raw==='object'?raw:{};
  const list=Array.isArray(source.personas)?source.personas:[];
  const seen=new Set();
  const personas=[];
  for(const entry of list.slice(0,PERSONA_LIMITS.max)){
    const persona=normalizePersona(entry,personas.length);
    if(seen.has(persona.id))continue;
    seen.add(persona.id);
    personas.push(persona);
  }
  if(!personas.length)personas.push(normalizePersona(DEFAULT_ROSTER.personas[0],0));
  const activeId=personas.some(p=>p.id===source.activeId)?source.activeId:personas[0].id;
  return {activeId,personas};
}

export function findPersona(roster,id){
  const list=roster?.personas||[];
  return list.find(p=>p.id===id)||list[0]||null;
}

export function activePersona(roster){
  return findPersona(roster,roster?.activeId);
}

/** A new persona. Throws rather than silently dropping the eighth one past the cap. */
export function addPersona(roster,{name,title='',accent,instructions='',model=''}={}){
  const current=normalizeRoster(roster);
  const wanted=clean(name,PERSONA_LIMITS.nameChars);
  if(!wanted)throw Error('A persona needs a name.');
  if(current.personas.length>=PERSONA_LIMITS.max)throw Error(`Orbit keeps ${PERSONA_LIMITS.max} personas. Delete one before adding another.`);
  let id=slugId(wanted),n=2;
  while(current.personas.some(p=>p.id===id))id=slugId(wanted)+'-'+n++;
  const persona=normalizePersona({name:wanted,id,title,instructions,model,accent:accent||PERSONA_ACCENTS[current.personas.length%PERSONA_ACCENTS.length]},current.personas.length);
  return {activeId:current.activeId,personas:[...current.personas,persona]};
}

/** Patch one persona. The id is immutable: chats and routines point at it. */
export function updatePersona(roster,id,patch={}){
  const current=normalizeRoster(roster);
  const personas=current.personas.map(p=>p.id===id?normalizePersona({...p,...patch,id:p.id},current.personas.indexOf(p)):p);
  return {activeId:current.activeId,personas};
}

/** Remove one persona. The last one cannot go: something has to answer. */
export function removePersona(roster,id){
  const current=normalizeRoster(roster);
  if(current.personas.length<=1)throw Error('Orbit needs at least one persona.');
  const personas=current.personas.filter(p=>p.id!==id);
  const activeId=current.activeId===id?personas[0].id:current.activeId;
  return {activeId,personas};
}

export function selectPersona(roster,id){
  const current=normalizeRoster(roster);
  if(!current.personas.some(p=>p.id===id))return current;
  return {activeId:id,personas:current.personas};
}

/**
 * Presence, from the facts the panel already has.
 *
 * A run that is waiting on a person is not "working" — saying so is how a stalled
 * agent looks productive while nothing happens. This is the same distinction
 * OpenMausBot draws with its waiting-on-you activity state.
 */
export function presenceOf({running=false,needsInput=false}={}){
  if(needsInput)return 'waiting';
  if(running)return 'working';
  return 'idle';
}

/** The standing instruction a persona contributes to the system message. */
export function personaInstruction(persona){
  const lines=[];
  if(persona?.name)lines.push(`You are answering as ${persona.name}${persona.title?` (${persona.title})`:''}.`);
  if(persona?.instructions)lines.push(persona.instructions.trim());
  return lines.join('\n');
}

/** The partial @name a person is typing at the end of the composer, or null. */
export function mentionQuery(text){
  const match=/(?:^|\s)@([\p{L}\p{N}_-]{0,32})$/u.exec(String(text||''));
  return match?match[1]:null;
}

/**
 * The persona a message addresses, and the text with the mention removed.
 *
 * An @ inside a word (`me@example.com`) is not a mention, so the address keeps its
 * shape and reaches the model unchanged.
 */
export function matchMention(text,roster){
  const source=String(text||'');
  const list=roster?.personas||[];
  for(const persona of list){
    const name=persona.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const pattern=new RegExp('(^|\\s)@'+name+'(?![\\p{L}\\p{N}_-])','iu');
    const found=pattern.exec(source);
    if(!found)continue;
    const rest=(source.slice(0,found.index)+' '+source.slice(found.index+found[0].length)).replace(/\s+/g,' ').trim();
    return {persona,rest:rest||source.trim()};
  }
  return null;
}

/** How many conversations each persona owns, for the rail badges. */
export function rosterCounts(roster,chats){
  const counts={};
  for(const persona of roster?.personas||[])counts[persona.id]=0;
  for(const chat of chats||[])if(counts[chat?.persona]!==undefined)counts[chat.persona]++;
  return counts;
}
