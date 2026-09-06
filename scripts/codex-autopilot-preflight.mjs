#!/usr/bin/env node
// Pure preflight for the local Codex executor. Reads a fresh connector snapshot;
// never obtains credentials, changes a stop/budget, claims a branch or publishes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide, todayJst } from './autopilot-gate.mjs';

export function codexPreflight(snapshot, now = Date.now()) {
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
  // This records the executing Codex session's availability, not a fictional
  // CLAUDE_CODE_OAUTH_TOKEN. No key or token is accepted in this snapshot.
  return decide({...state,engine:'codex',secretsPresent:false,
    credentialRejected:!state.credentialsAvailable,force:false});
}

export function runCodexPreflightTests() {
  const now=Date.parse('2026-09-07T21:00:00Z');
  const fixture=()=>({schema_version:1,task_id:'00000000-0000-0000-0000-000000000001',
    observed_at:new Date(now).toISOString(),state:{route:'actions',todayJst:'2026-09-08',
      credentialsAvailable:true,emergencyStop:false,agentStopped:false,githubApiReachable:true,
      budgetOver:false,runCapOverrun:false,branchClaimed:false,claimHasWork:null,claimAgeMinutes:null,
      claimDeclarations:null,prTodayExists:false,prodStatusDate:'2026-09-07',mainStatusDate:'2026-09-07',
      primaryRunStatus:'completed',force:false}});
  assert.equal(codexPreflight(fixture(),now).run,true);
  for (const change of [{credentialsAvailable:false},{emergencyStop:true},{agentStopped:true},
    {budgetOver:true},{runCapOverrun:true},{githubApiReachable:false},{branchClaimed:true},
    {prTodayExists:true},{prodStatusDate:'2026-09-08'},{mainStatusDate:'2026-09-08'},
    {primaryRunStatus:'queued'},{primaryRunStatus:'in_progress'}]) {
    const f=fixture();Object.assign(f.state,change);assert.equal(codexPreflight(f,now).run,false,JSON.stringify(change));
  }
  const claim=fixture();Object.assign(claim.state,{branchClaimed:true,claimHasWork:false,claimAgeMinutes:91,claimDeclarations:[]});
  assert.equal(codexPreflight(claim,now).takeover,true);
  claim.state.claimHasWork=true;assert.equal(codexPreflight(claim,now).run,false);
  claim.state.claimHasWork=false;claim.state.primaryRunStatus='in_progress';
  assert.equal(codexPreflight(claim,now).run,false);
  const stopped=fixture();Object.assign(stopped.state,{emergencyStop:true,credentialsAvailable:false});
  assert.equal(codexPreflight(stopped,now).code,'emergency_stop');
  assert.throws(()=>codexPreflight(fixture(),now+300001),/Recollect/);
  assert.throws(()=>codexPreflight(fixture(),now-1),/Recollect/);
  for (const change of [{primaryRunStatus:null},{mainStatusDate:null},{budgetOver:null},{force:true},{route:'new-route'}]) {
    const f=fixture();Object.assign(f.state,change);assert.throws(()=>codexPreflight(f,now));
  }
  const retry=fixture();retry.state.route='ccr-0920';assert.equal(codexPreflight(retry,now).run,true);
  retry.state.primaryRunStatus='in_progress';assert.equal(codexPreflight(retry,now).run,false);
  console.log('Codex preflight: primary and retry, stop/budget/auth, live owners, duplicate claims and unknown/stale inputs verified');
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--selftest')) runCodexPreflightTests();
  else {
    const index=process.argv.indexOf('--input');
    assert.ok(index>=0 && process.argv[index+1], 'Use --input <fresh-snapshot.json> or --selftest');
    console.log(JSON.stringify(codexPreflight(JSON.parse(fs.readFileSync(process.argv[index+1],'utf8'))),null,2));
  }
}
