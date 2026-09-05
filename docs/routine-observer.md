# 副系の実行記録を読み取る

読み取りプログラムは `node scripts/routine-observer.mjs --apply`。モデルの推論・Routineの発火・予定変更は行わない。

2026-09-05のGitHub実走33935822325では、既存の`CLAUDE_CODE_OAUTH_TOKEN`がこのAPIにHTTP 401で拒否された。ローカルのClaude Code認証で読めることから、GitHubでも読めるとは推定できなかった。`Autopilot Act`側は`CLAUDE_ROUTINE_API_READ_ENABLED=true`を明示したときだけ取得する。別の認証を追加したり、この変数を未検証で有効にしたりしない。

取得先は `GET https://api.anthropic.com/v1/code/triggers`。`include_last_run=true` を指定し、100件ずつ最後まで列挙する。30ページを上限とし、重複、欠落したcursor、未知の状態、不正な時刻、HTTP失敗では更新しない。認証失敗時にログインや権限の追加は行わない。モデルの利用上限と管理APIの利用可否は別々に観測する。

公開するのは `data/routine-runs.json` に登録されたSimpleMemoタスクの運転メタデータだけ。APIが返す指示、環境変数、接続設定は保存しない。未登録の現行タスクは件数だけを記録する。新しいSimpleMemoタスクを監視対象に加えるときは、所属と用途を確認してこの台帳へ登録する。

新しい異常は観測時刻・成否・実行時刻とともに未解消一覧へ追記する。`open_budget` はこの一覧の実件数と一致させる値で、費用や故障を許容する上限ではない。既存の意図的な停止は維持し、勝手に動いた場合は判断が必要として更新を拒否する。異常を閉じるにはAPI上の新しい成功実行を必要とし、過去の成功や将来の予定だけでは閉じない。終了した一回予定はAPIの終了理由・実際の発火時刻を記録して対象から外す。ただし、その予定に未解消の異常や停止判断があれば自動では外さない。

セッションが成功したことは、記事が公開されたこと、SNSに投稿されたこと、依頼内容が達成されたことを意味しない。この記録だけで自律スコアの出荷・復旧実績に加点しない。

取得失敗では台帳を書かず、最後に取得できた写しの3日上限を既存の検査で守る。新しい写しが取れないことを、写しの更新日時だけを進めて隠さない。

`--probe` は同じ取得・突き合わせを行い、ファイルを書かない。`--selftest` は資格情報・ネットワーク無しで検証する。

## Macで継続観測する

`python3 scripts/routine-observer-local.py --once`は、専用キャッシュのmainから一時worktreeを作り、Keychainにある既存Claude Code認証を読み取りステップの環境にだけ渡す。秘密のコピー・ログイン・認証更新は行わない。毎時確認し、状態変化か24時間経過があったときだけ`Codex/routine-observations`へ台帳1ファイルのPRを作成・更新する。下書きPR・未知の変更・同時実行・先に更新されたブランチは上書きしない。SEO Validationと既存のauto-mergeを通す。

`--probe`は同じ実取得・台帳検査まで行い、push/PRを行わない。`--install`はユーザーの`~/.local/libexec/`と`~/Library/LaunchAgents/com.simplememo.routine-observer.plist`に実行ファイルと設定を配置する。起動は`launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.simplememo.routine-observer.plist`。止めるときは同じplistを`launchctl bootout`する。認証値をplistへ保存しない。

Macがスリープ・停止中、Keychainが利用不能、認証の期限切れの間は観測できない。1時間ごとの確認が完走しなかった場合は次の定期実行へ残し、モデル呼出や別の認証へ切り替えない。ログは`~/Library/Caches/com.simplememo.routine-observer/runner*.log`。このローカル経路だけで常時クラウド監視が完成したとは扱わない。
