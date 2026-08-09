# iOS Simulator Automation Plan — 2026-08-09

指示書 §15〜§34 / §105。**この文書の要点は「作るものが指示書の想定より遥かに少ない」こと。**

---

## iOS Simulator Automation Audit（§16 の書式）

### 実行環境

```
OS   : Ubuntu 24.04 (Linux 6.18.5)
xcrun / xcodebuild / simctl / swift : すべて NOT AVAILABLE
```

**このセッションからは1コマンドも実行できない。** 設計とコード記述までが限界で、
boot / build / install / screenshot の検証は macOS 上でしか行えない。
`scripts/qa/lib.sh` 自身が冒頭で `require_macos` している。

### Project Structure

```
SimpleMemo.xcodeproj
  SimpleMemo              iOS本体（UIKit中心・SceneDelegate あり）
  SimpleMemoWatch Watch App
  SimpleMemoWidget / SimpleMemoWatchWidget
  SimpleMemoTests / SimpleMemoWatchTests
  SimpleMemoUITests / SimpleMemoWatchUITests
Bundle ID : com.yurika.simplememo
MARKETING_VERSION : 5.7.3（App Store公開版）
```

### Build / Run

**既存の QA スイートが完備している。** 指示書 §33 のスクリプト一覧は概ね実装済み:

| 指示書 §33 の候補 | 実態 |
|---|---|
| `boot-simulator.sh` | ✅ `scripts/qa/lib.sh` の `detect_ios_destination()`（simctl JSONから機種選定・複数runtime同名対策込み） |
| `build-app.sh` / `install-app.sh` | ✅ `run_test_plan()` が xcodebuild 経由で実施 |
| `run-ui-tests.sh` | ✅ `scripts/qa/run-ios-ui-tests.sh`（testplan切替可） |
| `reset-app.sh` | ✅ `UITEST_RESET_STATE=1` |
| `seed-demo-data.sh` | ✅ `UITEST_FIXTURE` / `UITEST_TODAY_SENT` / `UITEST_PREFILL_TEXT` |
| `capture-screenshot.sh` | ❌ **無い** |
| `run-article-verification.sh` | ❌ **無い** |

さらに指示書に無いものまである:

- `scripts/qa/summarize-xcresult.sh` / `.py` — xcresult の要約
- `scripts/qa/ai_triage.sh` — 失敗時のAI原因分類（PIIリダクト済み・鍵が無ければskip）
- `scripts/qa/check_project_integrity.py` — **Xcode不要でLinuxでも走る** pbxproj整合検査
- 失敗時にアプリ側診断ログ `Documents/qa-diag.log` を simctl 経由で回収する仕組み

### Existing UI Tests

```
SimpleMemoUITests/  9ファイル / 724行
  QAUITestBase.swift            共通基盤（AXID契約・launch環境の組み立て）
  ComposeSmokeUITests.swift
  DraftAndHistoryUITests.swift
  SettingsAndObsidianUITests.swift   ← Obsidian設定画面のテストが既にある
  OfflineOutboxUITests.swift
  SendFailureUITests.swift
  FreeLimitAndPremiumUITests.swift
  DoubleTapUITests.swift
  VerificationFlowUITests.swift
TestPlans/  5本（FastUnit / iOS-PR / Nightly / ReleaseSmoke / Watch）
```

### Accessibility Readiness

**十分**。アプリ側 21箇所に `accessibilityIdentifier`、
UIテスト側は `enum AX` として契約を複製（アプリ定数をimportできないため意図的）。

```
compose.memoEditor / compose.sendButton / compose.settingsButton
compose.historyButton / compose.offlineBanner / common.toast
history.searchField / history.table / verification.* / paywall.view
dailyLimit.sheet / settings.table
```

指示書 §19 の「表示文字列をセレクタにしない」は既に守られている。

**不足**: 音声入力まわりのAXID。記事で撮りたい画面（録音中・停止ボタン）に
対応する識別子が現行21件に見当たらない。撮影対象を確定してから追加する。

### Deep Link Readiness

✅ `simplememo://compose?voice=1` が URL scheme 登録済み。
`SceneDelegate.swift` と `SimpleMemoAppIntents.swift` の両方が処理し、
ウィジェット／ショートカットからの経路として実運用されている。

指示書 §18 の「毎回タップするより直接対象状態へ」は既に可能。

### Seed Data Readiness

✅ `QATestSupport.swift` の launch environment 契約:

```
UITEST_MODE=1                                    マスタースイッチ
UITEST_RESET_STATE=1                             端末内状態を全消去
UITEST_FIXTURE=verified|unverified               初期状態
UITEST_NETWORK=success|offline|timeout|server500|rateLimited
UITEST_SUBSCRIPTION=free|premium|expired         課金状態の固定
UITEST_TODAY_SENT=<n>                            本日の送信数
UITEST_LOCALE=ja|en|...                          表示言語
UITEST_OBSIDIAN_MODE=sandbox                     サンドボックスVault
UITEST_ONBOARDING=single_track
UITEST_PREFILL_TEXT                              日本語入力のIME flake回避
```

Release ビルドでは `#if DEBUG` によりコンパイル時に無効化。
指示書 §20 の「Screenshot Mode」が要求する機能は**ほぼ全て既にある**。

### Screenshot Automation Readiness

❌ **ここだけが空白。**

```
XCTAttachment の使用箇所 : 0
screenshot 関連コード     : 0
artifacts/screenshots/    : 存在しない
```

`artifacts/qa/` という出力規約（`RESULT_ROOT`）は既にあるので、
その下に生やすのが自然。

### Main Blockers

1. **macOS実行環境**（最大かつ唯一の本質的ブロッカー）。
   オーナーのMac、または GitHub Actions `macos-latest`。
   後者は課金が発生し、iOS側リポジトリには
   「macOSランナーの自動起動を全廃する（1日でActions予算$10を焼いた）」
   というコミット（`3ded735`）がある。**無制限に回す設計にしてはならない。**
2. 音声入力画面のAXID不足（撮影対象確定後に追加）
3. ステータスバー統一（§26）— `simctl status_bar override` で対応可能

### Recommended PoC

指示書 §105 は「boot→build→install→launch→1画面→assert→screenshot 1枚」を
最初の成功条件としているが、**最初の7ステップは既に動いている**。

したがって PoC は次の1点に絞る:

> **既存の `SettingsAndObsidianUITests` に、assert 済みの状態で
> スクリーンショットを1枚撮って `artifacts/` へ出す処理を足す。**

理由:
- Obsidian設定画面のテストが**既に存在し、既にassertが通っている**
- 記事 `/blog/obsidian-voice-input`（CTR 10.9%・サイト最強）で
  「Obsidian連携の設定画面」は実際に見せたい画面である
- 新しいテストを書かないので、失敗したら原因は撮影処理だけに絞れる

---

## 実装案（macOS前提・Written / 未実行）

### Step 1: 撮影ヘルパ

`SimpleMemoUITests/QAScreenshot.swift`（新規）

```swift
extension XCTestCase {
    /// assert 済みの状態でのみ呼ぶこと。撮影は検証の代わりにならない（指示書 §25）。
    func captureScreenshot(_ app: XCUIApplication, name: String, slug: String) {
        let shot = app.screenshot()
        let attachment = XCTAttachment(screenshot: shot)
        attachment.name = "\(slug)/\(name)"
        attachment.lifetime = .keepAlways      // 成功時も保持する（既定は失敗時のみ）
        add(attachment)
    }
}
```

`lifetime = .keepAlways` が要点。既定の `.deleteOnSuccess` だと
**テストが通ったときだけ画像が消える**——記事用途では逆である。

### Step 2: xcresult からの取り出し

`scripts/qa/extract-screenshots.sh`（新規）

xcresult 内の attachment を `artifacts/screenshots/ios/<article-slug>/` へ展開。
既存の `summarize_xcresult.py` が xcresult を読む実装を持っているので、
**そのパース方式に合わせる**（xcresulttool のJSON形式はXcodeバージョンで変わるため、
既存実装と流儀を揃えないと二重メンテになる）。

### Step 3: マニフェスト生成

`SCREENSHOT_PIPELINE_PLAN.md` を参照。

### Step 4: 1コマンド化（§32）

```sh
./scripts/qa/run-article-verification.sh obsidian-voice-input
```

内部は既存を呼ぶだけにする:

```
bootstrap.sh → run-ios-ui-tests.sh（記事用testplan）
→ extract-screenshots.sh → generate-manifest → verification report
```

**新しいランナーを書かない。** 既存QAスイートの上に薄く乗せる。

---

## やらないこと

| 項目 | 理由 |
|---|---|
| 新しい Simulator 起動スクリプト | `detect_ios_destination()` が既に複数runtime対応込みで存在 |
| 新しい seed data 機構 | `QATestSupport.swift` が既に網羅 |
| 新しい UIテスト基盤 | `QAUITestBase` が既にある。**上に足すだけ** |
| Release ビルドへの Screenshot Mode 混入 | `#if DEBUG` の既存方針を崩さない |
| macOSランナーの常時実行 | 予算事故の前例あり（$10/日）。手動 dispatch か週次に限定 |

---

## Simulator で検証できないもの（§29）

記事側で必ず区別して書く:

```
実マイク品質 / Bluetooth / AirPods実接続 / Apple Watch実機連携
Push通知 / 本番StoreKit / 実ネットワーク / バックグラウンド挙動
実端末性能 / Siri・App Intents の一部 / 実音声認識品質
```

**SimpleMemo の主力訴求（音声入力・AirPods・Watch）は、
まさにこの「Simulatorで検証できない」領域に集中している。**

これは重要な現実である。Simulator で撮れるのは
**UIの見た目と操作手順**であって、**音声認識の品質そのものではない**。
記事で「Simulatorで確認した」と書ける範囲を過大に見積もらないこと。

したがって §28 の3状態表記を厳守する:

```
Simulator verified        UIと手順を確認（品質の主張はしない）
Physical device verified  実機で確認（音声品質・AirPods接続はこちらのみ）
Not verified              未検証
```
