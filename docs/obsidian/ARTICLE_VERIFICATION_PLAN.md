# Article Verification Plan — 2026-08-09

指示書 §14 / §15 / §25 / §28〜§31 / §86。

**状態: Written（未実行）。** macOS環境が前提。

---

## 何を検証するのか

指示書 §15 のフローは「記事内の検証が必要な主張を抽出 → Simulatorで確認」だが、
**主張には検証できるものとできないものがある**。ここを最初に分けないと、
「検証済み」というラベルが実態より強い意味を持ってしまう。

| 主張の型 | 例 | 検証手段 |
|---|---|---|
| **UIの存在・手順** | 「設定画面でVault名を指定できる」 | ✅ Simulator + assert |
| **画面遷移** | 「送信後に履歴へ反映される」 | ✅ Simulator + assert |
| **状態依存の挙動** | 「無料プランは1日3通まで」 | ✅ `UITEST_TODAY_SENT` / `UITEST_SUBSCRIPTION` |
| **オフライン挙動** | 「圏外でも下書きが消えない」 | ✅ `UITEST_NETWORK=offline`（既存テストあり） |
| **速度・秒数** | 「約1秒で起動」 | ⚠️ Simulatorの数値は実機性能を表さない |
| **音声認識の品質** | 「日本語の認識精度が高い」 | ❌ **実機のみ** |
| **AirPods / Watch 連携** | 「AirPodsのステム長押しで起動」 | ❌ **実機のみ** |
| **Siri の実挙動** | 「『シンプルメモで残す』で起動」 | ❌ **実機のみ**（App Intents の一部） |

**SimpleMemo の主力訴求は下3行に集中している。**
つまり Simulator 検証で強化できるのは
「操作手順とUIの正確さ」であって、「音声品質の主張」ではない。

この区別を曖昧にすると、§28 が禁じている
「Simulator確認を実機確認と書く」に実質的に踏み込むことになる。

---

## 3状態表記（§28）

```
Simulator verified        UIと手順を確認。品質・性能の主張はしない
Physical device verified  実機で確認。音声品質・AirPods・Watch はこちらのみ
Not verified              未検証。その旨を書くか、主張自体を落とす
```

記事メタ（`data/content-graph.json`）に `verificationType` として保持し、
記事末の「検証環境」ブロック（§30）へ出力する。

```
検証環境:
- SimpleMemo: 5.7.3
- iOS: 26.x（iOS Simulator / iPhone 17 Pro）
- 検証種別: Simulator verified（音声認識品質は未検証）
- 検証日: 2026-08-09
```

**「音声認識品質は未検証」を省略しない。** 省くと読者は
記事全体が実機検証済みだと受け取る。

---

## 主張抽出（§15）

記事Draftから検証対象を機械的に拾う。手がかりになる表現:

```
「〜できます」「〜されます」「〜に表示されます」
「タップすると」「設定から」「〜画面で」
数値（秒・回数・件数・上限）
```

出力:

```md
## Claims to verify

| # | 主張 | 型 | 検証手段 | 対応するAXID |
|---|---|---|---|---|
| 1 | 設定からObsidian連携を有効にできる | UI存在 | Simulator | settings.table |
| 2 | 無料プランは1日3通まで | 状態依存 | Simulator (UITEST_TODAY_SENT=3) | dailyLimit.sheet |
| 3 | 日本語の音声認識が正確 | 品質 | **実機のみ** | — |
```

型が「品質」の行は **Simulatorへ渡さない**。
自動化パイプラインに乗せると「検証できなかった」失敗として扱われ、
本来やるべき「実機確認へ回すか、主張を落とす」判断が埋もれる。

---

## Article Verification Report（§31）

記事ごとに `artifacts/verification/<article-slug>.md` を生成。

```md
# Article Verification Report

## Article
/blog/obsidian-voice-input

## Claims Verified
| # | 主張 | 結果 | assert |
|---|---|---|---|
| 1 | 設定からObsidian連携を有効にできる | PASS | SettingsAndObsidianUITests.testObsidianSettingsVisible |
| 2 | 無料プランは1日3通まで | PASS | FreeLimitAndPremiumUITests.testDailyLimit |

## Claims NOT verifiable in Simulator
| # | 主張 | 理由 | 対応 |
|---|---|---|---|
| 3 | 日本語の音声認識が正確 | 実音声認識はSimulatorで再現不可 | 記事から断定を外し「実機で確認してください」へ |

## Simulator
iPhone 17 Pro / iOS 26.x

## Build
PASS

## UI Tests
PASS: 2 / FAIL: 0

## Screenshots
artifacts/screenshots/ios/obsidian-voice-input/ （4枚 / manifest.json）

## Human Review Required
- スクリーンショットの視覚QA（この環境では画像を確認できない）
- 主張3の実機確認、または記事からの削除
```

---

## Quality Gate との接続（§86）

```
Verification 15点の配点:
  15  すべての検証可能な主張が Simulator/実機で PASS
  10  主要な主張のみ検証済み
   5  検証は無いが、検証できない旨を記事内で明示している
   0  未検証の主張を断定形で書いている ← 公開不可
```

**追加の絶対条件**: SimpleMemo機能を説明する記事で
Verification 未実施のものは、合計点に関わらず自動公開しない（§86）。

現時点で **この条件を満たせる記事は0本**（macOS環境が無いため）。
したがって当面、SimpleMemo機能の**新規**説明記事は書かない。

`OBSIDIAN_CONTENT_QUEUE.md` が Refresh 中心なのは、この制約とも整合する
——既存記事への「文字起こし」語の追加（R1）は、
新しい機能主張を含まないため検証ゲートに引っかからない。

---

## パイプラインへの組み込み位置（§119）

```
Draft
 ↓
Claims Extraction          ← ここ
 ↓
Verification Requirement Detection   ← 型で振り分け
 ↓                    ↘
iOS Simulator          実機必要 → 人間へ / 主張を落とす
 ↓
Assertions
 ↓
Screenshot Capture
 ↓
Visual QA              ← 画像を見られる環境が必要
 ↓
Article Insert
 ↓
Quality Gate
 ↓
Publish Candidate
```

**Verification Requirement Detection が分岐点**である。
ここを飛ばして全主張をSimulatorへ流すと、実機必須の主張が
「自動化の失敗」に見えてしまい、§34 の Automation Failure レポートが
本当の失敗と混ざってノイズになる。

---

## 最初にやること（PoC）

1本目は **`/blog/obsidian-voice-input` の既存記述の検証**にする。
新規記事を書かない。理由:

- サイト最強ページ（CTR 10.9% / pos 5.3）なので、記述が誤っていたときの損失が最大
- `SettingsAndObsidianUITests` が既にあり、assertが通っている
- 撮影対象（Obsidian設定画面）が記事に実際に必要な画面と一致する

成功条件は「既存記事の主張リストを作り、Simulatorで検証でき/できないに分け、
検証できたものについて assert済みスクショを1枚出す」まで。
**記事本文の変更はその後**。
