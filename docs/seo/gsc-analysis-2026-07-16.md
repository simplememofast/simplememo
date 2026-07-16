# GSC検索パフォーマンス × インデックス登録 分析・実行レポート — 2026-07-16

データソース: GSC検索パフォーマンス 7日(2026-07-08〜07-14, クエリ447/ページ172) + 3ヶ月(04-15〜07-14, クエリ910/ページ266)、ページインデックス登録4バケット(最終更新 2026-07-10、検証不合格 07-11)。
前提: 7/1(#367)・7/2(#374/#376)のリタイトル11ページは**7/29-30評価まで凍結継続中**(プロトコル: cowork-W報告書)。本レポートの施策はすべて凍結対象外のページのみで実施した。

---

## 1. 結論サマリ

| # | 発見 | 対応 | 状態 |
|---|---|---|---|
| 1 | #389新記事が好初速も**内部リンクが兄弟記事+blog indexのみ**(obsidian-iphone-memoはクロール済み未登録) | 凍結対象外9ファイルから文脈リンク11本を配線 | ✅ 本PR |
| 2 | **AI発クエリ新種**「セキュリティ機能とコラボレーション機能が高いレベルで両立しているメモソフトは？」8imp pos6.1 | encryption-comparison(凍結対象外)へFAQ 6問目を追加(可視JA/EN+JSON-LD 3点同期) | ✅ 本PR |
| 3 | **404バケットに新規捏造URL 2件**(offline-first-outbox-teardown, email-inbox-as-task-manager) — 攻撃継続の証跡 | git全履歴・全ソース不存在を検証。既存ポリシーどおり404維持 | ✅ 検証済み |
| 4 | /en/apple-watch/ が「検出-未登録」(未クロール) | sitemap-en掲載・被リンク6本・canonical/hreflang/robots正常を実査 — **リポジトリ側に欠陥なし** | ⏳ IndexNow+オーナーURL検査 |
| 5 | line-keepクラスタで「どこ」インテントが最大化(122imp/0クリック) | 凍結中のため触らず。7/29実行用FAQ草案を§5に用意 | 📋 7/29 |
| 6 | リダイレクト79件/クロール済み未登録86件の「検証失敗」 | 07-02トリアージ判定を再確認 — 大半が残像・仕様表示でエラーではない | ✅ 対応不要 |

---

## 2. インデックス登録バケット再トリアージ(07-02トリアージとの差分のみ)

### 2-1. 404(7件) — 新規捏造2件を確認
既知: 捏造4件(energy-budget等、gsc-index-triage-2026-07-02.md §5) + `/cdn-cgi/l/email-protection`(robots対応済み)。
**新規2件**を今回検証:

```
/blog/offline-first-outbox-teardown   (7/9クロール)
/blog/email-inbox-as-task-manager     (7/7クロール)
```

検証結果: 両スラッグとも `git log --all -S` でコミット0件・現行ソース0件・sitemap非掲載。既知の捏造パターン(HN風英語スラッグ+自社テーマ模倣: outbox/inbox-task管理は当サイトの実コンテンツ用語)と同型で、**バックリンク・インジェクション攻撃の継続**を示す。対応は確立済みポリシーどおり: **404維持・リダイレクト/410不要**。

### 2-2. 検出-未登録(1件): /en/apple-watch/
実査結果: sitemap-en.xml掲載済み・内部リンク6本(en/index, en/faq, en/apple-watch-obsidian, en/obsidian, en/blog/email-to-obsidian, JA側hreflang)・`robots: index,follow`・canonical/hreflang 3点正常。**修正すべき欠陥はない**。EN側のクロール優先度の問題であり、IndexNow送信(本PRマージ後)+オーナーのURL検査リクエストで押す。

### 2-3. リダイレクトあり(79件)・クロール済み未登録(86件)
07-02トリアージの判定が引き続き有効: `?lang=`/`.html`/`http`/`www`変種は設計どおりの301/308(検証失敗表示は「まだリダイレクトしている」というGoogleの仕様表示であり、リダイレクトが正しい以上「不合格」で正常)。`/en/vs/notion//` はスキーマ`//`URL(#369で修正済み)の残像で、canonicalが正しく未登録が正しい着地。
実ページの新規論点は `/blog/obsidian-iphone-memo`(7/11クロール=公開翌日、判定継続中)のみ → §4の内部リンク配線で後押し。

---

## 3. 検索パフォーマンス観測

### 3-1. 凍結クラスタの中間観測(7/29-30まで判断しない)
- **line-keep**: 「line keepメモ どこ」**122imp/0クリック/pos9.7**が単一クエリ最大に成長(07-07時点では「終了」91impが最大)。サブインテント: どこ122/終了93/保存期間8/引き継ぎ1/復活1/怖い1。→ §5のFAQ草案(7/29実行)
- **aes-gcm**: クラスタ主要クエリがpos6-11帯(28d平均13.1から改善傾向)。リタイトル効果の可能性があるが、正式評価は7/29
- **capacities**: 423imp/CTR0.9%/pos8.1 — 変化なし。7/29のW2再リタイトル判断へ
- **apple-watch音声クラスタ**: 合計~95imp/週(apple watch 音声入力26 + アップルウォッチ 音声入力24 + apple watch メモ 音声入力13 + 設定系9 + NL質問「apple watchでメモを音声入力するには？」7 ほか)。/apple-watch/はpos6.9/CTR2.8%だが凍結中 → §5

### 3-2. #389新記事の初速(公開6日)
| ページ | 7日実績 | 判定 |
|---|---|---|
| /blog/obsidian-voice-input | **12クリック/114imp/CTR10.5%/pos6.2** | サイト最高水準CTR。テーマ選定成功 |
| /blog/obsidian-iphone-memo | クロール済み・未登録(7/11) | 公開翌日クロールで判定中 → リンク配線 |
| /blog/fleeting-notes | 「fleeting notes」pos10.2で初クリック | 順位形成中 → リンク配線 |

関連クエリ順位: obsidian 音声入力 pos6.4(2クリック)、obsidian 録音 CTR100%、obsidian 音声入力 iphone pos3.3、obsidian 文字起こし pos7.0。音声×Obsidian軸の需要検証が成立。

### 3-3. AI発クエリ(AIO)
- **新規観測**: 「セキュリティ機能とコラボレーション機能が高いレベルで両立しているメモソフトはどれですか？」8imp/pos6.1 → **本PRで /blog/memo-app-encryption-comparison にFAQ 6問目を追加**(凍結対象外のため即日実行可)。回答は誠実回答原則(共同編集×E2EEの完全両立は事実上存在しない、当アプリは共同編集非対応と明記)
- pos1.0での引用観測: 「ビジネスユーザーに最も評価が高いメモソフトは？」「ユーザーのフィードバックが最も良いメモソフトは？」「最高のノートテイキングアプリは？」「最高の記録管理システムは？」 — answer-block戦略の引用が定着
- 07-07観測の4問(払う価値/社会人評価/チーム共同作業/手書き変換)は継続観測 → best-memo-apps-2026へのFAQ 4問追記は予定どおり7/29(§5)

### 3-4. その他の観測
- **「google keepサービス終了」28imp pos2.7** ほかGoogle Keep終了系( 終了8+サービス終了5+2024 2他): LINE Keep終了との混同、または誤情報系の検索とみられる。**Google Keepは終了していない**ため、この誤解に寄せたコンテンツは作らない(誠実性ポリシー)。どのページが着地しているかの確認のみ7/29に実施
- **ディープワーク** ~70imp(pos11-25)・**アイゼンハワーマトリクス** ~65imp(pos22-44): glossary両ページの本文拡充候補(page2-4はタイトルでは動かない)。バックログ
- **メール タスク管理** 32+16imp pos15前後: /blog/email-self-task-management(クロール済み未登録)の拡充候補。バックログ
- 「apptio alternatives」「kaptio vs softrip」は別製品ノイズ(対応不要、07-07判定どおり)

---

## 4. 実行済み(本PR)

1. **内部リンク配線 11本/9ファイル**(#389記事3本へ、全て凍結対象外ソース):
   - /voice-input/ → obsidian-voice-input(dual-DOM書式)
   - /hands-free/ → obsidian-voice-input(dual-DOM書式)
   - /apple-watch-obsidian/ → obsidian-voice-input + obsidian-iphone-memo
   - /en/apple-watch-obsidian/ → en版2本
   - /blog/email-to-obsidian(JA) → obsidian-iphone-memo + obsidian-voice-input(本文文脈リンク)
   - /vs/obsidian/ → obsidian-iphone-memo
   - /methods/zettelkasten/ → fleeting-notes(JA本文+EN本文)
   - /glossary/zettelkasten/ → fleeting-notes(JA+ENカード内)
   - /use-cases/ideas/ → fleeting-notes(dual-DOM書式)
2. **encryption-comparison FAQ 6問目**: 可視JA+可視EN+FAQPage JSON-LD(JA)の3点同期、dateModified 2026-07-16、sitemap-ja/index lastmod更新
3. 新規捏造404 2件の検証記録(§2-1)
4. 本レポート
5. (マージ後実行) **IndexNow送信**: /en/apple-watch/ + 新記事6URL(JA/EN) + 本PR編集ページ

## 5. 7/29-30 評価日TODOへの追補(ahrefs-gsc-analysis-2026-07-07.md §6 に追加)

6. **line-keep-alternative FAQ追記草案**(凍結明け実行、FAQPage JSON-LDパリティ必須、実装前にLINE公式ヘルプで事実再確認):
   - Q. LINEのKeepメモはどこにありますか？ → トーク一覧の検索窓で「Keepメモ」を検索。トークを削除した場合の再表示手順とピン留め推奨を添える(「どこ」122impへの直接回答)
   - Q. Keepメモの保存期間は？テキストや写真は消えますか？ → テキストは残るが写真・動画・ファイルは一定期間で閲覧不可になり得る(通常トークと同仕様)。長期保存は移行を推奨
   - Q. Keepメモのデータを引き継ぐ・バックアップするには？ → /blog/line-keep-migration へ誘導
   - Q. 終了したLINE Keepに保存していたデータは復活できますか？ → 2024/8/28のサービス終了後は復元不可(公式告知の範囲で事実ベース回答)
7. **/apple-watch/ FAQ追加判断**: 「apple watchでメモを音声入力するには？」(NL 7imp pos9.4)への可視FAQ+スキーマ(リタイトル評価と同時に実施判断)
8. §3-4 Google Keep終了系クエリの着地ページ確認(誤解を助長しない現状表現かのチェックのみ)

## 6. オーナーアクション

1. **GSC URL検査**(インデックス登録リクエスト): `/en/apple-watch/`、`/blog/obsidian-iphone-memo`、余裕があれば `/blog/fleeting-notes`
2. **GSCリンクレポート**で新規捏造2URL(§2-1)のリンク元ドメインを確認 → 次回Ahrefs監査時に docs/disavow.txt へ追記(GSCへの再アップロードは既定ポリシーどおりスキップ可)
3. インデックス登録バケットの「検証を開始」ボタンは**リダイレクト/404バケットでは押す必要なし**(仕様上の表示でエラーではない)。クロール済み未登録も放置で可
