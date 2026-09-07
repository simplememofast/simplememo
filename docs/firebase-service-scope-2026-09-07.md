# Firebaseの審査対象と個人情報分類

2026-09-07。iOSの検査済みソース `ddcb604685153d661f92040f55ad8d23e64d37c7` を読み、実装上の利用サービスとデータを確認した。

- `SimpleMemo.xcodeproj/project.pbxproj` はFirebaseAuthとFirebaseAppCheckを製品依存として宣言している。
- `SimpleMemo/AppDelegate.swift` はApp Checkのプロバイダーを設定しFirebaseを初期化する。
- `SimpleMemo/GoogleSignInService.swift` はGoogle認証情報をFirebase Authへ渡し、認証結果の `user.email` を取得する。
- `SimpleMemo/AppleSignInService.swift` はApple認証の `fullName` をFirebase認証情報に渡し、Firebaseの `user.email` を取得する経路を持つ。

これらを根拠にFirebaseの `personal_data` を `pseudonymous` から `personal` へ訂正した。初回認証で値が得られない場合もあり、全利用者の氏名が保存されたとは言わない。実ユーザーのトークン・氏名・メールは閲覧・出力していない。SDKのすべての処理や本番通信を監査したという意味でもない。

[Firebaseの公式規約一覧](https://firebase.google.com/terms)（表示更新日2026-09-02）はAuthenticationとApp CheckをGCP規約の対象として列挙している。オフライン契約が優先する場合の条件も示している。[GCP規約](https://cloud.google.com/terms)をFirebaseの分析用追加URLへ登録した。主URLと人の過去判定は維持する。これは一覧からの審査対象特定であり、GCP全文の条項分析や実際の契約適用確認の完了ではない。

実際の契約版、プラン、DPA、SDK設定・同意取得、運用上の保存・削除の確認は残る。業務executorとAI実行率は変更しない。

## 追加の審査対象

[Service Specific Terms](https://cloud.google.com/terms/service-terms) §41(b)はGoogle Sign-Inに[API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)を適用する。後者の公開本文（2024-02-15更新）は全文確認済み。用途開示・必要最小限の権限・安全なデータ管理の条件があり、Sensitive/Restricted scopes向けの追加条件は実際の要求scopeとの照合が必要になる。電話番号認証の条件をGoogle/Apple認証へそのまま当てはめない。

Firebase公式一覧が参照するService Specific Termsと、その定義が参照する[Cloud Data Processing Addendum](https://cloud.google.com/terms/data-processing-addendum)を審査対象へ追加した。Service Specific Termsは一般条項の途中と§41を確認した段階で、全文確認は未完了。URL登録は分析完了・契約適用・設定変更の証拠ではない。

## DPAの読了範囲と残る確認

2026-09-07に公開DPAの本文および付録1〜4を全文確認した。別リンクのSCC、再委託先一覧、監査対象一覧は未読であり、この読了範囲に含めない。

- §6: 契約中の削除指示後は原則最長180日。終了時は最大30日の回復期間後に原則最長180日で削除する。法令上の保持や継続契約の例外がある。
- §7.2: 事故通知は不当な遅滞なく行う条件で、固定時間の保証とは扱わない。通知先の更新・認証情報管理は顧客側の確認事項。
- §11: 新規再委託先は原則30日前までに通知。異議申立ては通知後90日以内の即時契約終了による。
- 付録3: 越境移転と各地域の条件がある。欧州法が適用される非EMEA顧客の管理画面での申告要否を、実際の利用者・請求国と照合する。

付録4のImplementation Services等にある例外をFirebaseへ一律適用しない。実際の契約受諾、削除機能・保持状況、通知先、利用リージョン、再委託先とSCCの確認は残る。公開文書の読了をもってDPA適用確認や業務のAI移管完了にはしない。
