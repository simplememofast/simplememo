#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readPrivateInput} from './autonomy-outcome-score.mjs';
import {ROOT,businessPolicy,businessCoverage,inventoryBusinessRates,validateBusinessPolicy,businessStatus,jstDay,weekKey,businessTaskId} from '../growth/lib/business-automation.mjs';

export const SERIES_FILE = 'data/business-automation-weekly.json';
export const CHART_FILE = 'assets/img/autopilot/business-automation-weekly.svg';
const git = args => execFileSync('git',args,{cwd:ROOT,encoding:'utf8',maxBuffer:8*1024*1024}).trim();
const shift = (d,n) => new Date(Date.parse(d)+n*86400000).toISOString().slice(0,10);
const day = s => typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;
const utcStamp = s => typeof s==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(s)
  && Number.isFinite(Date.parse(s)) && new Date(s).toISOString()===(s.includes('.')?s:s.slice(0,-1)+'.000Z');
const unknownActual = () => ({state:'NO_EVIDENCE',verified_full_automation_rate:null,verified_ai_utilization_rate:null,observed_work_saved_rate:null});

// Local main-line history only. A week with no ledger is unknown, never interpolated.
export function buildWeeklySeries({now = new Date(), ref='origin/main'} = {}) {
  const p=businessPolicy(), through=jstDay(now), week=weekKey(now);
  if(git(['rev-parse','--is-shallow-repository']) !== 'false') throw new Error('full_history_required');
  const changes=git(['log','--first-parent','--format=%H %cI',ref,'--','data/automation-coverage.json']).split('\n')
    .filter(Boolean).map(x=>{const [commit,at]=x.split(' ');return {commit,at};}).reverse();
  const cache=new Map(), points=[];
  for(let start=p.history_from;start<=week;start=shift(start,7)) {
    const end=shift(start,6), cutoff=end < through ? Date.parse(shift(end,1)+'T00:00:00+09:00')-1 : new Date(now).getTime();
    const change=changes.filter(c=>Date.parse(c.at)<=cutoff).at(-1);
    let inventory=null;
    if(change) {
      if(!cache.has(change.commit)) cache.set(change.commit,JSON.parse(git(['show',change.commit+':data/automation-coverage.json'])));
      const coverage=cache.get(change.commit), v=inventoryBusinessRates(coverage).overall;
      inventory={source_commit:change.commit,committed_at:change.at,inventory_measured_at:coverage.measured_at,
        defined_tasks:v.defined,ai_executes:v.ai_executes,ai_proposes:v.counts.ai_proposes,
        declared_execution_rate:v.declared_execution_rate,declared_ai_utilization_rate:v.declared_ai_utilization_rate,
        scope_key:createHash('sha256').update(JSON.stringify(coverage.tasks.filter(t=>t.executor!=='intentional_no').map(businessTaskId).sort())).digest('hex'),
        basis:'main_line_inventory_snapshot_not_weekly_runtime_measurement'};
    }
    points.push({week:start,through:end<through ? end : through,partial_week:end>=through,
      inventory,actual:unknownActual()});
  }
  // Task keys are public, but the chart needs only equality; no 12KB list per week.
  for(let i=0;i<points.length;i++) if(points[i].inventory) {
    const v=points[i].inventory, prev=points[i-1]?.inventory;
    v.scope_changed=!!prev && prev.scope_key !== v.scope_key;
    v.carried_forward=!!prev && prev.source_commit === v.source_commit;
  }
  for(const p of points) if(p.inventory) {p.inventory.scope_fingerprint=p.inventory.scope_key;delete p.inventory.scope_key;}
  return {schema_version:1,instrument:'business-automation-v1',generated_at:new Date(now).toISOString(),
    timezone:'Asia/Tokyo',from:p.history_from,through,main_ref_commit:git(['rev-parse',ref]),
    actual_basis:'No admitted weekly runtime observations were available at initial publication. Missing weeks remain null.',
    inventory_basis:'Weekly as-of main-line ledger classifications. Same source may carry forward; measured_at is retained. Not complete business or human-activity proof.',
    target:p.target,points};
}

export function validateWeeklySeries(d) {
  const errors=[];
  if(d?.schema_version!==1 || d.instrument!=='business-automation-v1' || d.timezone!=='Asia/Tokyo'
    || !Array.isArray(d.points) || !d.points.length || d.from!==businessPolicy().history_from
    || d.points[0]?.week!==d.from || !Number.isFinite(Date.parse(d.generated_at))
    || d.through!==jstDay(d.generated_at) || d.points.at(-1)?.week!==weekKey(d.generated_at)
    || JSON.stringify(d.target)!==JSON.stringify(businessPolicy().target)) return ['series_schema'];
  for(let i=0;i<d.points.length;i++) {
    const p=d.points[i], v=p.inventory;
    if(p.week!==shift(d.from,7*i) || p.through!==(shift(p.week,6)<d.through ? shift(p.week,6) : d.through)
      || p.partial_week!==(shift(p.week,6)>=d.through)) errors.push('weekly_calendar');
    if(v) {
      if(!/^[a-f0-9]{40}$/.test(v.source_commit) || !Number.isFinite(Date.parse(v.committed_at))
        || Date.parse(v.committed_at)>Date.parse(shift(p.through,1)+'T00:00:00+09:00')-1
        || !Number.isSafeInteger(v.defined_tasks) || v.defined_tasks<=0
        || !Number.isSafeInteger(v.ai_executes) || v.ai_executes<0 || !Number.isSafeInteger(v.ai_proposes) || v.ai_proposes<0
        || v.ai_executes+v.ai_proposes>v.defined_tasks
        || v.declared_execution_rate!==v.ai_executes/v.defined_tasks
        || v.declared_ai_utilization_rate!==(v.ai_executes+v.ai_proposes)/v.defined_tasks
        || v.basis!=='main_line_inventory_snapshot_not_weekly_runtime_measurement') errors.push('inventory_arithmetic');
    }
    const a=p.actual;
    if(a?.basis==='reviewed_private_weekly_aggregate') {
      const n=a.defined_tasks, known=n-a.unknown_tasks;
      const cohort=a.inventory_at_observation;
      if(!/^[a-f0-9]{64}$/.test(a.scope_fingerprint) || cohort?.scope_fingerprint!==a.scope_fingerprint
        || !day(cohort?.inventory_measured_at) || !day(a.window?.from) || !day(a.window?.through)
        || Object.keys(a.window).length!==2 || !utcStamp(a.source_observed_at)
        || cohort?.defined_tasks!==n || !Number.isSafeInteger(cohort?.ai_executes) || cohort.ai_executes<0
        || !Number.isSafeInteger(cohort?.ai_proposes) || cohort.ai_proposes<0 || cohort.ai_executes+cohort.ai_proposes>n
        || !Number.isSafeInteger(n) || n<=0 || !Number.isSafeInteger(a.unknown_tasks) || a.unknown_tasks<0 || a.unknown_tasks>n
        || !Number.isSafeInteger(a.verified_full_tasks) || a.verified_full_tasks<0 || a.verified_full_tasks>known
        || !Number.isSafeInteger(a.verified_ai_utilization_tasks) || a.verified_ai_utilization_tasks<a.verified_full_tasks || a.verified_ai_utilization_tasks>known
        || !['MEASURED','PARTIAL_EVIDENCE'].includes(a.state) || (a.state==='MEASURED')!==(known===n)
        || a.verified_full_automation_rate!==(known===n ? a.verified_full_tasks/n : null)
        || a.verified_ai_utilization_rate!==(known===n ? a.verified_ai_utilization_tasks/n : null)
        || !(a.observed_work_saved_rate===null || Number.isFinite(a.observed_work_saved_rate)&&a.observed_work_saved_rate>=0&&a.observed_work_saved_rate<=1)
        || !Number.isFinite(Date.parse(a.source_observed_at)) || Date.parse(a.source_observed_at)>Date.parse(d.generated_at)
        || weekKey(a.source_observed_at)!==p.week || a.window?.through!==jstDay(a.source_observed_at)
        || a.window?.from!==shift(a.window.through,-27)
        || !['attested','not_attested'].includes(a.scope_completeness)) errors.push('runtime_aggregate');
    } else if(a?.state!=='NO_EVIDENCE' || ['verified_full_automation_rate','verified_ai_utilization_rate','observed_work_saved_rate'].some(k=>a[k]!==null)) errors.push('historical_runtime_claim');
  }
  return [...new Set(errors)];
}

const xml = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function renderBusinessChart(d) {
  const n=d.points.length, left=78,right=988,width=right-left, x=i=>left+i*width/Math.max(1,n-1);
  const elements=[], text=(x,y,t,size=14,color='#334155')=>elements.push(`<text x="${x}" y="${y}" font-size="${size}" fill="${color}">${xml(t)}</text>`);
  const panel=(top,bottom,title)=>{
    text(left,top-22,title,19,'#0f172a');
    for(const val of [0,25,50,75,100]) {const y=bottom-(bottom-top)*val/100;elements.push(`<path d="M${left},${y} H${right}" stroke="#e2e8f0"/>`);text(26,y+5,val+'%',13);}
    const y=bottom-(bottom-top)*.9;elements.push(`<path d="M${left},${y} H${right}" stroke="#dc2626" stroke-dasharray="5 5"/>`);text(right+6,y+4,'90%',12,'#dc2626');
    return value=>bottom-(bottom-top)*value;
  };
  const actualY=panel(118,288,'実運用：AI完全自動化率・AI活用率・省力化率（直近28日）');
  if(!d.points.some(p=>p.actual?.verified_full_automation_rate!=null || p.actual?.verified_ai_utilization_rate!=null || p.actual?.observed_work_saved_rate!=null))
    text(225,214,'週次の実運用証拠は未確認。欠測は0%ではありません。',18,'#64748b');
  for(const [key,color] of [['verified_full_automation_rate','#2563eb'],['verified_ai_utilization_rate','#059669'],['observed_work_saved_rate','#9333ea']]) {
    let segment=[];
    const flush=()=>{if(segment.length)elements.push(`<polyline fill="none" stroke="${color}" stroke-width="3" points="${segment.map(p=>p.join(',')).join(' ')}"/>`);segment=[];};
    d.points.forEach((p,i)=>{const val=p.actual?.[key];if(val==null || (i>0 && p.actual?.scope_fingerprint!==d.points[i-1].actual?.scope_fingerprint))flush();if(val!=null){segment.push([x(i),actualY(val)]);elements.push(`<circle cx="${x(i)}" cy="${actualY(val)}" r="4" fill="${color}"/>`);}});flush();
  }
  text(520,321,'完全自動化',14,'#2563eb');text(680,321,'AI活用',14,'#059669');text(820,321,'実測省力化',14,'#9333ea');
  const y=panel(397,567,'台帳の参考値：AI実行の構成率・AI活用の構成率（全業務を分母）');
  for(const [key,color,label] of [['declared_execution_rate','#2563eb','AI実行'],['declared_ai_utilization_rate','#059669','AI活用']]) {
    let segments=[],segment=[];
    d.points.forEach((p,i)=>{const val=p.inventory?.[key];if(val==null || p.inventory?.scope_changed){if(segment.length)segments.push(segment);segment=[];}if(val!=null)segment.push([x(i),y(val)]);});
    if(segment.length)segments.push(segment);
    for(const pts of segments)elements.push(`<polyline fill="none" stroke="${color}" stroke-width="3" points="${pts.map(p=>p.join(',')).join(' ')}"/>`);
    d.points.forEach((p,i)=>{if(p.inventory)elements.push(`<circle cx="${x(i)}" cy="${y(p.inventory[key])}" r="4" fill="${color}"/>`);});
    const last=d.points.at(-1)?.inventory?.[key]; text(label==='AI実行'?600:805,622,`${label}: ${last==null?'unknown':(100*last).toFixed(1)+'%'}`,15,color);
  }
  const ticked=new Set();
  d.points.forEach((p,i)=>{const m=p.week.slice(0,7);if(!ticked.has(m)){ticked.add(m);text(x(i)-10,593,p.week.slice(5,7),13);}});
  text(82,622,'2026年 / 日本時間の週 · 対象変更時は線を切る',13);
  text(82,650,'3月～最初の台帳以前は未確認。週次値の補間・捏造はしない。',13);
  text(82,674,'台帳はテスト済み準備を含む実装分類。実際の無人完走を示す証拠とは別。',13);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="708" viewBox="0 0 1080 708" role="img" aria-labelledby="title desc"><title id="title">YURIKA + SimpleMemo weekly business automation</title><desc id="desc">Actual operation and inventory snapshots are separate. Missing observations are not zero; target strictly above 90 percent.</desc><rect width="1080" height="708" fill="#fff"/><g font-family="Arial, Hiragino Sans, sans-serif"><text x="78" y="38" font-size="26" font-weight="bold" fill="#0f172a">ユリカ社＋シンプルメモ · 毎週のAI自動化率</text><text x="78" y="65" font-size="14" fill="#64748b">登録済み業務の範囲。法人全体の網羅性は未確認 · ${xml(d.through)}</text>${elements.join('')}</g></svg>\n`;
}

export function privateWeeklyChart(history, base=JSON.parse(fs.readFileSync(path.join(ROOT,SERIES_FILE)))) {
  const d=structuredClone(base), byWeek=new Map(d.points.map(p=>[p.week,p]));
  for(const p of history.points) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(p.week) || p.week<base.from) throw new Error('private_chart_week');
    const s=p.inventory.overall;
    byWeek.set(p.week,{week:p.week,inventory:{scope_fingerprint:p.scope_key,declared_execution_rate:s.declared_execution_rate,declared_ai_utilization_rate:s.declared_ai_utilization_rate},
      actual:{scope_fingerprint:p.scope_key,verified_full_automation_rate:p.actual.verified_full_automation_rate,verified_ai_utilization_rate:p.actual.verified_ai_utilization_rate,observed_work_saved_rate:p.actual.observed_work_saved_rate}});
  }
  const latest=history.points.at(-1);
  if(latest) d.through=latest.as_of;
  d.points=[];
  for(let week=d.from;week<=weekKey(d.through+'T00:00:00+09:00');week=shift(week,7)) d.points.push(byWeek.get(week) ?? {week,inventory:null,actual:unknownActual()});
  for(let i=1;i<d.points.length;i++) {
    const current=d.points[i].inventory,prev=d.points[i-1].inventory;
    if(current&&prev) current.scope_changed=current.scope_fingerprint!==prev.scope_fingerprint;
  }
  return renderBusinessChart(d);
}

// Produces reviewable local public artifacts only; it never sends or commits them.
export function exportWeeklyAggregates(history,base,previous=null) {
  const d=structuredClone(base);
  if(history?.schema_version!==1 || !Array.isArray(history.points)) throw new Error('weekly_history_schema');
  // Preserve already published observations when a private source later disappears.
  for(const old of previous?.points??[]) {
    if(old.actual?.basis==='reviewed_private_weekly_aggregate') {
      const p=d.points.find(p=>p.week===old.week);if(!p)throw new Error('history_would_be_removed');p.actual=selectPublicActual(old.actual);
    }
  }
  for(const source of history.points) {
    const a=source.actual;
    if(!['MEASURED','PARTIAL_EVIDENCE'].includes(a?.state)) continue;
    const p=d.points.find(p=>p.week===source.week);if(!p)throw new Error('weekly_source_outside_series');
    if(p.actual?.state==='MEASURED' && a.state!=='MEASURED')continue;
    if(p.actual?.source_observed_at && Date.parse(p.actual.source_observed_at)>Date.parse(source.observed_at))continue;
    const s=source.inventory?.overall;
    p.actual=selectPublicActual({basis:'reviewed_private_weekly_aggregate',source_observed_at:source.observed_at,scope_fingerprint:source.scope_key,
      inventory_at_observation:{defined_tasks:s?.defined,ai_executes:s?.ai_executes,ai_proposes:s?.counts?.ai_proposes,
        inventory_measured_at:source.inventory?.inventory_measured_at,scope_fingerprint:source.scope_key},
      state:a.state,window:{from:a.window?.from,through:a.window?.through},scope_completeness:a.scope_completeness,
      defined_tasks:a.defined_tasks,unknown_tasks:a.unknown_tasks,verified_full_tasks:a.verified_full_tasks,
      verified_ai_utilization_tasks:a.verified_ai_utilization_tasks,verified_full_automation_rate:a.verified_full_automation_rate,
      verified_ai_utilization_rate:a.verified_ai_utilization_rate,observed_work_saved_rate:a.observed_work_saved_rate});
  }
  if(d.points.some(p=>p.actual.basis==='reviewed_private_weekly_aggregate'))d.actual_basis='Reviewed private weekly aggregates; public validation checks arithmetic/provenance only, not original human activity or reviewer identity.';
  const errors=validateWeeklySeries(d);if(errors.length)throw new Error('weekly_aggregate_rejected');return d;
}

function selectPublicActual(a) {
  const c=a.inventory_at_observation;
  if(!utcStamp(a.source_observed_at) || !day(a.window?.from) || !day(a.window?.through) || !day(c?.inventory_measured_at))throw new Error('weekly_date_metadata');
  return {basis:'reviewed_private_weekly_aggregate',source_observed_at:new Date(a.source_observed_at).toISOString(),scope_fingerprint:a.scope_fingerprint,
    inventory_at_observation:{defined_tasks:c.defined_tasks,ai_executes:c.ai_executes,ai_proposes:c.ai_proposes,
      inventory_measured_at:c.inventory_measured_at,scope_fingerprint:c.scope_fingerprint},
    state:a.state,window:{from:a.window.from,through:a.window.through},scope_completeness:a.scope_completeness,
    defined_tasks:a.defined_tasks,unknown_tasks:a.unknown_tasks,verified_full_tasks:a.verified_full_tasks,
    verified_ai_utilization_tasks:a.verified_ai_utilization_tasks,verified_full_automation_rate:a.verified_full_automation_rate,
    verified_ai_utilization_rate:a.verified_ai_utilization_rate,observed_work_saved_rate:a.observed_work_saved_rate};
}

function main(args) {
  if(args.includes('--selftest')) {const r=spawnSync(process.execPath,['--test','scripts/business-automation.test.mjs'],{cwd:ROOT,stdio:'inherit'});process.exitCode=r.status??1;return;}
  if(args.includes('--rebuild') || args.includes('--export-weekly')) {
    let d=buildWeeklySeries();
    const previous=fs.existsSync(path.join(ROOT,SERIES_FILE))?JSON.parse(fs.readFileSync(path.join(ROOT,SERIES_FILE))):null;
    if(args.includes('--export-weekly')) {
      const input=readPrivateInput(path.join(process.env.HOME,'.config/simplememo/company-os/business-automation/weekly.json'));
      if(!input)throw new Error('no_weekly_history');d=exportWeeklyAggregates(input,d,previous);
    } else if(previous?.points.some(p=>p.actual.basis==='reviewed_private_weekly_aggregate'))throw new Error('use_export_to_preserve_history');
    const errors=validateWeeklySeries(d);
    if(errors.length)throw new Error(errors.join(','));
    fs.writeFileSync(path.join(ROOT,SERIES_FILE),JSON.stringify(d,null,2)+'\n');
    fs.writeFileSync(path.join(ROOT,CHART_FILE),renderBusinessChart(d));
    console.log(JSON.stringify({state:'local_review_artifacts_built',weeks:d.points.length,actual_measured_weeks:d.points.filter(p=>p.actual.state==='MEASURED').length}));return;
  }
  if(args.includes('--check')) {
    const d=JSON.parse(fs.readFileSync(path.join(ROOT,SERIES_FILE))), errors=[...validateBusinessPolicy(businessPolicy()),...validateWeeklySeries(d)];
    const inventoryOnly=structuredClone(d),expected=buildWeeklySeries({now:new Date(d.generated_at),ref:d.main_ref_commit});
    inventoryOnly.actual_basis=expected.actual_basis;
    for(const p of inventoryOnly.points)p.actual=unknownActual();
    if(JSON.stringify(inventoryOnly)!==JSON.stringify(expected)) errors.push('main_line_provenance');
    if(fs.readFileSync(path.join(ROOT,CHART_FILE),'utf8')!==renderBusinessChart(d)) errors.push('chart_stale');
    if(errors.length)throw new Error(errors.join(','));
    console.log(JSON.stringify({state:'PASS',checks:'policy, calendar, arithmetic, missing-data and chart parity',business_target_proven:false}));return;
  }
  const stateRoot=path.join(process.env.HOME,'.config/simplememo/company-os');
  console.log(JSON.stringify(businessStatus({stateRoot}),null,2));
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {main(process.argv.slice(2));}catch {console.error('business_automation_check_failed');process.exitCode=1;}
}
