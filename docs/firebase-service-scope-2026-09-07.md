# Firebaseの審査対象と個人情報分類

2026-09-07。iOSの検査済みソース `ddcb604685153d661f92040f55ad8d23e64d37c7` を読み、実装上の利用サービスとデータを確認した。

- `SimpleMemo.xcodeproj/project.pbxproj` はFirebaseAuthとFirebaseAppCheckを製品依存として宣言している。
- `SimpleMemo/AppDelegate.swift` はApp Checkのプロバイダーを設定しFirebaseを初期化する。
- `SimpleMemo/GoogleSignInService.swift` はGoogle認証情報をFirebase Authへ渡し、認証結果の `user.email` を取得する。
- `SimpleMemo/AppleSignInService.swift` はApple認証の `fullName` をFirebase認証情報に渡し、Firebaseの `user.email` を取得する経路を持つ。

これらを根拠にFirebaseの `personal_data` を `pseudonymous` から `personal` へ訂正した。初回認証で値が得られない場合もあり、全利用者の氏名が保存されたとは言わない。実ユーザーのトークン・氏名・メールは閲覧・出力していない。SDKのすべての処理や本番通信を監査したという意味でもない。

[Firebaseの公式規約一覧](https://firebase.google.com/terms)（表示更新日2026-09-02）はAuthenticationとApp CheckをGCP規約の対象として列挙している。オフライン契約が優先する場合の条件も示している。[GCP規約](https://cloud.google.com/terms)をFirebaseの分析用追加URLへ登録した。主URLと人の過去判定は維持する。これは一覧からの審査対象特定であり、GCP全文の条項分析や実際の契約適用確認の完了ではない。

実際の契約版、プラン、DPA、SDK設定・同意取得、運用上の保存・削除の確認は残る。業務executorとAI実行率は変更しない。
