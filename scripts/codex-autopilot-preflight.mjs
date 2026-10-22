#!/usr/bin/env node
// Pure preflight for the local Codex executor. Reads a fresh connector snapshot;
// never obtains credentials, changes a stop/budget, claims a branch or publishes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decide, todayJst } from './autopilot-gate.mjs';
import { LEDGER_PATH as ROUTINE_LEDGER, RETIREMENT_KEY } from './check-routine-runs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Refusal while routine observation is retired (2026-10-20). A by-design skip, not a fault.
export const OBSERVATION_RETIRED = 'skip_observation_retired';

// routineDoc is the current data/routine-runs.json. It is required: without it the
// observation state is unknown, and reactivating a scheduled run must not pass silently.
export function codexPreflight(snapshot, now = Date.now(), routineDoc) {
  assert.equal(snapshot?.schema_version, 1, 'Unsupported snapshot');
  assert.match(snapshot.task_id ?? '', /^[0-9a-f-]{36}$/, 'A real Codex task ID is required');
  const observed = Date.parse(snapshot.observed_at);
  assert.ok(Number.isFinite(observed) && now >= observed && now-observed <= 300000,
    'Recollect the preflight inputs; snapshot is missing, future-dated or over five minutes old');
  const state = snapshot.state;
  assert.ok(state && ['actions','ccr-0920'].includes(state.route), 'Use the existing primary or retry route');
  assert.equal(state.todayJst, todayJst(new Date(now)), 'Use the current JST day');
  for (const key of ['credentialsAvailable','emergencyStop','agentStopped','githubApiReachable',
    'budgetOver','runCapOverrun','branchClaimed','prTodayExists']) {
    assert.equal(typeof state[key], 'boolean', `${key} is unknown`);
  }
  for (const key of ['prodStatusDate','mainStatusDate']) {
    assert.match(state[key] ?? '', /^\d{4}-\d{2}-\d{2}$/, `${key} could not be read`);
  }
  assert.ok(['none','completed','queued','in_progress'].includes(state.primaryRunStatus),
    'Status of other primary executions is unknown');
  assert.notEqual(state.force, true, 'This scheduled executor does not override duplicate protection');
  assert.ok(routineDoc && typeof routineDoc === 'object' && !Array.isArray(routineDoc),
    'Routine observation ledger is unreadable; the observation state is unknown');
  // This records the executing Codex session's availability, not a fictional
  // CLAUDE_CODE_OAUTH_TOKEN. No key or token is accepted in this snapshot.
  const decision = decide({...state,engine:'codex',secretsPresent:false,
    credentialRejected:!state.credentialsAvailable,force:false});
  // Existing refusals (emergency stop first) keep their own code.
  if (decision.run !== true) return decision;
  // A run that would otherwise start is refused while the ledger carries the retired
  // marker in any form: a reactivated automation needs a restored observer and a
  // reviewed marker removal first.
  if (Object.hasOwn(routineDoc, RETIREMENT_KEY)) {
    return { run: false, code: OBSERVATION_RETIRED,
      reason: `Routine observation is retired (${RETIREMENT_KEY} in data/routine-runs.json). `
        + 'Restore a pinned observer and remove the marker in a reviewed change before scheduled runs resume' };
  }
  return decision;
}

export function runCodexPreflightTests() {
  const now=Date.parse('2026-09-07T21:00:00Z');
  const observedLedger={observed_at:'2026-09-07T20:00:00Z',routines:[]};
  const retiredLedger={...observedLedger,[RETIREMENT_KEY]:{retired_at:'2026-09-07'}};
  // Every existing case runs against an observed (not retired) ledger.
  const gate=(snapshot,at,ledger=observedLedger)=>codexPreflight(snapshot,at,ledger);
  const fixture=()=>({schema_version:1,task_id:'00000000-0000-0000-0000-000000000001',
    observed_at:new Date(now).toISOString(),state:{route:'actions',todayJst:'2026-09-08',
      credentialsAvailable:true,emergencyStop:false,agentStopped:false,githubApiReachable:true,
      budgetOver:false,runCapOverrun:false,branchClaimed:false,claimHasWork:null,claimAgeMinutes:null,
      claimDeclarations:null,prTodayExists:false,prodStatusDate:'2026-09-07',mainStatusDate:'2026-09-07',
      primaryRunStatus:'completed',force:false}});
  assert.equal(gate(fixture(),now).run,true);
  for (const change of [{credentialsAvailable:false},{emergencyStop:true},{agentStopped:true},
    {budgetOver:true},{runCapOverrun:true},{githubApiReachable:false},{branchClaimed:true},
    {prTodayExists:true},{prodStatusDate:'2026-09-08'},{mainStatusDate:'2026-09-08'},
    {primaryRunStatus:'queued'},{primaryRunStatus:'in_progress'}]) {
    const f=fixture();Object.assign(f.state,change);assert.equal(gate(f,now).run,false,JSON.stringify(change));
  }
  const claim=fixture();Object.assign(claim.state,{branchClaimed:true,claimHasWork:false,claimAgeMinutes:91,claimDeclarations:[]});
  assert.equal(gate(claim,now).takeover,true);
  claim.state.claimHasWork=true;assert.equal(gate(claim,now).run,false);
  claim.state.claimHasWork=false;claim.state.primaryRunStatus='in_progress';
  assert.equal(gate(claim,now).run,false);
  const stopped=fixture();Object.assign(stopped.state,{emergencyStop:true,credentialsAvailable:false});
  assert.equal(gate(stopped,now).code,'emergency_stop');
  assert.throws(()=>gate(fixture(),now+300001),/Recollect/);
  assert.throws(()=>gate(fixture(),now-1),/Recollect/);
  for (const change of [{primaryRunStatus:null},{mainStatusDate:null},{budgetOver:null},{force:true},{route:'new-route'}]) {
    const f=fixture();Object.assign(f.state,change);assert.throws(()=>gate(f,now));
  }
  const retry=fixture();retry.state.route='ccr-0920';assert.equal(gate(retry,now).run,true);
  retry.state.primaryRunStatus='in_progress';assert.equal(gate(retry,now).run,false);
  // Retired observation: an otherwise admitted run (primary, retry or takeover) is refused.
  for (const f of [fixture(),Object.assign(fixture(),{state:{...fixture().state,route:'ccr-0920'}})]) {
    const d=gate(f,now,retiredLedger);
    assert.equal(d.run,false,'A retired observation must not admit a scheduled run');
    assert.equal(d.code,OBSERVATION_RETIRED);
  }
  const takeover=fixture();Object.assign(takeover.state,{branchClaimed:true,claimHasWork:false,claimAgeMinutes:91,claimDeclarations:[]});
  assert.equal(gate(takeover,now,retiredLedger).run,false);
  // Malformed markers still refuse (presence, not validity, decides admission).
  assert.equal(gate(fixture(),now,{...observedLedger,[RETIREMENT_KEY]:null}).run,false);
  // Emergency stop keeps precedence and its own code.
  const halted=fixture();halted.state.emergencyStop=true;
  assert.equal(gate(halted,now,retiredLedger).code,'emergency_stop');
  // An unknown observation state fails closed.
  for (const ledger of [undefined,null,[],'{}']) assert.throws(()=>codexPreflight(fixture(),now,ledger),/observation state is unknown/);
  // The real CLI reads the ledger next to it: retired refuses, observed admits, missing fails.
  const live=Date.now(), snapshot=fixture();
  const yesterday=new Date(live-86400000);
  Object.assign(snapshot,{observed_at:new Date(live).toISOString()});
  Object.assign(snapshot.state,{todayJst:todayJst(new Date(live)),prodStatusDate:todayJst(yesterday),mainStatusDate:todayJst(yesterday)});
  const cli=ledger=>{
    const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'codex-preflight-cli-')));
    try {
      for (const rel of ['scripts/codex-autopilot-preflight.mjs','scripts/autopilot-gate.mjs','scripts/lib/jst.mjs',
        'scripts/check-routine-runs.mjs','scripts/lib/selftest.mjs']) {
        fs.mkdirSync(path.dirname(path.join(dir,rel)),{recursive:true});fs.copyFileSync(path.join(ROOT,rel),path.join(dir,rel));
      }
      if (ledger) {fs.mkdirSync(path.join(dir,'data'));fs.writeFileSync(path.join(dir,'data/routine-runs.json'),JSON.stringify(ledger));}
      fs.writeFileSync(path.join(dir,'input.json'),JSON.stringify(snapshot));
      return spawnSync(process.execPath,[path.join(dir,'scripts/codex-autopilot-preflight.mjs'),'--input',path.join(dir,'input.json')],
        {cwd:dir,encoding:'utf8',timeout:30000});
    } finally { fs.rmSync(dir,{recursive:true,force:true}); }
  };
  const observedCli=cli(observedLedger);
  assert.equal(observedCli.status,0,observedCli.stderr);assert.equal(JSON.parse(observedCli.stdout).run,true,'control: the CLI admits an observed run');
  const retiredCli=cli(retiredLedger);
  assert.equal(retiredCli.status,0,retiredCli.stderr);
  assert.equal(JSON.parse(retiredCli.stdout).run,false);assert.equal(JSON.parse(retiredCli.stdout).code,OBSERVATION_RETIRED);
  assert.notEqual(cli(null).status,0,'A missing ledger must not admit a run');
  console.log('Codex preflight: primary and retry, stop/budget/auth, live owners, duplicate claims, unknown/stale inputs and retired observation verified');
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--selftest')) runCodexPreflightTests();
  else {
    const index=process.argv.indexOf('--input');
    assert.ok(index>=0 && process.argv[index+1], 'Use --input <fresh-snapshot.json> or --selftest');
    const snapshot=JSON.parse(fs.readFileSync(process.argv[index+1],'utf8'));
    // Unreadable ledger: throws, so the caller records preflight_error (no admission).
    const routineDoc=JSON.parse(fs.readFileSync(ROUTINE_LEDGER,'utf8'));
    console.log(JSON.stringify(codexPreflight(snapshot,Date.now(),routineDoc),null,2));
  }
}
