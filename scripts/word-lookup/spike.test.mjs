import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { locateCase, compactDictionary, validateSelection, lookupCase, dictionaryFromSnapshot } from './spike.mjs';

const fixture = {
  word: 'read', source: {url:'https://en.wiktionary.org/wiki/read',license:{name:'CC BY-SA 4.0',url:'https://creativecommons.org/licenses/by-sa/4.0/'}},
  entries: [
    {language:{code:'en'}, partOfSpeech:'verb', forms:[], senses:[{definition:'Read in the present tense',tags:['present']}],pronunciations:[{type:'ipa',text:'/ɹiːd/',tags:['UK']},{type:'enpr',text:'rēd',tags:[]}]},
    {language:{code:'en'}, partOfSpeech:'verb', forms:[], senses:[{definition:'simple past of read',tags:['past']}],pronunciations:[{type:'ipa',text:'/ɹɛd/',tags:['Received Pronunciation']}]},
  ],
};
const selection = {status:'ok',meaning:'读了',lemma:null,pronunciationId:'e1-p0'};

test('the two saw occurrences resolve to different exact UTF-16 ranges', () => {
  assert.deepEqual(locateCase({sentence:'I saw a saw.',word:'saw',occurrence:2}),{sentence:'I saw a saw.',word:'saw',start:8,end:11});
  assert.equal(locateCase({sentence:'😀 I saw a saw.',word:'saw',occurrence:1}).start,5);
  assert.throws(()=>locateCase({sentence:'I saw it.',word:'saw',occurrence:2}));
});

test('all 20 hand-authored cases have exact selected text and unique IDs', async () => {
  const cases = JSON.parse(await readFile(new URL('./cases.json',import.meta.url),'utf8'));
  assert.equal(cases.length,20);
  assert.equal(new Set(cases.map(c=>c.id)).size,20);
  for (const c of cases) {
    const located=locateCase(c);
    assert.equal(c.sentence.slice(located.start,located.end),c.word);
  }
});

test('IPA candidates remain attached to entry senses and tense; enpr is excluded', () => {
  const d=compactDictionary(fixture);
  assert.equal(d.entries[1].senses[0].tags[0],'past');
  assert.equal(d.entries[0].pronunciations.length,1);
  assert.equal(d.entries[1].pronunciations[0].id,'e1-p0');
  assert.deepEqual(d.source,fixture.source);
});

test('replay preserves the exact candidate IDs and senses used in the earlier run', () => {
  const snapshot=compactDictionary(fixture);
  assert.deepEqual(compactDictionary(dictionaryFromSnapshot(snapshot)),snapshot);
});

test('the server resolves an existing ID, with no free-form IPA accepted', () => {
  const d=compactDictionary(fixture);
  assert.equal(validateSelection(selection,d).phonetic.text,'/ɹɛd/');
  assert.equal(validateSelection({...selection,pronunciationId:'invented'},d).phonetic,null);
  assert.throws(()=>validateSelection({...selection,ipa:'/fake/'},d));
  assert.throws(()=>validateSelection({...selection,meaning:''},d));
});

test('a lemma identical to the selected surface word is suppressed', () => {
  const d=compactDictionary(fixture);
  assert.equal(validateSelection({...selection,lemma:'read'},d,{word:'read'}).lemma,null);
});

test('failed model calls retain safe phase diagnostics and dictionary evidence', async () => {
  try {
    await lookupCase({sentence:'I read it yesterday.',word:'read',occurrence:1},{getDictionary:async()=>fixture,select:async()=>{throw new Error('provider offline');}});
    assert.fail('Expected model failure');
  } catch(error) {
    assert.equal(error.diagnostics.phase,'model');
    assert.equal(error.diagnostics.dictionaryStatus,'available');
    assert.equal(error.diagnostics.dictionary.entries.length,2);
    assert.equal(error.diagnostics.error,'Error');
    assert.equal('cause' in error.diagnostics,false);
  }
});

test('unknown output cannot invent a meaning or use a pronunciation', () => {
  const d=compactDictionary({entries:[]});
  assert.equal(validateSelection({status:'unknown',meaning:'',lemma:null,pronunciationId:null},d).status,'unknown');
  assert.throws(()=>validateSelection({status:'unknown',meaning:'某种工具',lemma:null,pronunciationId:null},d));
});

test('dictionary failure still permits meaning, but never a fabricated phonetic', async () => {
  const result=await lookupCase({sentence:'I read it yesterday.',word:'read',occurrence:1}, {
    getDictionary:async()=>{throw new Error('offline');},
    select:async(input)=>{
      assert.equal(input.dictionary.entries.length,0);
      assert.equal('expected' in input,false);
      return selection;
    },
  });
  assert.equal(result.dictionaryStatus,'unavailable');
  assert.equal(result.result.meaning,'读了');
  assert.equal(result.result.phonetic,null);
});

test('unknown words and model errors are not silently reported as complete successes', async () => {
  const c={sentence:'I found a qzxnotaword.',word:'qzxnotaword',occurrence:1};
  const result=await lookupCase(c, {getDictionary:async()=>({entries:[]}),select:async()=>({status:'unknown',meaning:'',lemma:null,pronunciationId:null})});
  assert.equal(result.dictionaryStatus,'missing');
  assert.equal(result.result.status,'unknown');
  await assert.rejects(lookupCase(c,{getDictionary:async()=>({entries:[]}),select:async()=>{throw new Error('model offline');}}),/model offline/);
});
