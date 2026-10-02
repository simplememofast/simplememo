# 1Password Developer Environments の追加運用審査 — 2026-10-02

原Task126「AI事業者のDPA・データ利用・SLA・撤退計画の審査」に基づく、既存の接続に対する条件付き運用判断。追加購入・契約承認・支払先の承認を行わない。

## 確認した利用範囲

- 2026-10-02、専用のlocal MCPで認証と既存Developer Environmentsの一覧取得が成功した。一覧は空。秘密値の取得、変数・Environmentの作成、local `.env` mount、Vault exportは行っていない。
- この事実の私有受領書は `Root-1Password-actual-authentication-and-environment-inventory.json`（SHA-256 `376a503b3e8f19fa63d3645d694c5c17834e9d6dbae376860d13e354c9901202`、1402 bytes）。公開記録にはアカウントID、本人メール、認証情報、秘密値、端末上の個人パスを転載しない。
- 会社契約の主体、アカウント種別・プラン、同意版、適用地域、Environments/MCPのbeta指定は未確認。空の一覧は、Vaultが空、必要な鍵が存在しない、または任意の秘密を取得してよいことを示さない。

判断は `continue_existing_scope_with_conditions`、リスクはred、アカウント適用は `not_fully_verified`。継続する既存範囲は認証済み接続と必要時の最小のメタデータ確認まで。新たな秘密・本番データの投入やlocal mount、消費側の本番移行へ拡張する前に、対象Environmentの明示権限、実際の製品・契約範囲、下記の処理と出口を確認する。追加の購入は0円のまま。

## DPAと処理上の役割

[Legal Center](https://1password.com/legal-center)の現在の[DPA](https://1password.com/files/legal/agilebits-dpa-012026.pdf)はv4.8、2026-07-30表記。公開DPAの存在は、当社がその版を受諾した証拠ではない。

[Developer Tools規約](https://1password.com/legal/api-sdk-terms-of-service)§9.5はDeveloper Toolsに伴う個人データ処理で双方を独立したcontrollerとし、processor関係を作らないと定めている。Password ManagementのDPAとDeveloper Toolsの処理役割を混同しない。当社のEnvironments/MCPに適用する契約・役割は未確認のまま残す。

条件: アカウントと対象サービスの契約主体・受諾版・処理役割を照合してから、新しい個人情報や本番秘密を扱う範囲を判断する。AIによるこの運用審査を、法的表明、契約締結、所有者によるDPA受諾の代わりにしない。

## データ利用と秘密の境界

[local MCP仕様](https://www.1password.dev/environments/mcp-server)はdesktop app内で動作し、保存秘密値をMCP clientへ返さない設計を説明する。一方、[local `.env`仕様](https://www.1password.dev/environments/local-env-file)ではmountしたファイルを利用processが読み、解除中は他processも読み得る。MCP応答の非表示は、下流process、ログ、生成物にも秘密が存在しない保証ではない。

[Privacy Policy](https://1password.com/legal/privacy)はService/Diagnostic Dataのサービス改善や新技術開発等の利用を記載する。全データについての学習不使用、保存地域、診断情報の実際の内容、下流アプリの保持は今回確定していない。

条件: 必要なEnvironment・変数名・消費process・local pathだけを選び、実許可を確認する。値をプロンプト、CLI出力、公開資料、ログへコピーしない。診断・ログの範囲、local mountの利用者と解除・削除を確認する。汎用Vault読取りやCLIによる取得を、Environments MCPの範囲の代替として始めない。

## SLA・継続性

Developer Tools規約§10は可用性・連続性等を保証しない。Legal Centerの公開SLAリンクは旧Trelica購入者向けであり、Environments/MCPへの保証として使わない。[公開status](https://status.1password.com/)は状態の観測先で、当社の契約上の救済や稼働率保証の証拠ではない。

[Beta規約](https://1password.com/legal/beta-terms-of-service)はbetaを本番・機微情報の利用向けとせず、SLAや保持の義務を設定しない。現在の製品のbeta指定と自社契約への適用は未確認。認証成功と空のEnvironment一覧だけで、本番への採用や可用性保証の受入を行わない。

条件: 新たな本番秘密・データを扱う前に製品指定と契約範囲を確認し、利用する原consumerの停止・復旧条件を固定する。接続失敗時はその接続をunavailableとして残し、推測した鍵、架空Environment、空の検証済みデータ、別の未審査経路で成功に置き換えない。

## 撤退と再審査

[Vault export](https://support.1password.com/export/)は平文の1PUX/CSVを作成する。Environment全体の移行・復元がそのexportで成立することは確認していない。今回exportを行わない。

公式local `.env`文書はEnabledをoffにするとlocal mountを削除する手順を説明する。MCPの承認は1Passwordのlockまで継続する仕様なので、利用終了時の権限失効も別に扱う。[Environmentの削除](https://www.1password.dev/environments)は復元不可で連携が止まる。[アカウント削除](https://support.1password.com/delete-account/)の手順やDPAの削除条件は、下流コピー・backup・法的保持例外の消去完了証明とは異なる。

条件: 移行対象のEnvironment・変数名・消費側を値抜きで棚卸しし、秘密を露出しない許可済みの移行経路を選ぶ。代替consumerの実接続を確認後に、local mount削除とMCP権限失効、必要な下流コピーの整理を確認する。Environment/accountの削除・契約終了は、その不可逆な操作に対する別の指示を受けてから行う。完全移行・復旧・削除は未検証のまま残す。

再審査条件は、アカウント/プラン変更、処理範囲変更、規約/再委託先通知、事故、終了前。新たにEnvironmentを選ぶ前にも、対象権限・製品指定・データ/本番利用範囲と撤退条件を照合する。

## 既存審査との関係

この追加審査は2026-10-02に行った。既存の11登録先＋3追加依存先の14判断、2026-09-08の初回審査時刻、既存根拠、所有者のDPA確認日を変更・再審査済みにしない。1Passwordを追加すると対象は15になる。既存レコードの期限2026-10-08 UTCは延長しない。

権限根拠は `data/authority-matrix.json` の「外部サービスの運用審査」。`check-vendors`は対象漏れ・4観点・根拠SHA・期限・非承認の整合性を検査するが、公開規約の当社への法的適用や移行・削除の完了は証明しない。原203タスクの構成・実行者分類、自律率の分母・達成値はこの追加で変更しない。
