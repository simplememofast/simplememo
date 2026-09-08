# GitHubの実プランとAI学習設定

2026-09-08、SimpleMemoのソースを所有するアカウントの認証済み管理画面を確認した。
請求のOverviewには個人アカウント、GitHub Free、Copilot Freeが表示されていた。
認証済みGET /userでもUser型と同じアカウントを確認したが、planはnullだった。
nullから無料と推定せず、今回のプラン名は管理画面を根拠にしている。
基本プラン名はActions等の従量費用がゼロであることを意味しない。

Copilot設定では「Allow GitHub to use my data for AI model training」がEnabledだった。
対象は入力、出力と付随するコンテキストである。
アプリ運営についての包括委任に基づき、CodexがDisabledへ変更し、
ブラウザの再読み込み後も同じアカウントでDisabledと表示されることを確認した。
画面は設定の反映に最大30分かかると案内している。保存状態を確認した記録であり、
事業者内部の学習処理や過去のデータ削除を実測した記録ではない。

[公式の設定手順](https://docs.github.com/en/copilot/how-tos/manage-your-account/manage-policies)
は個人向けプランの学習利用と無効化を説明し、Business/Enterprise側のDPAによる
取扱いを区別している。今回のFree表示をEnterprise向けDPA・SLAの適用証拠にはしない。
個別契約の適用、データ削除期限、事業者全体の置換は引き続き未確認である。
契約承認、プラン、支払い、リポジトリ公開設定、他のCopilot機能は変更していない。

この記録は既存の [契約・復旧の追加審査](github-recovery-review-2026-09-07.md) を補う。
専用の契約交渉プレイブックは見つからなかったため、既存の取引先台帳と一般的な
商用契約の観点を基準に、確認できた設定と契約適用の不明点を分けた。
法的な適用判断へ依拠する際は、資格を持つ専門家による確認が必要である。
ベンダー全体のDPA・データ利用・SLA・撤退計画の審査完了として加点しない。
