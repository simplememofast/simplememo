# PR TIMESの規約取得先を修正

2026-09-07。台帳の `https://prtimes.jp/main/html/terms` はローカルHTTPS取得でHTTP 404になった。[公式ヘルプ](https://tayori.com/q/prtimes-faq/detail/423946/)が案内する[利用規約](https://prtimes.jp/main/html/kiyaku)は本文を取得できた。

主URLを有効な規約ページへ変更し、旧URLと観測結果を `source_history` に保存した。26,107文字の本文に対する初回指紋は `a8d0d1cc22d0`。既存の `reconcile` は `unseen` と判定し、既存の `applyVerdict` により過去の判定・人の実行者・レビュー日を保持した。これは新しい承認ではない。初回の指紋なので、旧本文からの改定有無も分からない。

指紋が一度も付いていないベンダーは2社から1社へ減ったため、既存の `tightenFingerprintBudget` によって許容枠も2から1へ下げた。監視の許容範囲を緩めていない。

取得ページの表示更新日は2024-09-20。運営者ポリシー、基本・企業・報道・一般規約を全文読解し、AIの12観点の分析を別記録に保存した。原文全文は再公開しない。実際の適用契約・プラン・個人情報保護方針・運用設定等の審査は残り、executorと実行率は変更しない。

## AppsFlyerの取得先も復旧

同日、残る未指紋のAppsFlyerの旧URL `/legal/services-agreement/` もHTTP 404と確認した。[公開利用規約](https://www.appsflyer.com/legal/terms-of-use/)は取得でき、53,731文字から初回指紋を作成した。監視用の主URLをこのページへ修正し、旧URLと観測を保存した。表示更新日は2025-11-23。別に[MSA](https://www.appsflyer.com/legal/msa)があるため分析用の追加URLへ登録した。

この段階でAppsFlyerの全文の条項分析は完了していない。どちらが実際の契約に適用されるかも未確認。過去の判定・実行者・レビュー日は保持し、監視用本文の初回取得を再審査や承認として扱わない。未指紋は0社になったため、許容枠を1から0へ下げた。これはリンク先全契約の監視完了や、次回のCI取得成功を保証するものではない。
