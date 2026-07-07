# Ahrefs被リンク × GSC 分析・実行レポート — 2026-07-07

データソース: Ahrefs Site Explorer(被リンク314グループ・最もリンクされているページ235・オーガニックポジション, 2026-07-07取得) + GSC検索パフォーマンス(28日: 6/9-7/4 ／ 7日: 6/28-7/4)。
前提: 7/1(PR #367)・7/2(PR #374/#376)のリタイトル11ページは**7/29-30評価まで凍結**(cowork-W報告書のプロトコル)。本分析はこの凍結を尊重し、凍結対象に触れない施策のみ即日実行した。

---

## 1. 結論サマリ

| # | 発見 | 対応 | 状態 |
|---|---|---|---|
| 1 | **ネガティブSEO攻撃が7/2監査後も継続中**(新規22ドメイン、初検出7/1〜7/6、約3-5個/日ペース) | disavow.txt 264→**286ドメイン** | ✅ 本PRで実施 → **オーナー: GSC再アップロード** |
| 2 | **AI発クエリの出現**(完全文の日本語疑問クエリ群がbest-memo-apps-2026に着地、pos5-7) | 7/29凍結明け用のFAQ追記草案を本書§4に用意 | 📋 7/29実行 |
| 3 | CTR機会クラスタ(line-keep 4,045imp/CTR0.9%等)は**全て測定中** | 触らない(実験汚染防止) | ⏸ 7/29-30評価 |
| 4 | /apple-watch-obsidian/ 公開4日で**pos 3.2**(imp4)と好発進 | 内部リンク2本追加(voice-input, hands-free) | ✅ 本PRで実施 |
| 5 | **paji.me経由の正規旧リンクがまだ2〜3ホップ301**(Ahrefsで全チェーン実測) | CF-1(1ホップ化)は7/2依頼書のまま未実施 | ⏳ オーナー(5分) |
| 6 | /cdn-cgi/l/email-protection への内部リンク22本(Ahrefs計測) | CF Email Obfuscation由来の幻リンク | ⏳ オーナー: Scrape Shield OFF(1分) |

---

## 2. 被リンクプロフィール分析

### 2-1. 攻撃の現況(継続中)

7/2の全数監査(296参照ドメイン中264スパム)以降も注入が続いている。今回のライブインデックスで**disavow未収載22ドメイン**を検出(全て既知フリートと同型):

- **SEOExpress偽レビュー .storeフリート**(同一定型文「Before discovering SEOExpress.org, simplememofast.com struggled with low domain authority...」): `bold-outrank-hq-serp-workshop.store` `dynamic-systems-for-serp-boost-and-contextual-link.store` 等 — 初検出7/5-7/6のものは取得時点で「11時間前」「20時間前」表示 = **現在進行形**
- **.shopリンク販売群**(paji.me/simplememofast.com両方をアンカーに使用): `rankcart.shop` `seostash.shop` `linkfinds.shop` 等
- 特筆: ほぼ全て**nofollow**であり直接的な順位毀損力は限定的。実害よりも「関連付け」を狙った営業スパム/嫌がらせの色が濃い。ただし規模が異常(累計286ドメイン)なので、確立済みポリシーどおり全量disavowを維持する。

**404捏造URL攻撃**(energy-budget-field-notes等4件)は既にトリアージ確定済み(404維持、gsc-index-triage-2026-07-02.md)。今回のダンプに新しい捏造URLパターンは見当たらない。

### 2-2. 正規リンク資産(守るべきもの)

| リンク元 | DR | rel | 着地 | 備考 |
|---|---|---|---|---|
| papapapa.hatenablog.com | 90 | **dofollow** | /captio-alternative/ | アンカー「Captio代替アプリ（比較・移行ガイド）」— サイト最強の被リンク |
| AppBank | 71 | **dofollow** | /obsidian/ | v3.0記事。Ahrefs「ベストリンク」判定 |
| note.com / hatena.b / Qiita / Zenn / PR TIMES | 84-93 | nofollow | / ほか | ブランド面の信頼シグナル |
| docswell | 73 | nofollow | /en/blog/ios26-speechanalyzer-live-mic | 技術記事の一次資産化が機能 |
| kakiokosi.com | 27 | sponsored | /captio-alternative/ | 開示済みスポンサード(適正) |
| minory.org / paraworld.jp | 19-21 | dofollow | /obsidian/ | PRリリース二次波及 |
| molayo1419.me (KO) / readerfi | - | - | /voice-input/ | 海外からの自然参照が発生し始めている |

### 2-3. paji.me レガシーリンクの毀損(実測)

hatena著名人ページ(DR85)・susi-paku(DR35)・ossam.jp等の**正規の旧被リンクが全て `http://www.paji.me/ →301→ https://www.paji.me/ →301→ /captio/` の2〜3ホップ**でAhrefsに記録されている。7/2のCloudflare依頼書CF-1(1ホップ化+深いパス525救済)は**未実施**。手順は docs/seo/cloudflare-phase0-1-report-2026-07-02.md §CF-1(オーナーの個人CFアカウントで5分)。

---

## 3. GSC分析

### 3-1. 凍結中クラスタ(触らない) — 7/29-30に評価

観測されたCTR/表示回数は**リタイトル前〜移行期の値**であり、現時点で判断材料にならない:

| ページ | 28d imp | CTR | pos | リタイトル日 |
|---|---|---|---|---|
| /blog/line-keep-alternative | 4,045 | 0.9% | 7.2 | 7/1 (#367) |
| /blog/best-memo-apps-2026 | 2,035 | 2.2% | 6.7 | 7/1 (#367) |
| /glossary/aes-gcm/ | 703 | 1.1% | 13.1 | 7/1 (#367) |
| /obsidian/ | 682 | 7.3% | 7.9 | 7/2 (#376) |
| /vs/capacities/ | 485 | 1.4% | 8.4 | 7/1 (#367) |
| /vs/notion-vs-evernote/ | 433 | 3.7% | 11.6 | 7/2 (#376) |

「line keepメモ 終了」単体で7日91imp(pos9.0)あり、クラスタ全体では月間1万imp級。7/29評価が今月最大のCTRレバー。

### 3-2. 新シグナル: AI発クエリ(AIO)

7日間クエリに**完全文の日本語疑問クエリ**が複数出現(AI検索エージェントがGoogleに発行する典型形。0クリックはAIが読むだけなので正常):

| クエリ | imp | pos |
|---|---|---|
| 2026年にお金を払う価値のあるデジタルノートアプリはどれですか？ | 15 | 6.6 |
| 2026年に社会人に最も評価されているノートアプリは何ですか？ | 15 | 7.1 |
| 2026年にチームでノートを共同作業するのに最適なアプリは何ですか？ | 13 | 5.1 |
| 2026年に手書きメモを最も正確にテキストに変換するアプリはどれですか？ | 12 | 6.2 |
| デジタルノートと手書きメモを比べるとどちらが優れていますか？ | 2 | 5.0 |
| ビジネスユーザーにとって最適なメモソフトを教えてください。 | 1 | **1.0** |

着地はほぼ /blog/best-memo-apps-2026。**AI検索の情報源として既にpos1〜7で読まれている**ことの直接証拠で、AIOのpersona answer-block戦略が機能している。ページは凍結中のため、**7/29明けに以下のFAQ 4問を追記**する(FAQPage JSON-LDパリティ必須。回答は記事の既存評価と矛盾しない誠実回答):

- **Q. 2026年に「お金を払う価値がある」ノートアプリは？** → 用途で分かれる: 知識管理はObsidian(Sync課金)/Notion、即時キャプチャ特化はSimple Memo Premium(送信無制限)。無料で足りる人が多い点も明記。
- **Q. 社会人に最も評価されているのは？** → チーム文書はNotion/OneNote、個人の高速メモはSimple Memo/Apple Notes、と役割分担で回答。
- **Q. チーム共同作業に最適なのは？** → Notion/Google Docs系。**Simple Memoは個人キャプチャ用で共同編集非対応**と正直に(誤引用防止)。
- **Q. 手書き→テキスト変換が最も正確なのは？** → GoodNotes/Apple Notes(スクリブル)。Simple Memoは手書きでなく音声入力担当、と正直に。

### 3-3. Apple Watch × Obsidian クラスタ(好発進)

- /apple-watch-obsidian/: 公開4日でpos **3.2**(imp4)、/en/…: pos4.5(imp2)
- 関連クエリ: 「apple watch メモ 音声入力」14imp pos6.7、「apple watch obsidian」2imp pos4.5、「obsidian apple watch」4imp pos6.0、「アップルウォッチ メモ 音声入力」5imp pos5.0
- Ahrefs内部リンク: JA 2本・EN 3本と最弱層 → **本PRで /voice-input/ と /hands-free/ から追加**(どちらもテーマ隣接・凍結対象外)。Yahoo!ニュースPR配信後の初動を受ける土台を強化。

### 3-4. その他の観測(バックログ)

- **暗号化クラスタ**: 「暗号化 比較」48imp pos26 ／ encryption-comparison 474imp pos12.9 ／ security-comparison 195imp pos13.6 ／ e2e-encryption 27imp pos17.3。page2上位に固まっており、aes-gcm(凍結中)評価と合わせて7/29後にハブ化(相互リンク+比較表統合)を検討。
- **/blog/meeting-memo-template**: 450imp pos29.7 — page3。テンプレDL等のコンテンツ拡充が必要な水準(タイトルでは動かない)。
- **ブランドクエリ「シンプルメモ」pos3.8**(32imp) — 一般名詞ゆえ他アプリと競合。エンティティ統一(#374)済み、長期観測。
- **EN**: iphone-shortcuts-email-guide 1,220imp/CTR1.1%、google-keep-vs-apple-notes 633imp、send-email-to-yourself 589imp — 表示回数は着実に成長。方針(長期戦・抑制)どおり大規模施策はしない。W報告書の次スプリント候補 **/en/voice-input/ 新設**が最有力(AI測定Q05)。
- **「メモアプリ オープンソース」25imp pos31.5** — 7/2公開のOSS記事はまだ順位形成中。触らず観測。
- 「apptio alternatives」27imp pos56.7 は別製品(Apptio=IBM製FinOps)との混同ノイズ。対応不要。

---

## 4. 実行済み(本PR)

1. **docs/disavow.txt**: 264→**286ドメイン**(SECTION 6追加、+22)。ヘッダ・合計・履歴コメント更新。
2. **内部リンク**: /voice-input/ と /hands-free/ の関連ページブロックに /apple-watch-obsidian/ を追加(dual-DOM書式準拠)。
3. 本レポート。

## 5. オーナーアクション(優先順)

1. **disavow再アップロード**: GSC > リンクの否認ツールへ docs/disavow.txt 全文を再アップロード(ツールは**置換**方式。264版をアップ済みでも286版で上書きが必要)。
2. **paji.me 1ホップ301化**(再掲・今回Ahrefsで毀損を実測): 手順 docs/seo/cloudflare-phase0-1-report-2026-07-02.md §CF-1。
3. **GSC URL検査**: /apple-watch-obsidian/ と /en/apple-watch-obsidian/ のインデックス登録リクエスト(未実施なら)。
4. **Cloudflare Scrape Shield > Email Address Obfuscation を OFF**: /cdn-cgi/l/email-protection への幻リンク22本の発生源。サイトはsupport@を意図的に公開しており難読化は不要。
5. Bing Webmaster Tools登録(GSCインポート、未実施のまま)。

## 6. 7/29-30 評価日のTODO(予約)

1. #367の9ページ + #376の2ページのCTR/順位をリタイトル前後で比較(プロトコルはcowork-W報告書)。
2. W2保留3ページ(line-keep-alternative / capacities / aes-gcm)の再リタイトル判断。
3. **best-memo-apps-2026へAI-FAQ 4問追記**(§3-2の草案、JSON-LDパリティ・inject_faq_schema.py整合)。
4. 暗号化クラスタのハブ化設計。
5. disavow効果と攻撃ペースの再確認(Ahrefs新規参照ドメイン)。
