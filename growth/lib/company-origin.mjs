import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// A CLI origin label is not proof. Read the actual host-provided task identity
// and match its native automation execution record; do not infer a planned slot.
export function nativeOrigin({ env=process.env, call=execFileSync }={}) {
  const thread=env.CODEX_THREAD_ID;
  if (!/^[a-f0-9-]{36}$/.test(thread??'')) return {state:'unverified',reason:'no_host_task_identity'};
  try {
    const reader=fileURLToPath(new URL('../../scripts/codex-routine-observer.py',import.meta.url));
    const row=JSON.parse(call('python3',[reader,'--thread-state',thread],{encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}));
    if(!row?.automation_id)return {state:'not_a_recorded_automation_run',thread_id:thread};
    if(row.thread_id!==thread || row.state!=='in_progress' || !row.original_turn_id
      || row.latest_turn?.turn_id!==row.original_turn_id || row.latest_turn?.state!=='in_progress'
      || row.gate_receipt?.admitted!==true || row.gate_receipt.turn_id!==row.original_turn_id)
      return {state:'unverified',thread_id:thread,reason:'not_an_admitted_live_original_scheduled_turn'};
    return {state:'native_execution_record',thread_id:thread,automation_id:row.automation_id,
      original_turn_id:row.original_turn_id,observed_at:row.observed_at,gate_receipt_sha256:row.gate_receipt.sha256,
      planned_slot:'existing admitted first-turn preflight; not inferred from creation time'};
  } catch {return {state:'unverified',thread_id:thread,reason:'native_read_unavailable'};}
}
