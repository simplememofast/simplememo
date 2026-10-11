# Notion連携の提供前確認 — PRD

作成日: 2026-09-05
状態: 設計案
対象リポジトリ: `simplememo-api` / `simplememo-ios` / `simplememo`

2026-09-20再照合。実装・有効化・実OAuth・実保存・一般提供を分けて判定する。

## 0. 一行定義

既存Notion実装を再利用し、現行の保存仕様と実OAuthから実保存までを確認してから提供可否を判断する。

## 1. なぜこの機能か

API main `c6ed249` に `src/notion.ts`、iOS main `17dcad9` に `NotionManager.swift` と
`docs/notion-v1.md` がある。Notionの宛先カードは `notion_destination_row` が既定false。
設定画面の連携と宛先カードは別条件である。
9/20 05:18 JST（9/19 20:18 UTC）の通常の公開HTTPS GETでは、
[`/v1/notion/config`](https://api.simplememofast.com/v1/notion/config) がHTTP200・`available=true`、
[`/v1/config`](https://api.simplememofast.com/v1/config) がHTTP200・`flags.notion_destination_row=false`だった。
9/19のHTTP403による現在値不明は、この観測で解消した。API設定の利用可否と宛先カードの表示を分けて記録する。
これは設定応答の確認であり、現在のOAuth・実保存・実機受入れの成功ではない。秘密情報・フラグ・接続設定は変更していない。
9/4 13:21 UTCの既存記録では、公開OAuthの開始・同意・交換、Private Inbox作成、
1件の実保存、本文・タイトルの一致、同じCapture IDの再送で同じページになることを確認済み。
関連するAPI [#240](https://github.com/simplememofast/simplememo-api/pull/240)・
[#241](https://github.com/simplememofast/simplememo-api/pull/241)・
[#242](https://github.com/simplememofast/simplememo-api/pull/242) はmainへ統合済み。
これは過去のサーバー経路の証拠であり、現在の健康度や今回の配布版の実機合格ではない。
原記録は非公開で保管し、接続先・ページID・資格・本文は公開しない。

## 2. VISION §13 のチェック

1. **Capture Coverage / Zero-decision 率を上げるか**: 既存のNotion保存へ届くまでを確認する。接続設定だけで改善としない。
2. **整理するUIを増やしていないか**: 既存接続画面とSimpleMemo Inboxを使う。新しいDB選択画面は足さない。
3. **Destinationを所有しようとしていないか**: Notion側へ一方向で保存する。
4. **共通Capture Objectを通るか**: 既存MemoCapture・MemoDelivery・受付時のNotion接続を保持する。
5. **修正が学習資産になるか**: この提供確認で推論やサーバ学習は追加しない。
6. **AIを前面に出していないか**: 接続と保存結果として案内する。

**Routing Level**: 判定しない。既存保存先の明示設定を確認する。

## 3. 受入条件

- [ ] APIの現行 `docs/notion-release.md` と既存migration・設定状態を照合し、実施済みの処理を重複しない。
- [x] 9/4のサーバー検証でOAuth→Private Inbox→実保存→ページと本文の実読取・同一ID再送を確認済み。今回の再実行ではない。
- [ ] iPhone・Siri・Watch、再試行、重複防止、認可取消・回復を同じ版で検証する。
- [ ] 受付時の保存先を保持し、認証失敗で以前のメールへ勝手に転送しない。
- [ ] 本文、トークン、個人名を公開証拠や分析へ出さない。保存データの既存保護・削除を維持する。
- [x] APIの利用可否と宛先カードのフラグを別々に確認する。9/20 05:18 JSTの公開GETでそれぞれ`true`・`false`を確認。設定観測だけで実OAuth・保存・提供開始を合格にしない。
- [ ] 現行コードの料金条件を確認して告知する。無料のコピー保存とPremium条件のNotionのみ保存を混同しない。
- [ ] 実配布・提供開始・効果測定の証拠を別々に残す。

## 4. UX

既存接続画面でNotionのSimpleMemo Inboxへ接続する。
既定のメールに加えるコピー保存と、条件を満たして明示的に選ぶNotionのみ保存を区別する。
実装にない任意DB選択・無料のメール不要保存を案内しない。

## 5. 多言語

| 要素 | JA | EN |
|---|---|---|
| 説明の確認用 | メール送信に加えてNotionにも保存します | Save a copy to Notion in addition to email |
| 再接続の確認用 | Notionに再接続してください | Reconnect Notion |

製品文言の正本は各リポジトリの現行ローカライズ。未確認の保存を成功文言にしない。

## 6. 決めていないこと

過去の検証用ワークスペースを再利用する場合も、今回必要な端末検証の範囲・同意を確認する。決めるのは: そのアカウントの所有者。
過去に成功したOAuth作成・migration・秘密情報登録を、未実施として繰り返さない。
旧11/10〜12の計画は公開日・設定変更の実行根拠にしない。
本番状態が不明のまま秘密情報・フラグを変更しない。

## 7. 測り方

OAuth開始/完了、接続先、受付ID、実保存、再試行、失敗を同一版で照合する。
接続率・D7・課金率は適格コホートで評価し、未観測を0にしない。
