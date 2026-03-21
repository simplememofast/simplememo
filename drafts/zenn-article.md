---
title: "UIKit vs SwiftUI — 起動速度0.3秒を実現するために選んだ技術スタック"
emoji: "🚀"
type: "tech"
topics: ["iOS", "UIKit", "SwiftUI", "パフォーマンス", "Swift"]
published: false
---

# UIKit vs SwiftUI — 起動速度0.3秒を実現するために選んだ技術スタック

2026年にiOSアプリを新規開発するなら、普通はSwiftUIを選ぶ。Appleも推奨しているし、宣言的UIは開発効率が高い。

でも私は[SimpleMemo](https://simplememofast.com/)の開発で、あえてUIKitを選んだ。理由はただ一つ、**起動速度**だ。

## なぜ0.3秒にこだわるのか

SimpleMemoは「起動→書く→送る」だけのメモアプリだ。ユーザーがアプリを開く瞬間は、何かを思いついた瞬間。そのとき0.5秒待たされるか、0.2秒で書き始められるかは、体験として全く違う。

私はこれを **Time-to-Text**（アプリ起動からテキスト入力可能になるまでの時間）と呼んでいる。この数値を500ms以下、理想的には300ms以下にすることが設計のゴールだった。

## ベンチマーク：UIKit vs SwiftUI（iPhone 15 Pro）

同等の機能を持つ最小構成のアプリを両方のフレームワークで作り、コールドスタートを計測した。

| 項目 | UIKit | SwiftUI |
|------|-------|---------|
| コールドスタート（初回起動） | 180–250ms | 400–600ms |
| ウォームスタート（再起動） | 80–120ms | 200–350ms |
| Time-to-Text（キーボード表示まで） | 200–300ms | 500–800ms |
| メモリ使用量（起動直後） | ~12MB | ~22MB |

※ iPhone 15 Pro, iOS 17.4で計測。Xcodeの`os_signpost`とMetricKitを使用。

SwiftUIは初回起動時にbody計算とビューツリー構築のオーバーヘッドがある。シンプルなUIでも`@State`の初期化、`some View`の型解決、差分エンジンのセットアップが走る。UIKitはこれらが不要で、`UIViewController`のライフサイクルが直接的。

## UIKitで速度を稼ぐ具体的なテクニック

### 1. Storyboard完全排除

Storyboardを使うと、XIBのデシリアライズが起動パスに入る。代わりに`UIWindow`とルートVCをコードで直接生成する。

```swift
// SceneDelegate.swift
func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIConnectionOptions) {
    guard let windowScene = (scene as? UIWindowScene) else { return }
    let window = UIWindow(windowScene: windowScene)
    window.rootViewController = ComposeViewController()
    window.makeKeyAndVisible()
    self.window = window
}
```

`Info.plist`からStoryboard参照を削除するだけで、起動が30–50ms速くなる。

### 2. viewDidAppearでbecomeFirstResponder

キーボードの表示タイミングが重要。`viewDidLoad`では早すぎてビューがまだレイアウトされていない。`viewDidAppear`で`becomeFirstResponder()`を呼ぶことで、ビュー表示とキーボード表示を最小限のラグで連結する。

```swift
override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    textView.becomeFirstResponder()
}
```

### 3. 最小限のビュー階層

SimpleMemoの画面構成は`UITextView` + 送信ボタンだけ。Auto Layoutの制約も最小限に抑え、ビュー階層を浅く保つ。ビュー階層が深いほどレイアウト計算に時間がかかる。

## Outboxアーキテクチャ：オフラインファーストの設計

起動速度の次に重要なのが、**送信の信頼性**だ。地下鉄や電波の弱い場所でもメモを失わない設計として、Outboxアーキテクチャを採用した。

### フロー

```
[ユーザー入力] → [AES-GCM暗号化] → [ローカルキュー保存] → UIクリア（即座）
                                            ↓
                                    [バックグラウンド送信]
                                            ↓
                                    [Cloudflare Workers]
                                            ↓
                                    [Resend API → メール配信]
```

ポイントは、ユーザーが「送る」を押した瞬間にUIをクリアすること。実際の送信はバックグラウンドで行う。ユーザーから見ると「書いて送るだけ」の体験が維持される。

### AES-GCM暗号化

ローカルキューに保存されるメモは、すべてAES-256-GCMで暗号化される。キーはKeychain経由でSecure Enclaveに保管。端末のファイルシステムに平文のメモが残ることはない。

```swift
let key = SymmetricKey(size: .bits256)
let sealedBox = try AES.GCM.seal(plaintext, using: key)
```

仮に端末を紛失しても、メモの内容が漏洩するリスクを最小化している。

### リトライ戦略

送信失敗時は指数バックオフでリトライする。`NWPathMonitor`で回線復帰を検知し、キューに残っているメモを順次送信。

```swift
let monitor = NWPathMonitor()
monitor.pathUpdateHandler = { path in
    if path.status == .satisfied {
        OutboxQueue.shared.flush()
    }
}
```

これにより、機内モードでメモを書いて、着陸後にWi-Fiに繋がった瞬間に自動送信される。

## サーバーサイド：Cloudflare Workers + Resend API

サーバーサイドはCloudflare Workersで構築した。選定理由は以下の通り。

- **コールドスタートなし**：V8 Isolateベースで、従来のサーバーレスのようなコールドスタート問題がない
- **エッジ実行**：世界300+のエッジロケーションで動作し、どこからでも低レイテンシ
- **コスト効率**：個人開発のメモアプリにとって、従量課金は理想的

メール送信にはResend APIを使用。SPF/DKIM/DMARCの設定が容易で、配信到達率が高い。

## SwiftUIを否定しているわけではない

誤解のないように書いておくと、SwiftUIは素晴らしいフレームワークだ。複雑なUIを持つアプリ、プロトタイピング、マルチプラットフォーム展開——これらのユースケースではSwiftUIを選ぶべきだと思う。

ただ、**起動速度が最重要KPI**であるアプリの場合、2026年時点でもUIKitに分がある。特に「アプリを開いた0.3秒後にはもう使える」というレベルを目指すなら、UIKitの直接的なライフサイクル制御は強力だ。

技術選定は常にトレードオフ。SimpleMemoの場合、開発効率よりもユーザーが体感する速度を優先した。

より詳しい技術的な話は[SimpleMemo開発日誌](https://simplememofast.com/devlog/)に書いているので、興味があればぜひ。

---

**SimpleMemo** — 起動0.3秒、Captio式メモアプリ
[https://simplememofast.com/](https://simplememofast.com/)
