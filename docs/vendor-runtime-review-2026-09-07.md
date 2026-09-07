# ベンダー審査の追加確認

2026-09-07、Codexによる資料読解と実設定の読み取り。登録ベンダー全体のDPA・データ利用・SLA・撤退計画審査は継続中で、今回だけでは完了・追加加点としない。

## Anthropic

[DPA](https://www.anthropic.com/legal/data-processing-addendum)の2025-02-24発効版、A〜Iと別紙1〜4の表示本文を読了。Cは再委託の事前通知と15日以内の異議、Gは事故認知後48時間以内の通知、Hは終了後30日以内の返却要求と削除を定める。ただし法令・紛争・有害利用への対応のための保持例外がある。監査は条件・費用を伴い、セキュリティ措置の記載は実測ではない。別途参照するSCC・UKの標準本文と非公開監査報告は今回未読。

別紙4の参照先から[Trust Centerの再委託先](https://trust.anthropic.com/subprocessors)を開き、1〜10件、11〜20件の両ページを確認した。地域・用途・対象製品が異なるため、一覧全体をSimpleMemoの実通信経路とみなさない。Commercial側のDPAをConsumer/Pro/Maxへ自動適用しない。

[公式サポート案内](https://support.claude.com/en/articles/9015913-how-to-get-support)の有料プラン・Console向け案内と返信方法を確認。サポートは非同期で、応答時間はプランと重要度により異なると説明される。この案内は稼働率・復旧時間・補償率の数値保証ではない。今回の公式検索では対象アカウントに適用する数値SLAを確定できず、SLAが一切存在しないという断定もしない。

Webコミット `1ed9f4d3ec6b8590c2d6ccea3a8fcc802eb50ff7` の旧Claudeワークフローは `workflow_dispatch` のみ。`docs/codex-autopilot-execution.md` の移管記録と、実際のローカル予約 `obsidian`・`obsidian-2` の設定ファイルを照合し、両方のACTIVEとCodexモデルを確認した。予約保存の確認であり、自然起動・無人出荷・全QA経路の移管の確認ではない。資格情報や予約設定は変更していない。

したがって「別事業者への代替経路が無い」という従来の記述は、保存済み予約の状態と一致しない。一方、代替が無人運転で機能したという証拠もまだ無い。台帳はこの2点を分け、過去の同意・人の判定を保持する。

## Cloudflare

[Workers SLA](https://www.cloudflare.com/workers-service-level-agreement/)と組込み先の[Enterprise SLA](https://www.cloudflare.com/enterprise-support-sla/)の2026-04-01版を読了。後者の画像2点もブラウザで確認した。Workers固有の条件を一般クレジット計算で置き換えず、runtimeの稼働率をD1/KV/Pagesへ広げない。請求の初動通知は5営業日以内、申請は翌請求月末まで。実アカウントへの適用は未確定で、請求は行っていない。

[再委託一覧](https://www.cloudflare.com/gdpr/subprocessors/cloudflare-services/)の表示更新日は2025-10-01。Developer Platform、サポート、Workers AI、AI Gatewayの対象を区別して確認した。一覧への掲載は実際のデータ送信先の実測ではない。

Observe権限で既存D1のメタデータを取得し、2026-09-07 11:55:37 UTCにHTTP 200・successを確認した。稼働リージョンはAPAC、jurisdictionはnull、read replicationはdisabled。顧客レコードは取得していない。[D1の所在地説明](https://developers.cloudflare.com/d1/configuration/data-location/)と照合すると、これを日本限定保存の証明にはできない。配置や複製設定は変更していない。

APIコミット `d712aed8f86155805704f28374e9e98cffbc4aa1` の復元スクリプトと `docs/RESTORE.md` を読解。ローカルのスキーマ生成・合成行の復元経路はあるが、本番取得、保管場所・期間、定期バックアップ、巻戻し時の二重送信判断が残る。KV移行・代替runtime・切替後の送信も未実証。Outboxや局所的な復元演習を、Cloudflareからの撤退成功と扱わない。

## 公開範囲

既存公開資料の根拠、粗いサービス状態、審査の限界だけを記録した。請求金額・契約番号・資格情報・顧客データは含めない。個別契約の同意や適用、移行の実行証拠が得られるまでは、従来の `dpa_reviewed` と契約承認を更新しない。
