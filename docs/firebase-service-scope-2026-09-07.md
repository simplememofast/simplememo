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

Firebase公式一覧が参照するService Specific Termsと、その定義が参照する[Cloud Data Processing Addendum](https://cloud.google.com/terms/data-processing-addendum)を審査対象へ追加した。2026-09-07にService Specific Termsの一般条項、製品別条項、第三者条項、料金・パートナー条項を全文確認した。別リンクの文書は読了範囲に含めない。URL登録は契約適用・設定変更の証拠ではない。

一般条項§16のEU Data Actによる移行手続きは、EEA請求先住所かつ対象サービスという条件がある。日本語アプリという理由で適用・不適用を決めない。製品別§41の認証条件を起点に実際の利用サービスを照合し、未利用のAI/ML、PNV、他社製品の例外をFirebase認証へ広げない。

責任上限・知財・準拠法等の共通本文の分析は、台帳の既存記録 `google-cloud-base-terms-20260907` を参照する。同じGCP本文の分析をベンダーごとに複製して完了件数を増やさない。Firebaseについては、共通本文とこの追加条件の読み合わせ、および実契約の照合を区別する。

## DPAの読了範囲と残る確認

2026-09-07に公開DPAの本文および付録1〜4を全文確認した。別リンクのSCC、再委託先一覧、監査対象一覧は未読であり、この読了範囲に含めない。

- §6: 契約中の削除指示後は原則最長180日。終了時は最大30日の回復期間後に原則最長180日で削除する。法令上の保持や継続契約の例外がある。
- §7.2: 事故通知は不当な遅滞なく行う条件で、固定時間の保証とは扱わない。通知先の更新・認証情報管理は顧客側の確認事項。
- §11: 新規再委託先は原則30日前までに通知。異議申立ては通知後90日以内の即時契約終了による。
- 付録3: 越境移転と各地域の条件がある。欧州法が適用される非EMEA顧客の管理画面での申告要否を、実際の利用者・請求国と照合する。

付録4のImplementation Services等にある例外をFirebaseへ一律適用しない。実際の契約受諾、削除機能・保持状況、通知先、利用リージョン、再委託先とSCCの確認は残る。公開文書の読了をもってDPA適用確認や業務のAI移管完了にはしない。

## 取得文書の照合用指紋

同日の実管理画面も読み取り確認した。iOSの `GoogleService-Info.plist` のプロジェクトと一致するFirebaseプロジェクトで、料金プランはBlaze。「データのプライバシー」ではFirebase Service Dataの他Googleサービス改善等への使用が有効だった。画面説明はService Dataから顧客データとGoogle Cloudサービスデータを除外しているため、この設定を認証顧客データの学習利用への同意とは解釈しない。DPAの受諾日・版はこの画面からは確認できなかった。設定は変更していない。

検査済みiOSソースの `GoogleSignInService.swift` は `signIn(withPresenting:)` を追加scope引数なしで呼ぶ。ただし、これは過去に付与済みの権限や管理コンソールの要求scope全体を確認した証拠ではない。

全文は公開リポジトリに保存しない。以下は2026-09-07 09:35 UTCに取得したHTMLを既存の `scripts/vendor-terms.mjs` の `toText` で正規化した結果。本文の読了は公開ページ表示で行い、指紋は取得物の同一性の照合用である。ナビゲーション等も含むため、指紋変化だけでは条項改定と断定しない。

| 文書 | 表示版日 | 文字数 | SHA-256 |
| --- | --- | ---: | --- |
| Service Specific Terms | 2026-07-29 | 176928 | `b429d7e9d7e2dae477c2c2a810d156374cdeb07bcee8ef12d9c18ddd31b077d1` |
| Cloud Data Processing Addendum | 2026-06-08 | 139594 | `35438bec52130b9cf03f56545761592d42897294d2f807ae0be026e4752792b6` |

## 4条項検査の共有参照（2026-09-07）

既存業務「責任上限・知財・個人情報・準拠法の条項検査」の対象は規約本文である。契約承認やアカウント固有の受諾版の認定とは別に、今回読んだ共通本文の分析 `google-cloud-base-terms-20260907` をFirebaseから明示参照する。分析記録は複製しない。

2026-09-07に再確認した [Firebase規約一覧](https://firebase.google.com/terms)（2026-09-02版）は、実装で確認したAuthenticationとApp Checkを [GCP Terms](https://cloud.google.com/terms) の対象とし、Service Specific Termsを組み込む。オフライン契約の例外も維持する。共通本文の4観点の結論・根拠位置・指紋は既存分析に保持し、Firebase固有の読み合わせには本書のサービス特定、追加条件、DPA本文・付録の読了記録を使用する。

特に個人情報の観点では、GCP本文の処理条件だけで保持・削除・移転を完了扱いにせず、上記DPA §6・§7.2・§11と付録3の条件を併せて確認した。Firebaseの別サービス向け条件や未読のリンク先を読了範囲へ広げない。残る実契約の適用、SCC・再委託先、管理画面の設定照合は未確認として残す。これらはDPA審査全体を完了としない理由であり、公開された4条項をAIが読んだ記録そのものを消す理由にはしない。

この参照の検証は文書と分析の同一性を守るもので、AIの法的結論の正しさや当社への適用を保証しない。人の過去の確認記録、契約承認、利用者同意は更新しない。
