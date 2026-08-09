# Screenshot Pipeline Plan — 2026-08-09

指示書 §22〜§27 / §35 / §36 / §106〜§109。

**状態: Written（未実行）。** この環境に Xcode が無いため、
以下はすべて macOS 上で初めて実行・検証される。

---

## 保存規約（§23）

既存の `artifacts/qa/` 規約（`scripts/qa/lib.sh` の `RESULT_ROOT`）に揃える。

```
artifacts/
  qa/                              既存（xcresult・診断ログ）
  screenshots/
    ios/
      <article-slug>/
        01-compose-empty.png
        02-voice-recording.png
        03-obsidian-settings.png
        04-sent-result.png
        manifest.json
```

ファイル名だけで用途と順序が分かること。連番＋画面名。

**リポジトリにコミットするか**は要判断。画像は容量が大きく、
記事に使うものだけを `assets/img/screenshots/` へ手動昇格させる運用を推奨する
（`artifacts/` は .gitignore、記事採用分のみ最適化してコミット）。
Cloudflare Pages は追跡ファイルを全配信するため、
**未採用の撮影物をそのまま公開しない**。

---

## Manifest（§24）

```json
{
  "article": "obsidian-voice-input",
  "articleUrl": "/blog/obsidian-voice-input",
  "capturedAt": "2026-08-09",
  "environment": {
    "simpleMemoVersion": "5.7.3",
    "iosVersion": "26.x",
    "simulator": "iPhone 17 Pro",
    "verificationType": "simulator"
  },
  "screenshots": [
    {
      "file": "03-obsidian-settings.png",
      "screen": "settings.obsidian",
      "purpose": "Obsidian連携の設定画面",
      "assertedBy": "SettingsAndObsidianUITests.testObsidianSettingsVisible",
      "verification": "simulator",
      "verified": true,
      "alt": "SimpleMemoのObsidian連携設定画面。Vault名と保存先フォルダを指定できる"
    }
  ]
}
```

`assertedBy` を必須にする。**どのassertを通った状態の画像か**が
辿れないスクリーンショットは、撮っただけで検証にならない（§25）。

---

## 撮影前の検証（§25）

**撮影は検証の代わりにならない。** 必ず assert を先に通す。

```swift
XCTAssertTrue(app.otherElements[AX.settingsTable].waitForExistence(timeout: 5))
XCTAssertFalse(app.alerts.element.exists)      // 想定外ダイアログが出ていない
captureScreenshot(app, name: "03-obsidian-settings", slug: "obsidian-voice-input")
```

既存の `QAUITestBase` は `continueAfterFailure = false` なので、
assert が落ちればそこで止まり、**壊れた画面が撮られることはない**。

---

## 品質QA（§26）

自動で機械的に見られるもの:

| 項目 | 方法 |
|---|---|
| 端末サイズ統一 | 同一 destination で撮る（`detect_ios_destination()` を固定） |
| ステータスバー統一 | `xcrun simctl status_bar <udid> override --time 9:41 --batteryLevel 100 --cellularBars 4` |
| 画像が空でない | ファイルサイズ下限チェック |
| 想定枚数が揃った | manifest と実ファイルの突合 |

機械では見られないもの（人間 or 画像を見られるAIが必要）:

```
UI崩れ / 不自然なテスト文字列 / 記事本文と画面内容の一致 / 可読性
```

### Visual QA の制約（§27）

**この環境では画像を確認できない**（そもそも撮影できない）。
macOS上で撮影後、画像を読めるセッションでレビューする必要がある。

指示書 §27 は「画像を確認できない環境では、できないことを明示する」と
指定しており、本計画ではそれに従う。**撮っただけの画像を
「QA済み」と記録しない。** manifest の `verified` は
assert通過を意味し、視覚QAは別フィールドで持つ。

---

## Seed Data（§21）

`UITEST_PREFILL_TEXT` に渡す日本語（個人情報を含まない・自然な業務文）:

```
次回の企画会議で音声入力フローを改善する
帰宅後に新しい記事構成をObsidianへ整理する
ランニング中に思いついたアイデアを後で見返す
```

`test` `aaa` `サンプル` は使わない。記事の画面に出た瞬間に信頼が落ちる。

日本語を直接 `typeText` しないのは既存基盤の設計判断でもある
（IME flake回避のため `UITEST_PREFILL_TEXT` 経由＝下書き復元の実経路を使う）。
**この方針を踏襲する。**

---

## 記事への挿入（§106 / §107）

```md
### Step 2. Obsidian連携を設定する

![SimpleMemoのObsidian連携設定画面。Vault名と保存先フォルダを指定できる](/assets/img/screenshots/obsidian-voice-input/03-obsidian-settings.png)

<span class="figure-caption">iOS Simulator（iPhone 17 Pro / iOS 26）で確認した画面です。</span>
```

- alt はキーワード詰め込み禁止。**画面の内容を説明する**
- キャプションで検証条件を明示（§107）。「実機で確認」とは書かない（§28）

本サイトは静的HTMLなので、挿入は既存の Python 一括置換スクリプト群と
同じ流儀で行う（`scripts/` に前例多数）。

---

## 陳腐化検知（§108 / §109）

`data/content-graph.json`（`OBSIDIAN_INTERNAL_LINK_PLAN.md` 参照）に持たせる:

```json
{
  "/blog/obsidian-voice-input": {
    "testedSimpleMemoVersion": "5.7.3",
    "screenshotVersion": "2026-08-09",
    "verificationType": "simulator"
  }
}
```

検知ルール:

```
data/site-constants.json の appVersion  ≠  testedSimpleMemoVersion
  → screenshot_refresh_required
screenshotVersion が N日以上前
  → 要確認
```

**`appVersion` は既に単一情報源になっている**（2026-08-09 実装、
`sync_constants.js` がCIで12箇所のJSON-LD＋llms.txtへ伝播）。
そこと突き合わせるだけで、アプリ更新時に古いスクショを機械的に洗い出せる。

これは指示書 §109 の Verification Drift Detection そのもので、
**既存のSSOTに乗るので追加コストがほぼ無い**のが良い点。

---

## 失敗時のルール（§34）

自動生成画像で代替しない。以下を出して止める。

```md
## Automation Failure

Step:                screenshot capture (03-obsidian-settings)
Reason:              settings.table did not appear within 5s
Likely cause:        UITEST_FIXTURE=verified が効いておらず未認証状態で起動した
Recommended fix:     launchEnvironment を qa-diag.log で確認
Can continue automatically: NO
```

既存の `scripts/qa/ai_triage.sh`（PIIリダクト済みでAIに原因分類させる）と
`Documents/qa-diag.log` の回収機構がそのまま使える。

---

## 実画面とAI図解の使い分け（§35）

| 実画面が必須 | AI図解でよい |
|---|---|
| SimpleMemo の操作手順・UI説明・設定・送信結果・画面遷移 | ワークフロー概念図・アーキテクチャ・音声→SimpleMemo→Obsidian の流れ・PKM概念 |

**AI図解を実際のアプリ画面のように見せない。** 図解には
「概念図」と分かる視覚的な差（枠線・配色）を持たせる。

## Obsidian本体のスクリーンショット（§36）

自前Vault・テストデータ・個人情報なし・必要最小限。
Obsidian は Simulator に入らないため、**これは実機/デスクトップでの手動撮影**になる。
その場合 `verificationType: "manual"` として記録し、
Simulator撮影と混同しない。
