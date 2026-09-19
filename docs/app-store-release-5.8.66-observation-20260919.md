# 5.8.66 / 1671 の一般公開観測と AI 実行率の非加点

確認日: 2026-09-19 JST。

## 観測した事実

- App Store Connect の GET-only `App Store Review Status` run
  [35387187929](https://github.com/simplememofast/simplememo-ios/actions/runs/35387187929)
  は `checked_at=2026-09-18T19:39:58Z` に 5.8.66 / build 1671 を
  `READY_FOR_DISTRIBUTION`、`release=AFTER_APPROVAL` と確認した。
- 同じ取得で review submission
  `1130af2f-aba2-465b-9c1d-6ed073be73cf` は `COMPLETE`。
- 公開 iTunes lookup (`id=6758438948`, JP) は version 5.8.66、
  `currentVersionReleaseDate=2026-09-18T19:33:43Z` を返した。
- `v5.8.66` は `5dec6d81a34f08f88697759bcf5d861bdb79d389`。
  オンボーディング課金導線 PR454 の main commit
  `8ac29b4e558b73dc73bd6a0e6105234915632cd8` はこのタグの祖先である。

## なぜ task 78 / 142 を加点しないか

5.8.66 の提出 run
[35359256581](https://github.com/simplememofast/simplememo-ios/actions/runs/35359256581)
は `.github/workflows/submit-review.yml` の個別承認ラッパーから
`review-submit.yml` を呼んだ。`gated_publication` は渡されず、再利用 workflow の既定値
`false` により `RELEASE_POLICY=after_approval` だった。

一方、2026-09-13 に定義した task 78 の実完遂条件は、standing delegation の
`gated_publication=true` で候補を MANUAL に置き、審査後に
`asc-publish-version.yml` が対象版・ビルド・SHA、実機記録、同一確定週の健康度、
承認後6時間、直近7日の kill、日次上限等を独立ゲートで照合してから、一度だけ公開を
要求し、公開状態を readback する経路である。

今回の版は一般公開そのものは成功したが、この独立公開ゲートを通っていない。
`READY_FOR_DISTRIBUTION` の事後観測を「公開前ゲートを通った」と読み替えると、
`docs/gated-publication-execution-20260913.md` に明記した非加点基準を破る。

そのため:

- ④ `App Store への公開（審査通過後）`: `human_only` / `verification_pending` を維持。
- ⑨ `オンボーディング改善（課金導線）`: `ai_proposes` / `verification_pending` を維持。
- AI実行率の分子・分母は変更しない。

次に加点できるのは、上記 standing-delegation の公開ゲートを正当に通る次期版が、
公開要求受付から一般公開 readback まで実完遂した場合だけである。5.8.66 の再提出、
旧版提出、重複公開、新しい小幅 TestFlight は不要。
