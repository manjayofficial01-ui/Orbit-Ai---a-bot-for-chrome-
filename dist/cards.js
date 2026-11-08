// Orbit cards — the questions a run asks, asked in the transcript.
//
// A modal dialog is the wrong shape for a question that belongs to a step. It hides
// the conversation the question is about, it cannot be re-read afterwards, and if you
// look away it holds the run hostage behind a box you have to find again. OpenMausBot
// puts the question in the transcript as a card with the choices on it and leaves a
// settled record behind. This is that shape, built out of DOM nodes (CSP forbids
// innerHTML) and one promise per question.
//
// The presenter is injected: cards.js knows how to draw a card, app.js knows which
// conversation it belongs to. Without a presenter the caller's fallback is used, which
// is what keeps the operator loop testable in node.

export const CARD_KINDS=['approval','question','options','secret','signin'];

const KICKER={approval:'Approval needed',question:'Orbit has a question',options:'Choose one',secret:'A secret is needed',signin:'A sign-in is needed'};

function text(value,max){return String(value??'').slice(0,max);}

/**
 * One question, normalized. `requestId` is what a settled answer is matched against
 * after a re-render, so a card that survived a repaint cannot be answered twice.
 */
export function makeCard(spec={}){
  const kind=CARD_KINDS.includes(spec.kind)?spec.kind:'question';
  const options=(Array.isArray(spec.options)?spec.options:[]).map(o=>text(o,120)).filter(Boolean).slice(0,4);
  return {
    kind,
    requestId:text(spec.requestId,80)||('card-'+Math.random().toString(36).slice(2,10)),
    kicker:text(spec.kicker,60)||KICKER[kind],
    title:text(spec.title,300),
    body:text(spec.body,1200),
    detail:text(spec.detail,4000),
    options:kind==='approval'&&!options.length?['Allow','Deny']:options,
    choice:'',
    settledAt:0,
    at:Number(spec.at)||Date.now(),
  };
}

export function isSettled(card){
  return Boolean(card&&(card.settledAt||card.choice));
}

/** Settle a card in place. Answers are recorded, never re-asked. */
export function settleCard(card,choice){
  if(!card||isSettled(card))return card;
  card.choice=text(choice,300);
  card.settledAt=Date.now();
  return card;
}

/** The one line a settled card keeps, so the transcript still reads as a record. */
export function cardOutcome(card){
  if(!isSettled(card))return '';
  if(card.kind==='approval'){
    if(/^(allow|approve|yes|ok)\b/i.test(card.choice))return 'Approved';
    if(/^(deny|no|cancel|stop)\b/i.test(card.choice))return 'Denied';
  }
  return 'Answered: '+card.choice;
}

/** Which choice settles a card, when a person presses a key instead of a button. */
export function keyboardChoice(card,key){
  if(!card||isSettled(card))return '';
  if(key==='Escape')return card.kind==='approval'?card.options[card.options.length-1]||'Deny':'Cancel';
  const index=Number(key)-1;
  return Number.isInteger(index)&&index>=0&&index<card.options.length?card.options[index]:'';
}

// ---------------------------------------------------------------------------
// Presenter injection
// ---------------------------------------------------------------------------

let presenter=null;

/**
 * Give cards.js somewhere to put a card. `fn(card)` must return a promise that
 * resolves with the chosen option (or '' when the card was dismissed) and must
 * render the settled state itself.
 */
export function configureCards(fn){presenter=typeof fn==='function'?fn:null;}

export function hasCardPresenter(){return Boolean(presenter);}

/**
 * Ask a question and wait for the answer. Falls back to the caller's dialog when no
 * presenter is configured, so the operator loop still runs in a bare document.
 */
export function askCard(spec,{fallback}={}){
  const card=makeCard(spec);
  if(presenter)return presenter(card);
  if(typeof fallback==='function')return Promise.resolve(fallback(card));
  return Promise.reject(Error('No card presenter is configured, so the question could not be shown.'));
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

const GLYPH={approval:'⚑',question:'?',options:'▸',secret:'⌘',signin:'↪'};

/**
 * Build the element for one card. Returns the block; the caller appends it.
 * `onChoose` receives the option text; `onDismiss` is only offered when the question
 * is optional, because an approval with no answer is not an approval.
 */
export function buildCardElement(card,{onChoose,onDismiss,disabled=false,dismissLabel='Dismiss'}={}){
  const doc=globalThis.document;
  const make=(tag,cls,value)=>{const node=doc.createElement(tag);if(cls)node.className=cls;if(value!==undefined)node.textContent=value;return node;};
  const settled=isSettled(card);
  const block=make('div','orbit-card kind-'+(card.kind||'question')+(settled?' settled':''));
  block.dataset.cardId=card.requestId;
  block.setAttribute('role','group');
  block.setAttribute('aria-label',card.kicker||'Question');

  const head=make('div','card-head');
  head.append(make('span',undefined,GLYPH[card.kind]||'?'),make('span','card-kicker',card.kicker||'Question'));
  block.append(head);

  if(card.title){
    const title=make('p','card-title');
    const bdi=doc.createElement('bdi');bdi.textContent=card.title;title.append(bdi);
    block.append(title);
  }
  if(card.body)block.append(make('p','card-body',card.body));
  if(card.detail){
    const pre=make('pre','card-detail');
    pre.textContent=card.detail;
    block.append(pre);
  }

  const row=make('div','card-actions');
  if(settled){
    row.append(make('span','card-outcome',cardOutcome(card)));
  }else{
    card.options.forEach((option,index)=>{
      const button=make('button',index===0?'primary':'',option);
      button.type='button';
      button.disabled=disabled;
      button.onclick=()=>onChoose?.(option);
      row.append(button);
    });
    if(onDismiss){
      const close=make('button','card-dismiss',dismissLabel);
      close.type='button';
      close.disabled=disabled;
      close.onclick=()=>onDismiss();
      row.append(close);
    }
    if(card.options.length>1)row.append(make('span','card-hint','Press '+(card.options.length)+' to answer with the last option, or Esc to dismiss.'));
  }
  block.append(row);
  return block;
}
