# Decision Monitorの独立した定時起動

2026-09-05。GitHub側は15分間隔の定義でも、実際のscheduled runは
05:43:50 UTC（33947963249）→09:28:45（33958089720）→13:00:15
（33967627428）と、3時間44分55秒・3時間31分30秒空いていた。
workflowはactiveで、マージ後のworkflow_runは動いている。
[GitHubの公式説明](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows#scheduled-workflows-running-at-unexpected-times)
はscheduleの遅延・欠落がありうるとしているが、この事例の原因は未特定。

[既存の欠落監視](decision-monitor-schedule-health-2026-09-04.md)は日次のGitHub
schedule自身に依存する。そのため、既存のMac実行環境にモデルを使わないlaunchdの
15分タイマーを追加する。同じ `decision-monitor.mjs --apply` を検証済みmainから実行し、
成果の決済・次の判断への反映・宣言した静的変更に限る復旧を既存の制約内で行う。
GitHubの定時・マージ後起動も維持する。新しいトークン、Cloudflareの資格情報、
モデル支出は追加しない。GitHubには既存のgh認証をそのプロセスだけで使う。

## 実行と待機

- workflowのID・パス・active状態を実APIで確認する。明示的な無効化は尊重する。
- queued/in_progress/waiting/pending/requestedを個別に読む。古いrunでも実行中の
  handleがあれば待ち、キャンセルや再起動をしない。APIエラー・部分一覧・未知状態は停止する。
- schedule/workflow_runの成功runに含まれる実際のmonitor stepの完了時刻を読む。
  15分以内なら待つ。runのupdated_atや手動dry-runを代用しない。
- 自身の直近の成功証跡も15分間有効。処理が失敗・観測不能・公開待ちだった場合は
  成功証跡を書かず、次回を抑止しない。ローカルの同時実行はflockで待つ。
- 専用cacheのGitからmainをfetchし、毎回新しい一時worktreeを使う。
  global/Act緊急停止と、インストールしたlauncherがmainの実体と一致することを確認する。
  mainから自己検査3本を通してから、同じmonitorを実行する。
- 公開待ちのdecision-observe PRは、番号・head・main・同一リポジトリ・変更ファイル
  全件・remote refを再確認して待つ。draftも待ち、意図的な保留を解除しない。
- 2つの時計が同じmainを処理しても、観測PRのブランチ名は開始SHAから一意に決める。
  既存ブランチを拒否し、force pushを使わない。mainが進んだ場合も次回へ渡す。
  既存のSEO Validation成功と検証済みSHAによる自動マージを必ず経由する。

## 無人実行の証跡

`DECISION_MONITOR_NATIVE_TIMER=1`だけでは無人実行とはしない。NodeからOSに問い合わせ、
親PIDが `com.simplememo.decision-monitor` の実行中PIDであること、ProgramArgumentsが
`/usr/bin/python3 ~/.local/libexec/simplememo-decision-monitor.py --once`と一致すること、
`launchctl blame`が `interval` であることを確認する。

隔離サービスの実測では初回起動は `speculative`、自然な定時起動は `interval`、
手動kickstartは `non-ipc demand` だった。隔離サービスは試験後に削除した。
`man launchctl`はblameを診断用の不安定なインターフェースとしているため、
未知の形式は無人扱いせず非0終了する。将来のmacOS変更には再検証が必要。

証跡は起動理由・PID・launcherのSHA256・実行main SHA・観測時刻とchecksumを持つ。
checksumは記録の整合性検査であり、外部の署名や改ざん不能性を主張しない。
起動元はその場のOS照合で確認し、後の読取時にchecksumと必須フィールドを照合する。
手動関与を含む既存の障害は、後続が自然起動でも無人障害に変えない。
配点・成果要件・判定期限は維持し、試験や手動probeを復旧・価値の実績に加点しない。

## 導入・停止・更新

検証済みPRがmainへ着地してから、そのmainの作業ディレクトリで実行する。
`--install`はファイルを配置するだけでサービスを起動しない。

```sh
python3 scripts/decision-monitor-local.py --install
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.simplememo.decision-monitor.plist"
```

plistはStartInterval=900、RunAtLoad=false。launcherは0700、plist・ログ・成功証跡は0600、
cacheディレクトリは0700。初回から自然なintervalを待つ。手動kickstartで実績を作らない。
ログと成功証跡は `~/Library/Caches/com.simplememo.decision-monitor/` に置く。
トークン・生API応答・コマンドstderrはログに保存しない。成功した観測結果と
公開待ち/実行中/停止/観測不能を分けて記録する。

サービスを停止する場合:

```sh
launchctl bootout "gui/$(id -u)/com.simplememo.decision-monitor"
```

更新は既存サービスをbootoutしてから、検証済みmainの `--install` とbootstrapを行う。
停止が明示されていた場合は、更新のために自動で再開しない。
診断用の `--probe` は手動の読み取りであり、公開も成功証跡の保存も行わない。
Macが停止・ログアウト中ならこの経路も停止する。独立しているのは起動時計であり、
GitHub APIや既存gh認証の障害まで回避できるとは主張しない。

## 検証と残る実測

7本のPython自己検査で実際のrunner入口、API不完全応答、古いlive handle、実stepの時刻、
手動probe、緊急停止、失敗時の成功証跡抑制を検査した。Node側では実CLIの公開待ち、
OS由来の判定、過去の人手介入保持、実Gitの2つのcheckoutからの競合を検査する。
6本のPython変異と5本のNode変異は全て検査を非0終了させた。

導入前のこれらは検体による証拠。導入後の自然なinterval実行は別途実ログで確認する。
成果契約の最初の判定は9月6日のJST全日が閉じた9月7日以降であり、前倒ししない。
自然発生した静的回帰の検知→PR→本番復旧も、実際に発生して確認できるまで未実証とする。
