#!/usr/bin/env node
// A draft can be saved while the goal is incomplete. Dispatch requires fresh,
// unrounded evidence, the same task inventory, and the actual PR TIMES preview.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { summarize, validate as validateCoverage } from './automation-rate.mjs';
import { score } from '../growth/scripts/d-score.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = 'data/press-release-next.json';
// Owner revised the pre-dispatch goal on 2026-09-09; compare unrounded ratios.
export const OWNER_TARGET_AI_EXECUTION_RATE = 0.99497;
export const digest = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const normalizedText = value => String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
export function fingerprints(coverage) {
  const rows = coverage.tasks.map(({ area, task, executor }) => ({ area, task, executor }))
    .sort((a, b) => `${a.area}::${a.task}`.localeCompare(`${b.area}::${b.task}`, 'en'));
  return {
    inventory: digest(rows.map(({ area, task, executor }) => ({ area, task, excluded: executor === 'intentional_no' }))),
    execution: digest(rows),
  };
}
export function capture(coverage, sourceCommit, now = new Date().toISOString()) {
  return { observed_at: now, source_commit: sourceCommit, ...fingerprints(coverage), ...summarize(coverage).overall };
}
export function captureCommitted(coverage, sourceCommit, committedCoverage, now) {
  if (digest(coverage) !== digest(committedCoverage)) throw new Error('Commit the coverage ledger before capturing its source SHA');
  return capture(coverage, sourceCommit, now);
}
const pct = n => (n * 100).toFixed(1);
export function render(manifest) {
  const s = manifest.snapshot;
  const title = `Obsidian連携シンプルメモ、アプリ運営のAI実行率${pct(s.ai_execution_rate)}%を公開`;
  const subtitle = `実施中${s.doing}業務のうち${s.ai_executes}業務をAIが実行。未着手を含む総合自動化率は${pct(s.overall_automation_rate)}%。実装・検証・本番反映の証拠と残る業務を公開`;
  const body = `株式会社ユリカ（東京都渋谷区）は、iPhone／Apple Watch向けアプリ「シンプルメモ」の運営業務について、AIが担当する業務と実行証拠を公開しています。本稿の集計は${s.observed_at.slice(0, 10)}時点の業務台帳に基づきます。

シンプルメモは、思いついたことを話すか書いて、自分のメールやObsidianへ残すためのアプリです。その運営では、データの確認、改善案の選定、実装、自動検査、本番反映、結果の記録をAIが担う範囲を広げています。

■ 何件を、誰が実行しているか

棚卸しした203業務のうち、意図的に実施しない4業務を除く${s.defined}業務を対象にしています。内訳は、AIが実行${s.ai_executes}件、AIが提案・下書きまで${s.counts.ai_proposes}件、人が担当${s.counts.human_only}件、未着手${s.counts.nobody}件です。

AI実行率：${pct(s.ai_execution_rate)}%（${s.ai_executes}/${s.doing}、実施中の業務が分母）
総合自動化率：${pct(s.overall_automation_rate)}%（${s.ai_executes}/${s.defined}、未着手も分母に含む）
AI関与率：${pct(s.ai_involvement_rate)}%（提案・下書きまでの業務も含む）
カバー率：${pct(s.coverage_rate)}%（${s.doing}/${s.defined}、誰かが実施している業務の割合）

これらは業務の種類を同じ重みで数えた割合です。実行回数に対する成功率、稼働率、労働時間の削減率ではありません。業務ごとの大きさに差がある点も集計の限界です。

■ 実装だけでなく、実行結果を確認する

コードや手順が存在するだけでは、業務を実行した証拠にはなりません。AIが担う業務には実行経路の証拠を付け、実際の検査、提出、公開、処理結果を確認します。審査待ちや観測数の不足、未実施の作業も記録します。

実行の記録と最新の数値：
https://simplememofast.com/autopilot/
業務別の台帳：
https://simplememofast.com/data/automation-coverage.json

■ 人が担う役割と、残る仕事も示す

全体の方針や委任の範囲はオーナーが決めます。包括的な委任があっても、現地での作業、利用者本人の同意、法的責任、第三者の審査を完了したことにはなりません。未完了の業務を分母から取り除かず、同じ定義で改善を追跡します。

■ シンプルメモについて

思いついた瞬間のメモを、iPhoneやApple Watchから残すアプリです。Obsidianを利用する方にも、自分のメールへメモを届けたい方にも利用いただけます。

App Store：
https://apps.apple.com/jp/app/id6758438948?pt=128498560&ct=prtimes_202609_autonomy_followup&mt=8
公式サイト：
https://simplememofast.com/

株式会社ユリカ シンプルメモ 広報担当
support@simplememofast.com

アプリ画面を参照したAI生成イメージ。
`;
  return { title, subtitle, body };
}
export function markdown(parts) { return `# ${parts.title}\n\n<!-- fact-check: draft -->\n\n${parts.subtitle}\n\n${parts.body}`; }

export function validate(manifest, draft) {
  const errors = [];
  const s = manifest?.snapshot;
  if (manifest?.schema_version !== 1 || manifest.id !== '202609-autonomy-followup') errors.push('Unknown campaign');
  if (manifest?.target_ai_execution_rate !== OWNER_TARGET_AI_EXECUTION_RATE) errors.push('The owner target is 99.497%; do not change it without a new owner instruction');
  if (manifest?.window?.starts_at !== '2026-09-14T00:00:00+09:00' || manifest?.window?.ends_at !== '2026-09-21T00:00:00+09:00') errors.push('Publication window must remain September 14–20 JST');
  if (!s || !Number.isFinite(Date.parse(s.observed_at)) || !/^[a-f0-9]{40}$/.test(s.source_commit ?? '')) errors.push('Missing source snapshot');
  if (!s) return errors;
  const c = s.counts ?? {};
  if (!['ai_autonomous','ai_executes_gated','ai_proposes','human_only','nobody','intentional_no'].every(k => Number.isInteger(c[k]) && c[k] >= 0)) errors.push('Invalid task counts');
  const execution = c.ai_autonomous + c.ai_executes_gated;
  const doing = execution + c.ai_proposes + c.human_only;
  const defined = doing + c.nobody;
  if (defined !== 199 || c.intentional_no !== 4 || s.defined !== defined || s.doing !== doing || s.ai_executes !== execution) errors.push('Task inventory/count mismatch');
  for (const [key, value] of Object.entries({ ai_execution_rate: execution / doing, overall_automation_rate: execution / defined, ai_involvement_rate: (execution + c.ai_proposes) / doing, coverage_rate: doing / defined })) {
    if (!Number.isFinite(s[key]) || s[key] !== value) errors.push(`Incorrect ${key}`);
  }
  if (s.inventory !== manifest.baseline_inventory) errors.push('Task scope or exclusions changed');
  if (!/^[a-f0-9]{64}$/.test(s.execution ?? '') || !/^[a-f0-9]{64}$/.test(s.inventory ?? '')) errors.push('Invalid fingerprint');
  if (!['drafting','ready','scheduled','published'].includes(manifest.status)) errors.push('Invalid publication status');
  const budget = manifest.dispatch_budget;
  if (budget != null && (budget.campaign_id !== manifest.id || budget.company_id !== '182412'
    || budget.release_id !== '10' || budget.release_id !== manifest.remote_draft_id
    || budget.currency !== 'JPY' || budget.charge_basis !== 'per_release_excluding_tax'
    || budget.max_basic_charge_excl_tax_jpy !== 30000 || budget.max_optional_charge_excl_tax_jpy !== 0
    || budget.max_releases !== 1 || budget.authority !== '2026-09-08-owner-delegation'
    || manifest.owner_delegation?.date !== '2026-09-08' || !manifest.owner_delegation?.evidence)) {
    errors.push('Dispatch budget must stay within the delegated single release and existing basic price');
  }
  if (draft !== markdown(render(manifest)) || digest(draft) !== manifest.draft.sha256) errors.push('Draft differs from its measured snapshot');
  if (manifest.status === 'published' && !/^https:\/\/prtimes\.jp\/main\/html\/rd\/p\/\d{9}\.000182412\.html$/.test(manifest.receipt?.public_url ?? '')) errors.push('Published needs an actual public URL');
  return errors;
}

// ui is read from the actual PR TIMES preview immediately before scheduling.
// A local/CI pass never claims the external publication was performed.
export function evaluateDispatch(manifest, coverage, draft, ui, now = new Date().toISOString()) {
  const reasons = validate(manifest, draft);
  const t = Date.parse(now);
  const s = manifest.snapshot;
  const fresh = (at, age) => Number.isFinite(Date.parse(at)) && Date.parse(at) <= t && t - Date.parse(at) <= age;
  if (!manifest.enabled) reasons.push('Publication disabled');
  if (['scheduled','published'].includes(manifest.status) || manifest.receipt) reasons.push('Already scheduled/published: inspect receipt, do not resend');
  if (manifest.status !== 'ready') reasons.push('Draft is not ready');
  if (!Number.isFinite(t)) reasons.push('Invalid current time');
  if (!fresh(s?.observed_at, 24 * 3600 * 1000)) reasons.push('Snapshot must be at most 24 hours old');
  if (fingerprints(coverage).execution !== s?.execution) reasons.push('Current ledger has changed: regenerate draft');
  const live = summarize(coverage).overall;
  if (live.ai_execution_rate < manifest.target_ai_execution_rate) reasons.push(`AI execution target not reached: ${live.ai_executes}/${live.doing}`);
  const publication = Date.parse(manifest.scheduled_at);
  if (!Number.isFinite(publication) || publication < t || publication < Date.parse(manifest.window.starts_at) || publication >= Date.parse(manifest.window.ends_at)) reasons.push('Invalid/out-of-window publication time');
  if (!ui || !fresh(ui.observed_at, 5 * 60 * 1000)) reasons.push('Fresh PR TIMES preview required');
  if (ui?.company_id !== '182412' || !ui.release_id || String(ui.release_id) !== String(manifest.remote_draft_id) || ui.status !== 'draft') reasons.push('Wrong account, draft, or remote state');
  const rendered = render(manifest);
  for (const key of ['title','subtitle','body']) if (normalizedText(ui?.[key]) !== normalizedText(rendered[key])) reasons.push(`PR TIMES ${key} mismatch`);
  if (ui?.scheduled_at !== manifest.scheduled_at || !ui?.media_list_id || ui.media_list_id !== manifest.media_list_id) reasons.push('Verify time and media recipients');
  // A saved draft does not consume a release. Re-read the authenticated plan
  // immediately before dispatch; the account's aggregate invoice is not a quote
  // for this release. Never infer a free entitlement from an unchecked FAX box.
  const budget = manifest.dispatch_budget;
  const chargeVerified = budget == null ? ui?.incremental_charge_jpy === 0 : (
    fresh(ui?.pricing_observed_at, 5 * 60 * 1000)
    && ui?.pricing_company_id === budget.company_id
    && ui?.billing_plan === '従量課金プラン'
    && ui?.charge_scope === 'this_release'
    && ui?.currency === budget.currency
    && ui?.charge_basis === budget.charge_basis
    && Number.isInteger(ui?.basic_charge_excl_tax_jpy)
    && ui.basic_charge_excl_tax_jpy >= 0
    && ui.basic_charge_excl_tax_jpy <= budget.max_basic_charge_excl_tax_jpy
    && ui?.optional_charge_excl_tax_jpy === 0
    && ui?.incremental_charge_jpy == null
  );
  if (!chargeVerified || ui?.terms_changed !== false) reasons.push('Existing distribution entitlement/terms or delegated charge unverified');
  if (!manifest.quality_review) reasons.push('Editorial evidence and D-SCORE review are pending');
  else {
    const quality = manifest.quality_review;
    const result = score(quality.record ?? {});
    if (quality.draft_sha256 !== manifest.draft.sha256 || !quality.evidence?.length || result.problems.length || !result.verdict.startsWith('GO')) reasons.push('Editorial review does not clear the unchanged quality gates for this draft');
  }
  return { allowed: reasons.length === 0, reasons, metrics: live };
}

const main = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (main) {
  const args = process.argv.slice(2);
  const read = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const manifest = read(MANIFEST);
  const coverage = read('data/automation-coverage.json');
  if (args.includes('--refresh')) {
    if (manifest.receipt || ['scheduled','published'].includes(manifest.status)) throw new Error('Do not rewrite a scheduled or published release');
    const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const committedCoverage = JSON.parse(execFileSync('git', ['show', `${sourceCommit}:data/automation-coverage.json`], { cwd: ROOT, encoding: 'utf8' }));
    manifest.snapshot = captureCommitted(coverage, sourceCommit, committedCoverage);
    if (manifest.snapshot.inventory !== manifest.baseline_inventory) throw new Error('Task scope changed; audit the inventory before refreshing');
    manifest.status = 'drafting';
    manifest.quality_review = null;
    manifest.remote_saved_observation = null;
    const draft = markdown(render(manifest));
    manifest.draft.sha256 = digest(draft);
    fs.writeFileSync(path.join(ROOT, manifest.draft.path), draft);
    fs.writeFileSync(path.join(ROOT, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
  }
  const draft = fs.readFileSync(path.join(ROOT, manifest.draft.path), 'utf8');
  const errors = validate(manifest, draft);
  if (args.includes('--preflight')) {
    const i = args.indexOf('--ui');
    const ui = i >= 0 && args[i + 1] ? JSON.parse(fs.readFileSync(args[i + 1], 'utf8')) : null;
    const result = evaluateDispatch(manifest, coverage, draft, ui);
    const coverageErrors = validateCoverage(coverage);
    result.reasons.push(...coverageErrors);
    result.allowed = result.reasons.length === 0;
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.allowed ? 0 : 1;
  } else {
    console.log(errors.length ? errors.join('\n') : `Draft consistent: ${manifest.snapshot.ai_executes}/${manifest.snapshot.doing}. Dispatch is a separate check.`);
    process.exitCode = errors.length ? 1 : 0;
  }
}
