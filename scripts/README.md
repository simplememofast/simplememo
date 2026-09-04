# scripts/ の棚卸し

100本超あるが、役割は4分類しかない。**どの分類でも、パス（ファイル名）は
自由に変えられない**——理由は最後の節。

## 1. ゲートで走る（seo-check.yml）

CI「SEO Validation」が実行する本体。`check-*.mjs` 全部、`autopilot-*.mjs`、
`autonomy-*.mjs`、`automation-rate` / `ai-unit-cost` / `code-authorship` /
`daily-brief` / `feature-score` / `health-intake` / `property-tests` /
`recover-ingest` / `release-gate-run` / `review-intake` / `roadmap` /
`vendor-*.mjs`、`seo-check.js` / `sync_constants.js` / `tag-cta-placements.js` /
`apply-cpp-ppid.js` / `indexnow-notify.js`、`generate_sitemap.py --check` /
`inject_locale_seed.py --check`（growth/scripts の12本も同枠）。
正確な一覧はワークフローから導出できる:

    grep -ohE '(node|python3) (growth/)?scripts/[A-Za-z0-9_./-]+' \
      .github/workflows/seo-check.yml | sort -u

**ローカルで同じものを回すのが `node scripts/preflight.mjs`**（seo-check.yml を
解析して wired な検査を全部実行する、ゲートのローカルミラー）。

## 2. 別ワークフローで走る

- seo-daily.yml … growth の ingest/analyze/weekly-report と `bq-preflight`、
  `recover-ingest`、`check-domain-expiry`、`check-store-facts`、`vendor-terms`、
  `should-snapshot --decide`（`--selftest` は seo-check.yml 側でも走る）
- obsidian-autopilot.yml … `autopilot-budget` / `autopilot-selfheal` / `check-model-routing`
- autopilot-act.yml … `autopilot-act` / `autopilot-budget` / `autopilot-runs`
- autopilot-act.yml（続き） … `autonomy-eligibility --write` / `autonomy-score --snapshot`
  … L1適格性ゲートの判定と、自律スコアの1点。**アクチュエータが台帳を更新した後に走る**
  （先に判定すると、その日に立った候補と閉じた候補を見ずに前日の姿を採点する）

## 3. import されるか、台帳経由で実行される

ワークフローに名前が出ないが生きている。例:

- `autopilot-gate.mjs` … ゲート判断の純関数核。5本の検査が import
- `pr-hero-layout.mjs` … check-pr-hero が import
- `i18n_config.py` … generate_sitemap.py / normalize_i18n_head.py が import
- `check-asc-landed.mjs` … data/operating-memory.json の script_ok 検証として
  autopilot-act が実行
- `lib/` … selftest.mjs（32本が import）、read-ledger.mjs（13本）、
  read-json.mjs、site-files.js、edge-middleware.mjs、blindspot-*（監査手法として
  data/check-blindspots.json / guard-shapes.json が言及）

## 4. 手動ツールと完了済み一回限り

- 手動: `preflight.mjs`、`dashboard.mjs`、`generate-og-*.js`、`generate-pr-hero.mjs`、
  `generate-qr-codes.mjs`、`normalize_i18n_head.py`（月次）、`build_font_delta.py`、
  `build_admin_drafts.py`、`build-videos.py`、`analyze-launch-recording.py`、
  `add-internal-links.js`、`inject_lang_switcher.py`、`extract_en_page.py` など
- 完了済みスイープ（効果は HTML に焼き付き済み・**消さない**）: `add-next-step.py` や
  `inject_app_schema.py` などは配信中の HTML 内マーカーコメントが名前を持つ。
  `add-hreflang.js` / `strip_dual_dom.py` / `inject_faq_schema.py` 等は docs/ が参照。
  参照ゼロを3リポジトリ横断 grep で確認できた5本は 2026-09 に削除済み

## なぜリネーム・移動ができないか

- **seo-check.yml のステップ行はデータ。**check-selftests.mjs と preflight.mjs が
  YAML を正規表現で読み、data/check-selftests.json と突き合わせる。
  ステップの集約・改名は wired 集合を変えて落ちる
- **data/*.json 台帳がパスと本文をピンする。**generators.json（--write 等の
  フラグがそのファイル内にあること）、guard-shapes.json（file+ガード式の逐語）、
  review-gate-pin.json / rollout-gate-pin.json（特定ファイルの指紋。隣のリポジトリが
  照合する）、operating-memory.json（script_ok が literal パスで実行）
- **スクリプト間 import が名前をピンする**（autopilot-gate 5本、automation-rate 4本 等）
- check-generators / check-guard-shapes の走査は **top-level の *.mjs のみ**。
  write-flag やピン済みガード式を lib/ へ動かすと台帳との照合が壊れる

迷ったら `node scripts/preflight.mjs` を回してから触ること。
