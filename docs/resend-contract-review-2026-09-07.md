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

管理画面の確認は未完了。今回Chromeのブラウザ操作接続は利用できず、実行済みDPAの取得には至っていない。公開文書の記載を実際の契約同意や削除成功の証拠として扱わない。`dpa_reviewed` とAI実行率は変更しない。
