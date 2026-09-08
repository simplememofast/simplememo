# Premium設計判断の実行証拠

2026-09-08、オーナーの包括委任に基づき、CodexがPremiumの価値を利用上限解除と
設定済みObsidianへの専用保存へ絞る設計を採用し、購入画面へ適用した。
無料でも使えるCaptureの速度と、優先受付を一律に約束する運用証拠のないサポート表示を
有料特典から外した。価格・無料枠・StoreKitの既存権利は今回変更していない。

- 判断書：iOS `docs/adr/ADR-002-premium-benefit-scope.md`。
- 採用記録：iOS `data/premium-benefit-decision.json`、判断者AI、配信待ちを明示。
- 実装：`SimpleMemo/PaywallViewController.swift`、`ui=v2_verified_benefits`。
- [iOS PR #441](https://github.com/simplememofast/simplememo-ios/pull/441)。
- 検証対象：`aea30f2d221c197c953d04fa676cb3b9fa0a1029`。
- 静的QA：[34186880603](https://github.com/simplememofast/simplememo-ios/actions/runs/34186880603)、成功。
- Localization Parity：[34186880581](https://github.com/simplememofast/simplememo-ios/actions/runs/34186880581)、成功。
- Xcode Cloud PR Check：`4cd6af6b-3389-4068-89f3-e09f0a923582`、ビルド・FastUnitとも成功。
- main適用：`0a3d4ac8d9148576ecf0b84f97f64181f40e8e26`、2026-09-08T04:34:24Z。

対象は既存の「プレミアム機能の設計判断」1件。設計の採用とコードへの適用は完了した。
この小さな変更だけではTestFlightを追加配信しない。一般配信と購入率への効果は未確認で、
「オンボーディング改善（課金導線）」、価格変更、実験結果の実行証拠には転用しない。
詳細なソースとCIの閲覧には、非公開リポジトリへのアクセス権が必要。
