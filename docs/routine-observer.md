# 副系の実行記録を読み取る

> **2026-10-20 退役。** Macの毎時観測（launchd `com.simplememo.routine-observer`）は、オーナー判断で退役した。
> `data/routine-runs.json` は `observation_retirement` で「退役中・観測していない」状態を明示し、最後の実測をそのまま残す。
> `scripts/routine-observer-local.py` は旧フラグを副作用なしで拒否する墓標になった。
> 理由・失うもの・戻し方・Macからの撤去は、末尾の「2026-10-20: 退役」節にある。以下の取得・継続観測の記述は退役までの記録。

読み取りプログラムは `node scripts/routine-observer.mjs --apply`。モデルの推論・Routineの発火・予定変更は行わない。

2026-09-05のGitHub実走33935822325では、既存の`CLAUDE_CODE_OAUTH_TOKEN`がこのAPIにHTTP 401で拒否された。ローカルのClaude Code認証で読めることから、GitHubでも読めるとは推定できなかった。`Autopilot Act`側は`CLAUDE_ROUTINE_API_READ_ENABLED=true`を明示したときだけ取得する。別の認証を追加したり、この変数を未検証で有効にしたりしない。

取得先は `GET https://api.anthropic.com/v1/code/triggers`。`include_last_run=true` を指定し、100件ずつ最後まで列挙する。30ページを上限とし、重複、欠落したcursor、未知の状態、不正な時刻、HTTP失敗では更新しない。認証失敗時にログインや権限の追加は行わない。モデルの利用上限と管理APIの利用可否は別々に観測する。

公開するのは `data/routine-runs.json` に登録されたSimpleMemoタスクの運転メタデータだけ。APIが返す指示、環境変数、接続設定は保存しない。未登録の現行タスクは件数だけを記録する。新しいSimpleMemoタスクを監視対象に加えるときは、所属と用途を確認してこの台帳へ登録する。

新しい異常は観測時刻・成否・実行時刻とともに未解消一覧へ追記する。`open_budget` はこの一覧の実件数と一致させる値で、費用や故障を許容する上限ではない。既存の意図的な停止は維持し、勝手に動いた場合は判断が必要として更新を拒否する。異常を閉じるにはAPI上の新しい成功実行を必要とし、過去の成功や将来の予定だけでは閉じない。終了した一回予定はAPIの終了理由・実際の発火時刻を記録して対象から外す。ただし、その予定に未解消の異常や停止判断があれば自動では外さない。

セッションが成功したことは、記事が公開されたこと、SNSに投稿されたこと、依頼内容が達成されたことを意味しない。この記録だけで自律スコアの出荷・復旧実績に加点しない。

取得失敗では台帳を書かず、最後に取得できた写しの3日上限を既存の検査で守る。新しい写しが取れないことを、写しの更新日時だけを進めて隠さない。

`--probe` は同じ取得・突き合わせを行い、ファイルを書かない。`--selftest` は資格情報・ネットワーク無しで検証する。

## Macで継続観測する

**（2026-10-20 退役。この節の導入・実行は行わない。`--once`・`--probe`・`--install` は何もせず exit 2 で終わる。）**

`python3 scripts/routine-observer-local.py --once`は、専用キャッシュのmainから一時worktreeを作り、Keychainにある既存Claude Code認証を読み取りステップの環境にだけ渡す。秘密をコピーしたり、新しいログインを始めたりしない。毎時確認し、状態変化か24時間経過があったときだけ`Codex/routine-observations`へ台帳1ファイルのPRを作成・更新する。下書きPR・未知の変更・同時実行・先に更新されたブランチは上書きしない。SEO Validationと既存のauto-mergeを通す。

2026-09-05に、現在のアクセストークンが同日15:28 JSTに期限切れとなることを確認した。期限が近いときは、インストール済みClaude CodeのMCPサーバーへ読み取り専用の`RemoteTrigger(action=list)`を1回要求し、標準クライアントの通常のOAuth更新を使う。クライアント2.1.261の`teleport-org`認証処理が、読み取り前に既存認証の更新と失効確認を行うことをコードで確認した。そこで得る最初の1ページは保存・公開せず、更新後のKeychain認証で全ページを改めて読む。権限の増加・期限切れのまま・標準処理の拒否は更新を止める。refresh tokenを独自のHTTP処理・子プロセスの環境・ファイルへ渡さない。

`--probe`は同じ実取得・台帳検査まで行い、push/PRを行わない。`--install`はユーザーの`~/.local/libexec/`と`~/Library/LaunchAgents/com.simplememo.routine-observer.plist`に実行ファイルと設定を配置する。起動は`launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.simplememo.routine-observer.plist`。止めるときは同じplistを`launchctl bootout`する。認証値をplistへ保存しない。

Macがスリープ・停止中、Keychainが利用不能、認証の期限切れの間は観測できない。1時間ごとの確認が完走しなかった場合は次の定期実行へ残し、モデル呼出や別の認証へ切り替えない。ログは`~/Library/Caches/com.simplememo.routine-observer/runner*.log`。このローカル経路だけで常時クラウド監視が完成したとは扱わない。

## ソースが参照できなくなった場合

全件一覧から登録タスクが消えた場合は、同じIDを個別GETし、現在の404を確認する。認証失敗や通信失敗を404として扱わない。現在の状態は `observation_unavailable` とし、有効・無効や実行結果はnull、最後の実測は元の時刻付きの `last_verified` に保持する。既存の停止判断は維持し、それ以外は未解消一覧に残す。欠落で登録数を減らしたり、復旧として閉じたりしない。再出現しても古い成功では異常を閉じない。`auto_disabled_session_gone` はAPIによる無効化の事実だけを表し、実行成功や退役を意味しない。

Codexの観測schema 5も、現在のSQLiteを読み直した時刻と、参照できない過去のセッション証跡を分ける。元のターン・失敗分類・検出証跡は `last_verified` に元の観測時刻のまま保持し、再観測で歴史の時刻を更新しない。履歴の入れ子、別タスクへの差し替え、現在の成功への流用は拒否する。ソースが戻った場合も確定済みターンや失敗分類の書き換えは拒否する。SQLite上の登録済み実行そのものが消えた場合や、全件取得できない場合は引き続き更新を拒否する。

`initial_failed` は確認済みの初回失敗を履歴も含めて数え、`historical_initial_failed` はそのうち現在ソースを参照できない分を示す。`unavailable_transcripts` は現在の欠損数。履歴は新しい実行として再取り込みせず、未記帳または未分類で参照不可の実行が残る間は記帳アクションを解消しない。出荷や事業成果を推測しない。検査の成功は、欠損や未解消を含めた台帳の整合性を表すもので、全タスクの健全性を表さない。

## 2026-10-20: 退役（オーナー判断）

### 理由

- 観測する対象が動いていなかった。登録済みのClaude routineはすべて一覧に無く個別GETも404（参照不可）、Codexの予約2本はすべてPAUSED。
- 所有者のマシンでリポジトリのコードをタイマー実行する回数を減らす（Decision MonitorのMacタイマー退役と同じ方針）。

### 台帳と検査

`data/routine-runs.json` の `observation_retirement` に、退役日・理由・承認・最後の観測時刻（Claude・Codex）・再開の条件を置いた。`observed_at` と `codex_observation` は最後の実測のまま進めない。

- `check-routine-runs.mjs --check` と `codex-routine-observer.py --check` は、退役の条件が全部揃うときだけ写しの鮮度（3日）を適用せず、`retired — not observed since <時刻>` を出す。条件は、欄の6項目がそろっていること、最後の観測時刻が台帳と一字一句同じこと、退役日が最後の観測以後で未来でないこと、登録済みroutineがすべて参照不可か意図的停止で最後の観測より新しい実行を持たないこと、Codexの予約がすべてPAUSEDであること。1つでも欠ければ鮮度の規則がそのまま効く。
- 書き手（`routine-observer.mjs` と `codex-routine-observer.py` の `--apply`・`--probe`、`check-routine-runs.mjs --sync`）は、欄がある間は観測元（API・Codexの記録）を読まず、台帳も書かずにexit 2で終わる。退役のPRがmainに入った後、Macのジョブを止めるまでに旧ランナーが1回走っても、台帳は書き換わらない。
- `scripts/lib/routine-actions.mjs`・Act・Codexの取り込みは、欄がある間を「観測していない」として扱い、健全・解消とは数えない。Actは写しの取り直しを積まない。
- Codexの着手前判定（`codex-autopilot-preflight.mjs`）は、欄がある間 `skip_observation_retired` で着手しない。台帳が読めないときも着手しない。

### 失うもの

Claude routineとCodex予約の独立した実行観測。退役の時点では観測していたものは動いていなかった。routineや予約を再開すると、その失敗は観測器を戻すまで独立には検知されない。Claude routineには、Codexの着手前判定に当たるスクリプト化された入口が無いので、再開を機械では止められない。

### 戻し方

1. 固定（pin）され隔離された観測器を用意する。mainのコードをそのまま所有者のマシンで定時実行する形には戻さない。
2. `observation_retirement` を消すPRをレビューを経て入れる。消すと3日の鮮度規則がすぐ効くので、同じPRで新しい観測を入れる。
3. それまでroutineとCodex予約を再開しない。

### Macからの撤去（オーナーが実行。リポジトリのコードは使わない）

退役のPRがmainに入ってから行う。先に止めると、退役の欄が無いまま3日後に鮮度の検査が赤くなる。
実行中の回が無い（`launchctl print "gui/$(id -u)/com.simplememo.routine-observer"` に `pid =` の行が無い）ことを確かめてから実行する。
退役より前に作られた観測PR（`Codex/routine-observations`）が開いていれば閉じる。マージすると `observed_at` だけが進んで退役の欄と一致しなくなり、3日の規則に戻る。
パスは下の完全一致だけを使い、同じMacの他の `com.simplememo.*` ジョブとそのファイルには触れない。

```sh
L=com.simplememo.routine-observer
launchctl bootout "gui/$(id -u)/$L"
launchctl disable "gui/$(id -u)/$L"
rm -f "$HOME/Library/LaunchAgents/$L.plist" "$HOME/.local/libexec/simplememo-routine-observer.py"
rm -rf "$HOME/Library/Caches/${L:?}"
```

確認: `launchctl print "gui/$(id -u)/$L"` がサービス無しで失敗し、
`launchctl print-disabled "gui/$(id -u)"` でこのラベルが無効と表示されること。
