# Cloudflare管理画面で確認したDPAの組込み

2026-09-08、SimpleMemoが使用するCloudflareアカウントの認証済み管理画面で、
「アカウントの管理 → 構成 → データ処理補遺条項」を確認した。
同画面は、DPAがセルフサービス契約と標準Enterprise契約に組み込まれること、
交渉したEnterprise契約のコピーは担当者へ問い合わせることを案内していた。
アカウント設定や契約への同意状態は変更していない。

画面のリンク先は[Cloudflare Customer DPA](https://www.cloudflare.com/ja-jp/cloudflare-customer-dpa/)だった。
[英語の現行DPA](https://www.cloudflare.com/cloudflare-customer-dpa/)はv6.4、2026-04-03発効。
[Self-Serve Subscription Agreement](https://www.cloudflare.com/terms/) §6.1は、
同項で定義された個人データを処理する場合にDPAを参照により組み込む。
この条件を省いて、すべての処理に同一の条項が適用されるとは判断しない。

前日の[利用サービス・契約範囲の確認](cloudflare-service-scope-2026-09-07.md)に対し、
今回は実アカウントの画面にも標準契約への組込みが表示されていたことを追加した。
過去に同意した契約版・日時、個別に交渉した契約の有無、各サービスへのSLA適用は、
この表示だけでは確定しない。署名済みの個別契約を取得した記録でもない。

保存地域、再委託先、終了時の消去・移行検証を含む既存の未確認事項は引き続き残る。
したがって台帳の `dpa_reviewed` は未完了のまま維持する。
法的な適用判断へ依拠する際は、資格を持つ専門家による確認が必要である。
