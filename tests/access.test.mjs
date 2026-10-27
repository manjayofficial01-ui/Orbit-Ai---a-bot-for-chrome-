import test from 'node:test';
import assert from 'node:assert/strict';
import {hasFullAccess,ensureSiteAccess} from '../dist/page-access.js';

// The access gate is the one place every page path asks for a site: full access
// counts, an exact per-site grant counts, otherwise one prompt for the pattern.
function permHost({full=false,site=false,requestResult=true,throwOnRequest=false}){
  const calls={contains:[],requested:[]},granted=new Set();
  globalThis.chrome={permissions:{
    async contains({origins}){calls.contains.push(...origins);
      return origins.every(o=>o==='<all_urls>'?full:granted.has(o)||site);},
    async request({origins}){if(throwOnRequest)throw Error('no user gesture');calls.requested.push(...origins);
      if(requestResult)for(const o of origins)granted.add(o);return requestResult;}
  }};
  return {calls,restore(){delete globalThis.chrome;}};
}

test('full access short-circuits every site gate without prompting',async()=>{
  const h=permHost({full:true});
  try{
    assert.equal(await hasFullAccess(),true);
    assert.equal(await ensureSiteAccess('https://example.com/*'),true);
    assert.equal(h.calls.requested.length,0,'full access must never trigger a per-site prompt');
    assert.ok(h.calls.contains.every(o=>o==='<all_urls>'),'only the blanket grant is even consulted');
  }finally{h.restore();}
});

test('an exact per-site grant answers without a prompt',async()=>{
  const h=permHost({full:false,site:true});
  try{
    assert.equal(await ensureSiteAccess('https://example.com/*'),true);
    assert.equal(h.calls.requested.length,0);
    assert.ok(h.calls.contains.includes('https://example.com/*'),'the exact pattern is consulted');
  }finally{h.restore();}
});

test('otherwise the gate asks once for the pattern',async()=>{
  const h=permHost({});
  try{
    assert.equal(await ensureSiteAccess('https://example.com/*'),true);
    assert.deepEqual(h.calls.requested,['https://example.com/*']);
    assert.equal(await ensureSiteAccess('https://example.com/*'),true,'a granted pattern sticks in Chrome');
    assert.equal(h.calls.requested.length,1);
  }finally{h.restore();}
});

test('a refused or throwing prompt is a plain false, never an exception',async()=>{
  const refused=permHost({requestResult:false});
  try{assert.equal(await ensureSiteAccess('https://example.com/*'),false);}
  finally{refused.restore();}
  const throwing=permHost({throwOnRequest:true});
  try{assert.equal(await ensureSiteAccess('https://example.com/*'),false);}
  finally{throwing.restore();}
});

test('a broken permissions API reads as no access instead of crashing callers',async()=>{
  globalThis.chrome={permissions:{async contains(){throw Error('unavailable');}}};
  try{
    assert.equal(await hasFullAccess(),false);
    assert.equal(await ensureSiteAccess('https://example.com/*'),false);
  }finally{delete globalThis.chrome;}
});
