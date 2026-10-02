# 未登録チャネル4件の追加運用審査 — 2026-10-02

原Task126と、既存権限表の「外部サービスの運用審査」による条件付き判断。公開資料と元のconsumerを確認した。契約締結・支払承認・新しい連携の有効化は行わない。

## 対象と確認限界

資格情報台帳の `postiz_api_key`、`bing_webmaster_oauth`、`devto_api_key`、`hatena_atompub_key` が参照する4件は、既存vendorの別名ではない。元のworkflowとconsumerは次のとおり。

| 依存先 | 元の経路 | 保持する範囲 |
| --- | --- | --- |
| Postiz（ホスト型） | `.github/workflows/auto-post-tiktok.yml` → `tools/auto-post.js` → `api.postiz.com` | 元のSNS停止条件を保持。再有効化しない |
| Microsoft（Bing Webmaster） | `.github/workflows/seo-daily.yml` → `growth/scripts/collect-bing.mjs` → `growth/lib/bing-webmaster.mjs` | 原OAuth同意・read権限・初回検証・有効化条件を保持 |
| DEV Community | `.github/workflows/devlog-syndication.yml` → `scripts/devlog-syndication.mjs` の `publishDevto` | 原postgate・周期・鍵の分離・投稿検証・STOPを保持 |
| Hatena Blog | 同workflow → 同scriptの `publishHatena` → AtomPub | 同じ原gateを保持。旧local予約のoffをActions経路のoffとみなさない |

当社の実アカウント、現接続、プラン、契約主体・受諾版、DPA/SLA適用は未確認。台帳のdeclared/noneは現在の資格情報や接続の検証結果ではない。秘密の値、アカウント、OAuth同意、投稿、削除を操作していない。

各社の判断は `continue_existing_scope_with_conditions`、適用は `not_fully_verified`、riskはred。これは既存権限内の条件付き運用審査であり、新規利用・鍵発行・投入・scope追加・契約・購入・投稿の追加許可ではない。データ分類personalはアカウント情報・接続先等を考慮した保守的な分類で、顧客メモや秘密を送信したという主張ではない。

## Postiz

[Privacy Policy](https://postiz.com/privacy-policy)と[Terms](https://postiz.com/terms-of-service)は2026-05-03更新表記。ホスト型APIの製品範囲に限る。self-hosted版へ同じ契約適用を推定しない。

- **DPA:** Policy §6は指示された投稿内容・個人データについてprocessorとし、標準DPAへの署名を依頼できる。当社の締結・適用は未確認。
- **データ利用:** 投稿素材、OAuth情報、利用ログ、接続先や委託先への共有を記載。任意AI機能の外部モデルへの入力と学習除外の指示は、当社の全処理の学習禁止保証ではない。
- **SLA:** Terms §14は継続稼働・無障害を保証しない。[Status](https://status.postiz.com/)は観測先で、当社のSLAの証明ではない。
- **撤退:** 接続解除、設定からの終了、portable copy・削除請求の手順は存在する。保持例外・backupがあり、投稿キューの完全移行・復元・削除は未検証。

条件: 元の停止条件を保持し、再有効化、新チャネル・AI機能・新しい個人情報や鍵の投入を行わない。既存の利用を拡張する前にDPA・現プラン・接続・consumerの範囲を照合する。撤退時は必要な元データと代替経路を検証し、接続解除・キュー・下流SNSの既投稿・保持例外を別に確認する。

## Microsoft — Bing Webmaster Tools

[API資料](https://learn.microsoft.com/en-us/bingwebmaster/)は[Microsoft Services Agreement](https://www.microsoft.com/en-us/servicesagreement)を参照。現版は2026-07-30公開／2026-09-30発効、対象サービスにBing Webmasterを含む。当社の受諾・適用の証明ではない。

- **DPA:** [一般DPAの適用説明](https://www.microsoft.com/licensing/docs/view/Microsoft-Products-and-Services-Data-Protection-Addendum-DPA?lang=1)は別の製品契約の枠組みであり、当社のWebmaster利用への適用根拠は未確認。AzureのDPAを流用しない。
- **データ利用:** [一般Privacy Statement](https://www.microsoft.com/en-us/privacy/privacystatement)は2026年9月更新で、サービス提供・改善・AIモデル開発学習等を含む。Webmaster統計への具体的な適用・学習除外は未確認。[OAuth資料](https://learn.microsoft.com/en-us/bingwebmaster/oauth2)はreadとmanageを分ける。
- **SLA:** MSA §6は障害・停止を想定する。[URL Submission](https://www.bing.com/webmasters/help/URL-Submission-62f2860b)の99.9%記載を読み取り統計APIへ転用しない。当社SLAは未確認。
- **撤退:** OAuthアクセス撤回と[Webmaster Help](https://www.bing.com/webmasters/help/refreshed-webmaster-tools-7c7d2533)のアカウント情報JSON出力・不可逆な削除手順はある。全統計移行・保持期限・完全削除は未検証。

条件: 原read権限、初回検証、`BING_API_ENABLED`条件を保持。新OAuth同意、manage、URL投稿、本番有効化へ拡張しない。接続未確認を成功や空データへ置き換えない。撤退は当該readerの停止、許可・鍵の失効、必要な統計の移行を区別し、不可逆な削除を別の指示なしに行わない。

## DEV Community — 記事API

[Privacy](https://dev.to/privacy)は2026-03-06表記、[API V1](https://developers.forem.com/api/v1)は1.0.0表記。[Terms](https://dev.to/terms)の改定日は今回確認できなかった。

- **DPA:** 当社の記事API利用へのDPAは特定できない。Forem運営者向けの処理契約をDEV利用者へ流用しない。
- **データ利用:** 公開記事・プロフィールは一般公開。Privacyは改善・マーケティング、委託先共有、米国等への移転と必要期間の保持を記載する。秘密・顧客情報の投入を認める根拠にしない。
- **SLA:** 記事APIの稼働率・復旧時間・補償は未確認。Termsは無保証で、[API案内](https://developers.forem.com/api)も資料の更新遅延の可能性を説明する。
- **撤退:** APIには自己記事一覧と著者による下書き化の機能がある。[アカウント削除](https://dev.to/help/delete-account)は別手順で、即時の完全消去・復元は未検証。

条件: 権利を持つ公開用記事のみを原gate・周期・STOPの範囲で扱う。Termsの宣伝・バックリンク獲得を主目的とする投稿の制限も照合する。原稿・記事ID・原公開URLを自社側で保持し、停止・下書き化・削除・下流コピーを別に確認する。鍵の発行・更新をAIが値を読む経路へ変更しない。

## Hatena Blog — AtomPub

[Privacy](https://policies.hatena.ne.jp/privacypolicy-ja)は2025-10-14改定、[利用規約](https://policies.hatena.ne.jp/rule)は2023-07-01改定表記。[AtomPub仕様](https://developer.hatena.ne.jp/ja/documents/blog/apis/atom/)の改定日は今回確認できなかった。

- **DPA:** 確認した公式資料からAtomPub向けDPAを特定できない。当社締結・適用は未確認。
- **データ利用:** Privacyは利用分析・改善・マーケティング等を記載。規約第8条はサービス・宣伝・API/RSS配信・学術研究支援等を目的とする投稿内容の非独占的利用許諾を含む。顧客情報や秘密の投入を許可しない。
- **SLA:** AtomPub専用の当社SLAは未確認。規約第9–10条は停止・変更・終了等の責任制限を含む。
- **撤退:** [MT export](https://help.hatenablog.com/entry/export)は記事・コメント等を退避し、画像は別保存が必要。AtomPubの記事削除機能はあるが、完全移行・復元・消去は未検証。

条件: 原postgate・周期・投稿検証・STOP、鍵を執筆モデルへ渡さない分離を保持。同じアカウント鍵を使う他consumerと公開済み内容を別に確認する。元原稿・IDと画像も含む退避・代替経路を確認後に必要な停止・失効・削除を判断する。旧local予約の停止を別のActions経路へ一般化しない。

## 既存審査・警告との関係

この4件の追加審査日は2026-10-02。旧14判断と1Password追加判断、根拠、2026-09-08の記録日時、期限2026-10-08 UTCを変更・延長しない。既存15件へ追加した把握済み依存は19件になるが、全ての実依存先の網羅や契約適用を証明しない。

4件は `discovered_dependencies` として追加し、購入先の `vendors` へ昇格させない。元 `check-vendors` のcredential突合は `vendors` のみを参照するため、postiz・microsoft・devto・hatenaの未登録警告を保持する。警告解消を目的に照合対象・閾値・資格情報・判定コードを変えない。

原203タスク、権限表、期限、実行者分類、H0・自律率・分母・完了数は変更しない。
