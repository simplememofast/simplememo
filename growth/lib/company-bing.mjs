import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {privateState,atomicJson} from './company-loop.mjs';
import {unseal} from './analytics-envelope.mjs';
import {BING_SITE,BING_REPO,BING_WORKFLOW,BING_LIMIT,bingHash,bingSourceFresh,validDay,offsetDay,summarizeBingDays,validateBingPayload} from './bing-webmaster.mjs';

const DAY=86400000;
const rootFor=stateRoot=>privateState(path.join(stateRoot,'data/bing-webmaster'));
function read(file) {
  const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>BING_LIMIT*2)throw new Error('invalid_private_file');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function write(file,value) {
  privateState(path.dirname(file));atomicJson(file,value);
}
export function bingWeek(now=new Date()) {
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));
  const year=d.getUTCFullYear(),week=Math.ceil(((d-new Date(Date.UTC(year,0,1)))/DAY+1)/7);
  return year+'-W'+String(week).padStart(2,'0');
}

// Browser capture is source-qualified agent evidence, never an API receipt.
export function browserBing({stateRoot,now=new Date()}={}) {
  const root=rootFor(stateRoot);
  if(!fs.existsSync(root))return {status:'unavailable',reason:'no_browser_observation'};
  const weeks=fs.readdirSync(root).filter(n=>/^\d{4}-W\d{2}$/.test(n)).sort().reverse();
  for(const week of weeks) {
    const file=path.join(root,week,'observed-ui.json');if(!fs.existsSync(file))continue;
    try {
      const o=read(file),raw=fs.readFileSync(file),v=read(path.join(root,week,'verification.json'));
      const at=Date.parse(o.observed_at);
      if(o.schema_version!==1 || o.property!==BING_SITE || o.method!=='authenticated_visible_browser_ui_dom'
        || !Number.isFinite(at)||at>now.getTime()||now.getTime()-at>8*DAY||bingWeek(new Date(at))!==week
        || v.files?.find(f=>f.file==='observed-ui.json')?.sha256!==bingHash(raw))throw new Error('invalid_browser_evidence');
      const checkedRows=(rows,kind)=>{
        if(!Array.isArray(rows)||!rows.length||rows.length>1000)throw new Error('invalid_browser_rows');
        const seen=new Set();
        for(const r of rows){if(!validDay(r.date)||r.date>now.toISOString().slice(0,10)||seen.has(r.date))throw new Error('invalid_dates');seen.add(r.date);
          for(const k of kind==='search'?['clicks','impressions']:['cited_pages'])if(!Number.isSafeInteger(r[k])||r[k]<0)throw new Error('invalid_count');
          if(kind==='ai' && r.citations_exact!==null && (!Number.isSafeInteger(r.citations_exact)||r.citations_exact<0||String(r.citations_exact)!==r.citations_display))throw new Error('invalid_ai_count');
        }
        const sorted=[...rows].sort((a,b)=>a.date.localeCompare(b.date));
        if(now.getTime()-Date.parse(sorted.at(-1).date)>8*DAY)throw new Error('stale_browser_dates');return sorted;
      };
      let search={status:'unavailable',reason:'invalid_or_missing_search_rows'},ai={status:'unavailable',reason:'invalid_or_missing_ai_rows'};
      try {
        const rows=checkedRows(o.search?.retained_daily_rows,'search');
        if(o.search.state!=='collected' || typeof o.search.scope!=='string')throw new Error('invalid_search_scope');
        search={status:'collected',scope:o.search.scope,latest7:summarizeBingDays(rows),previous7:summarizeBingDays(rows,{end:offsetDay(rows.at(-1).date,-7)}),last28:summarizeBingDays(rows,{days:28})};
      } catch { /* A search failure never erases valid AI evidence. */ }
      try {
        const rows=checkedRows(o.ai?.daily_rows,'ai');
        if(o.ai.state!=='collected')throw new Error('invalid_ai_state');
        const aiWindow=(days,end=rows.at(-1).date)=>{
          const start=offsetDay(end,1-days),selected=rows.filter(r=>r.date>=start&&r.date<=end);
          if(selected.length!==days)return {status:'partial',start,end,days,citations:null,average_cited_pages:null};
          return {status:'complete',start,end,days,citations:selected.some(r=>r.citations_exact===null)?null:selected.reduce((n,r)=>n+r.citations_exact,0),
            average_cited_pages:selected.reduce((n,r)=>n+r.cited_pages,0)/days};
        };
        ai={status:'collected',latest7:aiWindow(7),previous7:aiWindow(7,offsetDay(rows.at(-1).date,-7)),last28:aiWindow(28),
          displayed_total:o.ai.displayed_total_citations,displayed_period:o.ai.displayed_period,query_count:o.ai.grounding_queries?.length??null,page_count:o.ai.pages?.length??null};
      } catch { /* A failed AI table never erases valid search evidence. */ }
      return {status:search.status==='collected'||ai.status==='collected'?'available':'unavailable',week,origin:o.origin,observed_at:o.observed_at,source:'authenticated_browser_observation',file,sha256:bingHash(raw),search,ai,
        limitations:['Browser observations are agent-collected; provider finality and official CSV completeness are not established.','Rounded displays remain non-exact. Query/page windows may differ from the 7-day summary.'],
        scheduled_execution_verified:false};
    } catch {return {status:'unavailable',reason:'latest_browser_observation_invalid_or_stale',week};}
  }
  return {status:'unavailable',reason:'no_browser_observation'};
}

const command=(name,args,options={})=>execFileSync(name,args,{encoding:'utf8',timeout:60000,maxBuffer:BING_LIMIT*2,stdio:['pipe','pipe','pipe'],...options});
export function collectBingHandoff({stateRoot,now=new Date(),run=command,privateKeyFile=path.join(os.homedir(),'.local/share/simplememo-analytics/keys/recipient-private.pem')}={}) {
  const root=path.join(rootFor(stateRoot),'api');const failures=[];const json=args=>JSON.parse(run('gh',args));
  try {
    const runs=json(['api',`repos/${BING_REPO}/actions/workflows/seo-daily.yml/runs?branch=main&status=completed&per_page=3`]);
    for(const remote of runs.workflow_runs??[]) {
      try {
        if(remote.repository?.full_name!==BING_REPO||remote.path!==BING_WORKFLOW||remote.head_branch!=='main'||remote.status!=='completed'
          ||!['schedule','workflow_dispatch'].includes(remote.event)||!Number.isSafeInteger(remote.id)||!Number.isSafeInteger(remote.run_attempt))throw new Error('remote');
        const jobs=json(['api',`repos/${BING_REPO}/actions/runs/${remote.id}/attempts/${remote.run_attempt}/jobs?per_page=100`]);
        const matches=(jobs.jobs??[]).filter(j=>j.name==='Bing search read-only');
        if(matches.length!==1||matches[0].conclusion!=='success'){failures.push({run_id:remote.id,reason:matches[0]?.conclusion==='skipped'?'api_not_enabled':'bing_job_not_successful'});continue;}
        remote.bing_job_conclusion='success';
        const listing=json(['api',`repos/${BING_REPO}/actions/runs/${remote.id}/artifacts?per_page=100`]);
        const artifacts=listing.artifacts?.filter(a=>a.name===`bing-search-encrypted-${remote.id}-${remote.run_attempt}`&&!a.expired);
        if(artifacts?.length!==1||!Number.isSafeInteger(artifacts[0].size_in_bytes)||artifacts[0].size_in_bytes>BING_LIMIT*2)throw new Error('artifact');
        const output=path.join(root,`${remote.id}-${remote.run_attempt}.json`);
        try {
          const previous=read(path.join(root,'latest.json'));
          if(previous.run_id===remote.id && previous.run_attempt===remote.run_attempt && previous.artifact_id===artifacts[0].id && previous.output===output) {
            const cached=read(output);
            if(bingHash(fs.readFileSync(output))!==previous.sha256)throw new Error('integrity');
            validateBingPayload(cached,{now,remote});
            const receipt={...previous,status:cached.status==='collected'&&Object.values(cached.sources).every(s=>bingSourceFresh(s,now))?'verified':'partial',remote,observed_at:now.toISOString(),failures,reused:true};
            write(path.join(root,'latest.json'),receipt);write(path.join(root,'health.json'),{status:receipt.status,observed_at:now.toISOString(),failures});return receipt;
          }
        } catch { /* Re-download invalid local evidence from the same verified artifact. */ }
        fs.mkdirSync(root,{recursive:true,mode:0o700});const dir=fs.mkdtempSync(path.join(root,'download-'));fs.chmodSync(dir,0o700);
        try {
          run('gh',['run','download',String(remote.id),'--repo',BING_REPO,'--name',artifacts[0].name,'--dir',dir]);
          if(JSON.stringify(fs.readdirSync(dir))!==JSON.stringify(['bing-search.enc.json']))throw new Error('files');
          const envelope=read(path.join(dir,'bing-search.enc.json'));
          const payload=validateBingPayload(unseal(envelope,fs.readFileSync(privateKeyFile,'utf8')),{now,remote});
          write(output,payload);
          const receipt={schema_version:1,source:'bing_search_api',status:payload.status==='collected'&&Object.values(payload.sources).every(s=>bingSourceFresh(s,now))?'verified':'partial',observed_at:now.toISOString(),
            run_id:remote.id,run_attempt:remote.run_attempt,remote,output,sha256:bingHash(fs.readFileSync(output)),artifact_id:artifacts[0].id,
            provider_series:payload.series,source_window:payload.summary.latest7,failures,scheduled_provider_execution:remote.event==='schedule',scheduled_company_execution_verified:false};
          write(path.join(root,'latest.json'),receipt);write(path.join(root,'health.json'),{status:receipt.status,observed_at:now.toISOString(),failures});return receipt;
        } finally {fs.rmSync(dir,{recursive:true,force:true});}
      } catch {failures.push({run_id:remote.id,reason:'handoff_unavailable_or_invalid'});}
    }
  } catch {failures.push({reason:'github_read_unavailable'});}
  const result={source:'bing_search_api',status:'unavailable',observed_at:now.toISOString(),failures,retry:'next_existing_tick',new_dispatches:0};
  write(path.join(root,'health.json'),result);return result;
}

export function bingView({stateRoot,now=new Date()}={}) {
  let api={status:'unavailable',reason:'no_verified_api_handoff'};
  try {
    const root=path.join(rootFor(stateRoot),'api'),receipt=read(path.join(root,'latest.json'));
    const file=fs.realpathSync(receipt.output);
    if(!file.startsWith(fs.realpathSync(root)+path.sep)||bingHash(fs.readFileSync(file))!==receipt.sha256)throw new Error('integrity');
    const p=validateBingPayload(read(file),{now,remote:receipt.remote});
    api={status:p.status==='collected'&&Object.values(p.sources).every(s=>bingSourceFresh(s,now))?'verified':'partial',
      sources:Object.fromEntries(Object.entries(p.sources).map(([k,s])=>[k,{status:s.status,window:s.window??null,stale:!bingSourceFresh(s,now),reason:s.reason??null}])),observed_at:p.observed_at,file,sha256:receipt.sha256,summary:p.summary,series:p.series,
      latest_handoff_health:fs.existsSync(path.join(root,'health.json'))?read(path.join(root,'health.json')).status:'unknown',
      scheduled_provider_execution:receipt.remote.event==='schedule',scheduled_company_execution_verified:false,limitations:p.limitations};
  } catch { /* no invented API values; browser remains an independent series */ }
  const browser=browserBing({stateRoot,now});
  return {api,browser,interpretation:'Bing API, Bing browser observations, GSC and the fixed AI probe remain distinct series. No implied UI/API parity or combined citations.'};
}

// A native browser agent reserves attempts through the same daily owner. There
// is no browser session extraction or second timer in this module.
export function bingCapture(options={}) {
  const action=options.action??'status';
  if(action==='status')return captureState(options);
  if(!['begin','complete','fail'].includes(action))throw new Error('invalid_action');
  const root=rootFor(options.stateRoot),lock=path.join(root,'capture.lock');let fd;
  try {fd=fs.openSync(lock,'wx',0o600);} catch(e){if(e.code==='EEXIST')return {status:'busy',week:bingWeek(options.now)};throw e;}
  try {return captureState(options);} finally {fs.closeSync(fd);fs.unlinkSync(lock);}
}
function captureState({stateRoot,now=new Date(),action='status',outcome=null,attemptId=null}={}) {
  const week=bingWeek(now),root=rootFor(stateRoot);
  const records=fs.readdirSync(root).filter(n=>/^capture-\d{4}-W\d{2}\.json$/.test(n)).map(n=>{
    const file=path.join(root,n),state=read(file);
    if(state.schema_version!==1||n!=='capture-'+state.week+'.json'||!Array.isArray(state.attempts))throw new Error('invalid_capture_state');
    return {file,state,last:state.attempts.at(-1)};
  });
  const running=records.filter(r=>r.last?.status==='running');
  if(running.length>1)throw new Error('multiple_running_captures_require_owner_diagnosis');
  const target=['complete','fail'].includes(action)?running.find(r=>r.last.id===attemptId):null;
  if(['complete','fail'].includes(action)&&!target)throw new Error('capture_attempt_mismatch');
  if(running.length&&!target)return {status:'in_progress',week:running[0].state.week,current_week:week,attempt_id:running[0].last.id,owner_thread_id:running[0].last.owner_thread_id??null,action:'inspect_original_owner_before_retry'};
  const file=target?.file??path.join(root,'capture-'+week+'.json');
  let state=target?.state??records.find(r=>r.file===file)?.state??{schema_version:1,week,attempts:[]};
  const observation=browserBing({stateRoot,now}),authFile=path.join(root,'capture-auth.json');
  let authBlocked=false;
  if(fs.existsSync(authFile)) {
    const blocked=read(authFile);
    const recovered=observation.status==='available' && Date.parse(observation.observed_at)>Date.parse(blocked.blocked_at);
    authBlocked=!blocked.resolved_at&&!recovered;
    if(!blocked.resolved_at&&recovered&&action!=='status')write(authFile,{...blocked,resolved_at:now.toISOString(),recovery_observation:observation.file,recovery_sha256:observation.sha256});
  }
  const complete=observation.status==='available'&&(observation.week===week || (action==='complete' && observation.week===state.week))&&observation.ai.status==='collected'&&observation.search.status==='collected'&&observation.ai.latest7.status==='complete'&&observation.search.latest7.status==='complete';
  if(complete&&action!=='fail') {
    if(action==='complete') {
      const last=state.attempts.at(-1);
      if(Date.parse(observation.observed_at)<Date.parse(last.started_at))throw new Error('capture_attempt_mismatch');
      last.status='verified';last.finished_at=now.toISOString();last.evidence=observation.file;last.sha256=observation.sha256;write(file,state);
    }
    return {status:'complete',week:observation.week,current_week:week,evidence:observation.file,action:observation.week===week?'reuse_current_week':'original_week_capture_closed; check_current_week'};
  }
  if(authBlocked&&!target)return {status:'auth_required',week,action:'wait_for_confirmed_authentication; preserve other sources'};
  if(['complete','fail'].includes(action)) {
    const last=state.attempts.at(-1);
    if(!last||last.id!==attemptId||last.status!=='running')throw new Error('capture_attempt_mismatch');
    if(action==='complete')throw new Error('save_and_validate_current_week_observation_before_completion');
    if(!['auth_required','provider_transient','export_unavailable','invalid_data'].includes(outcome))throw new Error('invalid_outcome');
    last.status=outcome;last.finished_at=now.toISOString();write(file,state);
    if(outcome==='auth_required'){authBlocked=true;write(authFile,{blocked_at:now.toISOString(),week:state.week,attempt_id:last.id});}
    if(state.week!==week)return {status:outcome==='auth_required'?'auth_required':'prior_week_attempt_closed',week:state.week,current_week:week,action:'read_current_week_state_before_retry'};
  }
  const last=state.attempts.at(-1);
  if(last?.status==='running')return {status:'in_progress',week,attempt_id:last.id,action:'inspect_original_owner_before_retry'};
  if(last?.status==='auth_required' && authBlocked)return {status:'auth_required',week,action:'wait_for_confirmed_authentication; preserve other sources'};
  if(state.attempts.length>=3)return {status:'retry_budget_exhausted',week,action:'retain_failure_for_existing_owner_diagnosis'};
  if(last&&now-Date.parse(last.finished_at)<6*3600000)return {status:'retry_later',week,next_attempt_at:new Date(Date.parse(last.finished_at)+6*3600000).toISOString()};
  if(action==='begin') {
    const id=randomUUID();state.attempts.push({id,status:'running',started_at:now.toISOString(),owner_thread_id:process.env.CODEX_THREAD_ID??null});write(file,state);
    return {status:'reserved',week,attempt_id:id,preserve_sections:observation.week===week?['search','ai'].filter(k=>observation[k]?.status==='collected'&&observation[k].latest7.status==='complete'):[]};
  }
  return {status:'due',week,attempts:state.attempts.length,action:'reserve_once_then_use_authorized_browser'};
}

export function bingReport(view) {
  const lines=['','## Bing search and AI citation evidence','',`API: ${view.api.status}; ${view.api.reason??view.api.file??'see receipt'}.`];
  if(view.api.summary)lines.push('API series (UI parity unverified): '+JSON.stringify(view.api.summary));
  const b=view.browser;lines.push(`Browser: ${b.status}; ${b.reason??b.observed_at??'unknown'}.`);
  if(b.status==='available') {
    lines.push(`Observation: ${b.origin}; ${b.file}.`,'','| Source / metric | Latest 7 days | Previous 7 days |','|---|---:|---:|');
    const s=b.search,a=b.ai;
    for(const [label,key] of [['Bing search clicks','clicks'],['Bing search impressions','impressions']])lines.push(`| ${label} | ${s.latest7?.[key]??'unknown'} | ${s.previous7?.[key]??'unknown'} |`);
    lines.push(`| Bing AI citations | ${a.latest7?.citations??'unknown'} | ${a.previous7?.citations??'unknown'} |`,
      `Search period: ${s.latest7?.start??'unknown'}..${s.latest7?.end??'unknown'}; previous ${s.previous7?.start??'unknown'}..${s.previous7?.end??'unknown'}.`,
      `AI period: ${a.latest7?.start??'unknown'}..${a.latest7?.end??'unknown'}; previous ${a.previous7?.start??'unknown'}..${a.previous7?.end??'unknown'}.`,
      `Query sample: ${a.query_count??'unknown'}; cited-page rows: ${a.page_count??'unknown'}. Original table windows and rounding are in the retained observation.`);
  }
  lines.push(view.interpretation,'Browser capture and configuration do not prove unattended scheduled execution.');return lines;
}
