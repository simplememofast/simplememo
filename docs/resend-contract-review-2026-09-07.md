# Resend契約のAI分析記録

2026-09-07。AIが[Terms of Service](https://resend.com/legal/terms-of-service)の全30節を取得・読解し、12観点を `contract_review.ai_assessments` に原文位置・SHA-256付きで記録した。表示更新日は2026-08-27。原文、顧客のメール本文、資格情報はコミットしない。人の過去の判定は保持する。

## Incorporated DPA: initial review

Source: [Resend DPA](https://resend.com/legal/dpa), updated 2026-08-27. Read the complete page, sections 1–12 and Exhibits A–C; incorporated SCC text was not separately reviewed.

- Preamble/§12: agreement acceptance binds the DPA; executed versions are available through the dashboard. Actual account evidence remains unverified.
- §§2,9: processing roles differ for customer content versus account/usage data.
- §§3–4: personnel confidentiality; subprocessor notice and objection period of 14 days.
- §6: US processing and conditional SCC transfer mechanisms.
- §8: assistance/audits may cost extra; breach notification has a customer-action exception (§8.8).
- §10: SCCs precede DPA, agreement and privacy policy; agreement liability limitations apply.
- Exhibit A: email metadata, addresses and content; account-termination deletion within 90 days. Sensitive data is described as inapplicable—check actual memo scope.

Next: verify executed agreement, plan/SLA, subprocessor list, consent scope and actual deletion/export path. This is analysis, not certification or acceptance. Seek qualified counsel before legal reliance.

## 管理画面と署名入り版の確認

当初Chromeのブラウザ操作接続は利用できなかったが、既存ブラウザでページを開き、ネイティブ画面の読み取りで確認できた。2026-09-07のUsage画面はTransactional Pro（月50,000通）、Transactionalの従量超過課金OFF、Marketing Free。設定は変更していない。これだけでは契約金額や個別SLAは確認できない。

Documents画面は、Resend署名済みDPAを登録時に締結済みと扱う旨を表示し、[署名入りPDF](https://resend.com/static/documents/resend-dpa-signed.pdf)へリンクしていた。19ページを読解し、13ページの署名欄を画像でも確認した。文書更新日は2025-12-31、供給者の署名日は2026-01-14。顧客欄は空欄で、当社固有の署名日時の証明ではない。署名画像は確認したが電子署名の暗号検証はしていない。

取得PDFのSHA-256: `f028a0d8c49850dca8ca2959ecd6e853095c55017bf72395567b787dd44c42ef`。本文・署名画像はコミットしない。2026-08-27版HTMLと更新日が異なるため、同一版又はどちらが優先するかとは断定しない。通知例外（§8.8）、役割の区分（§9）、文書の優先順位（§10）、終了後90日以内の削除（Exhibit A）はPDFでも確認できた。実際の削除・移行の成功は別途必要。

台帳には2026-09-01の人によるDPAレビューと現状維持の判断が既にある。今回のAI観測はその履歴を取り消さず、供給者側の書類と実プランの証拠を追加する。`dpa_reviewed` とAI実行率は変更しない。
