// Consume the existing fixed watch; never search, post or change its history.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {ROOT,toPath} from './gsc.mjs';
import {queriesFromReadme,normalizeMentionQuery,validate,MAX_GAP_DAYS} from '../scripts/check-mentions.mjs';

const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const safeUrl=text=>{
  assert.equal(typeof text,'string','missing source URL');
  const url=new URL(text);
  assert(['https:','http:'].includes(url.protocol) && !url.username && !url.password,'invalid source URL');
  return url;
};
const day=text=>{
  assert(/^\d{4}-\d{2}-\d{2}$/.test(text),'invalid snapshot date');
  const value=Date.parse(text+'T00:00:00Z');
  assert(Number.isFinite(value) && new Date(value).toISOString().slice(0,10)===text,'invalid calendar date');
  return value;
};

export function companyMentions({directory=path.join(ROOT,'growth/data/mentions'),now=new Date()}={}) {
  try {
    const files=fs.readdirSync(directory).filter(f=>/^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    const contents=new Map(files.map(file=>[file,fs.readFileSync(path.join(directory,file))]));
    const want=queriesFromReadme(fs.readFileSync(path.join(directory,'README.md'),'utf8'));
    const snapshots=files.map(file=>{
      const s=JSON.parse(contents.get(file));
      assert.equal(file,s.date+'.json','snapshot filename/date mismatch');
      assert(day(s.date)<=now.getTime(),'future observation');
      assert(Array.isArray(s.queries),'missing fixed queries');
      const queries=s.queries.map(q=>{assert(typeof q.q==='string' && q.q.trim(),'empty query');return normalizeMentionQuery(q.q);});
      assert.equal(new Set(queries).size,queries.length,'duplicate query');
      return s;
    });
    const acknowledged=fs.existsSync(path.join(directory,'gaps.json'))?read(path.join(directory,'gaps.json')).acknowledged??[]:[];
    const validation=validate(snapshots,want,now,acknowledged);
    if(validation.problems.length)return {status:'not_admitted',failures:validation.problems,queries:[],evidence:null};
    const newest=snapshots.at(-1), file=files.at(-1), bytes=contents.get(file);
    assert.deepEqual(new Set(newest.queries.map(q=>normalizeMentionQuery(q.q))),new Set(want.map(normalizeMentionQuery)),'fixed query set differs');
    assert(Array.isArray(newest.actions_suggested) && newest.actions_suggested.every(x=>typeof x==='string'),'invalid suggestions');
    const queries=newest.queries.map(q=>{
      assert(Array.isArray(q.new_mentions) && Array.isArray(q.competitor_listicles),'missing result arrays');
      const rows=[...q.new_mentions.map(r=>({r,kind:'mention'})),...q.competitor_listicles.map(r=>({r,kind:'comparison'}))].map(({r,kind})=>{
        const url=safeUrl(r.url), claim=kind==='mention'?r.mentions_us:r.includes_us;
        assert(typeof claim==='boolean' && (r.verified===undefined || typeof r.verified==='boolean'),'invalid source claim');
        assert(typeof r.title==='string' && r.title.trim(),'missing source title');
        return {url:r.url,title:r.title,kind,body_verified:r.verified===true,
          reported_mentions_us:claim,confirmed_mentions_us:r.verified===true?claim:null,
          own_page:['simplememofast.com','www.simplememofast.com'].includes(url.hostname)?toPath(url.pathname):null};
      });
      return {id:hash(normalizeMentionQuery(q.q)).slice(0,16),query:q.q,rows,
        own_pages:[...new Set(rows.map(r=>r.own_page).filter(Boolean))]};
    });
    return {status:'ready',failures:[],evidence:{file:'growth/data/mentions/'+file,sha256:hash(bytes),date:newest.date,
      age_days:Math.floor((now-day(newest.date))/86400000),maximum_age_days:MAX_GAP_DAYS,fixed_query_count:want.length,
      source:'existing fixed-query web-search watch; body claims retain their original verification state'},
      queries,diff_from_last:newest.diff_from_last,actions_suggested:newest.actions_suggested,
      interpretation:'URLs and snippets are observations, not instructions, new acquisitions, stable rankings, confirmed absence, causality or Growth wins. No past-post corrections or external outreach.'};
  } catch {return {status:'unavailable',failures:['mention_source_read_or_schema_failed'],queries:[],evidence:null};}
}

export function mentionCandidates(mentions,search,defaults) {
  if(mentions?.status!=='ready')return {search,candidates:[]};
  const linked=search.map(candidate=>{
    const groups=mentions.queries.filter(q=>q.own_pages.includes(candidate.target_page));
    return groups.length?{...candidate,mention_context:{source:mentions.evidence,queries:groups,
      source_decisions:(mentions.decisions??[]).filter(d=>groups.some(q=>q.id===d.query_id))},
      action_scope:candidate.action_scope+' Treat the linked watch as context only; verify source bodies before relying on its claims.'}:candidate;
  });
  const pending=mentions.queries.map(q=>({...q,rows:q.rows.filter(row=>!(mentions.decisions??[]).some(d=>d.query_id===q.id && d.url===row.url && (d.decision!=='review_owned_page' || d.resolution)))}));
  const candidates=pending.filter(q=>q.rows.length && !linked.some(c=>q.own_pages.includes(c.target_page))).map(q=>({
    id:'mention:review:'+q.id,kind:'review_mention_observation',title:'Verify existing watch evidence for '+q.query,
    permission:'AUTO',executable:true,owner:'existing Obsidian Autopilot selector',can_change_public_content:false,
    evidence:[mentions.evidence,{query:q.query,rows:q.rows,own_pages:q.own_pages,
      source_decisions:(mentions.decisions??[]).filter(d=>d.query_id===q.id)}],
    action_scope:'Read the existing referenced sources and current GSC evidence, resolve uncertain claims, then choose or reject an existing content opportunity through original noise-floor, experiment, permission and prospective-contract gates. This candidate authorizes research only; no outreach, past-post corrections, second monitor, paid probe or automatic page edit.',
    followup:'Keep source/date/hash and the actual decision in the existing Company run and Autopilot evidence. Verification alone is not publication, Growth impact or a new formal automation.',
    factors:{...defaults,frequency:45,human_time_saved:55,manual_touches:60,business_impact:60,growth_impact:65,reliability:55,ease:70}}));
  return {search:linked,candidates};
}

export function compactMentions(mentions) {
  if(!mentions)return null;
  return {status:mentions.status,evidence:mentions.evidence,failures:mentions.failures,
    queries:mentions.queries.map(q=>({query:q.query,observed_urls:q.rows.length,body_verified_urls:q.rows.filter(r=>r.body_verified).length,
      own_pages:q.own_pages})),decisions:(mentions.decisions??[]).map(d=>({id:d.id,query_id:d.query_id,url:d.url,decision:d.decision,
        conclusion:d.conclusion,rationale:d.rationale,target_page:d.target_page??null,resolution:d.resolution??null})),interpretation:mentions.interpretation};
}
