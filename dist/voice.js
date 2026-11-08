// Orbit voice — read an answer aloud.
//
// OpenMausBot's "bots that talk back" is a hosted-voice feature (ElevenLabs, Fish,
// Grok) behind API keys. A browser already ships a speech engine that needs no key
// and no network, so Orbit uses that instead: the same button, none of the billing.
//
// The text is rewritten first. Reading markdown aloud literally — "hash hash",
// "asterisk asterisk", a 40-line code block — is worse than not reading it at all,
// so plainSpeech() turns an answer into something a person would actually say.

const MAX_SPEECH_CHARS=4000;

/** Markdown in, speakable prose out. Code is announced, never spelled out. */
export function plainSpeech(markdown){
  let text=String(markdown||'');
  text=text.replace(/```[a-zA-Z0-9+#-]*\n([\s\S]*?)```/g,(_,code)=>code.trim()?' [code block] ':' ');
  text=text.replace(/`([^`]+)`/g,'$1');
  text=text.replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1');
  text=text.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_,label,url)=>/^https?:/i.test(url)?`${label} (${url})`:label);
  text=text.replace(/^\s{0,3}#{1,6}\s+/gm,'');
  text=text.replace(/^\s{0,3}>\s?/gm,'');
  text=text.replace(/(\*\*|__)(.*?)\1/g,'$2');
  text=text.replace(/(^|[\s(])([*_])([^*_\n]+)\2/g,'$1$3');
  text=text.replace(/^\s*[-*+]\s+/gm,'');
  text=text.replace(/^\s*\d+[.)]\s+/gm,'');
  text=text.replace(/\|/g,' ');
  text=text.replace(/^\s*[-:| ]{3,}\s*$/gm,'');
  text=text.replace(/\n{2,}/g,'. ');
  text=text.replace(/\n/g,' ');
  text=text.replace(/\s{2,}/g,' ');
  text=text.replace(/\s+([.,;:!?])/g,'$1');
  return text.trim().slice(0,MAX_SPEECH_CHARS);
}

export function speechAvailable(){
  return typeof globalThis.speechSynthesis!=='undefined'&&typeof globalThis.SpeechSynthesisUtterance!=='undefined';
}

/** Voices the browser offers, filtered to the ones that can actually speak English or the page language. */
export function voices(){
  if(!speechAvailable())return [];
  try{return globalThis.speechSynthesis.getVoices().slice(0,200);}catch{return [];}
}

let speaking=false;

export function isSpeaking(){return speaking;}

/**
 * Speak one answer. Cancels whatever was being said, because two answers read over
 * each other is not a feature. Resolves when the utterance ends, errors or is
 * cancelled — the caller should not have to care which.
 */
export function speak(text,{voiceURI='',rate=1,pitch=1,lang=''}={}){
  if(!speechAvailable())return Promise.resolve(false);
  const spoken=plainSpeech(text);
  if(!spoken)return Promise.resolve(false);
  try{globalThis.speechSynthesis.cancel();}catch{}
  return new Promise(resolve=>{
    let settled=false;
    const done=value=>{if(settled)return;settled=true;speaking=false;resolve(value);};
    try{
      const utterance=new globalThis.SpeechSynthesisUtterance(spoken);
      utterance.rate=Math.min(2,Math.max(0.5,Number(rate)||1));
      utterance.pitch=Math.min(2,Math.max(0,Number(pitch)||1));
      if(lang)utterance.lang=lang;
      const match=voices().find(v=>v.voiceURI===voiceURI);
      if(match)utterance.voice=match;
      utterance.onend=()=>done(true);
      utterance.onerror=()=>done(false);
      speaking=true;
      globalThis.speechSynthesis.speak(utterance);
    }catch{done(false);}
  });
}

export function stopSpeaking(){
  if(!speechAvailable())return;
  try{globalThis.speechSynthesis.cancel();}catch{}
  speaking=false;
}
