---
tags: iOS, Swift, CryptoKit, セキュリティ, AES-GCM
---

# AES-GCM暗号化をiOSアプリに実装する — CryptoKitの実践ガイド

## はじめに

iOSアプリでユーザーデータを端末内に保存する場合、暗号化は必須です。数ある暗号方式の中で、**AES-GCM（Galois/Counter Mode）** が現在のベストプラクティスとされる理由は3つあります。

1. **認証付き暗号（AEAD）** — 暗号化と改ざん検知を同時に行う。復号時にデータの完全性が保証される
2. **NISTが推奨** — SP 800-38Dで標準化されており、TLS 1.3でも採用されている
3. **ハードウェアアクセラレーション** — Apple Silicon（A-series / M-series）にAES命令セットが搭載されており、ソフトウェア実装に比べて桁違いに高速

iOS 13以降で利用できるApple純正フレームワーク **CryptoKit** を使えば、数行のコードでAES-GCMを実装できます。

## CryptoKitの基本

```swift
import CryptoKit
```

まず対称鍵を生成します。AES-GCMでは128bit、192bit、256bitの鍵長が選択可能です。特別な理由がなければ256bitを使います。

```swift
// 256bit鍵の生成
let key = SymmetricKey(size: .bits256)
```

既存の鍵データから復元する場合は以下のとおりです。

```swift
let keyData: Data = ... // Keychainから取得した鍵データ
let key = SymmetricKey(data: keyData)
```

## 暗号化・復号の実装

AES-GCMの暗号化と復号は、CryptoKitの`AES.GCM`を使って実装します。

```swift
import CryptoKit

func encrypt(_ plaintext: String, using key: SymmetricKey) throws -> Data {
    let data = Data(plaintext.utf8)
    let sealedBox = try AES.GCM.seal(data, using: key)
    return sealedBox.combined!
}

func decrypt(_ ciphertext: Data, using key: SymmetricKey) throws -> String {
    let sealedBox = try AES.GCM.SealedBox(combined: ciphertext)
    let decryptedData = try AES.GCM.open(sealedBox, using: key)
    return String(data: decryptedData, encoding: .utf8)!
}
```

`SealedBox.combined` は **nonce（12bytes）+ 暗号文 + 認証タグ（16bytes）** を1つの`Data`にまとめたものです。保存や転送にはこの形式が便利です。

nonceはデフォルトでランダム生成されますが、明示的に指定することも可能です。

```swift
let nonce = try AES.GCM.Nonce(data: customNonceData)
let sealedBox = try AES.GCM.seal(data, using: key, nonce: nonce)
```

**注意:** 同一鍵でnonceを再利用すると安全性が完全に崩壊します。自前でnonceを管理する場合は十分に注意してください。通常はデフォルトのランダム生成で問題ありません。

## 鍵管理のベストプラクティス

暗号化の実装よりも、鍵の管理のほうが遥かに難しい問題です。

### Keychainへの保存

鍵はUserDefaultsやファイルに平文で保存してはいけません。Keychainを使います。

```swift
func saveKeyToKeychain(_ key: SymmetricKey, account: String) throws {
    let keyData = key.withUnsafeBytes { Data($0) }
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: account,
        kSecValueData as String: keyData,
        kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    ]
    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else {
        throw KeychainError.saveFailed(status)
    }
}
```

### Secure Enclaveの活用

iPhone SE（第2世代）以降のデバイスではSecure Enclaveが利用可能です。Secure Enclave内で生成された鍵はデバイスの外に取り出せないため、最も高い安全性が得られます。ただしSecure Enclaveが直接サポートするのはP-256の楕円曲線暗号であり、AES鍵をラップする形で利用します。

### 鍵のローテーション

長期運用するアプリでは、鍵のローテーションも検討してください。古い鍵で復号してから新しい鍵で再暗号化するマイグレーション処理を用意しておくと安心です。

## 実践例：オフラインキューの暗号化

筆者が開発している [SimpleMemo](https://simplememofast.com/) では、AES-GCMを使ってオフライン時のメモキューを端末内で暗号化しています。

アーキテクチャは **Outboxパターン** を採用しています。

1. ユーザーがメモを保存する
2. 送信前にAES-GCMで暗号化してローカルキューに格納する
3. ネットワーク復帰時に復号してサーバーへ送信する
4. 送信成功後にローカルキューから削除する

このパターンの利点は、端末のストレージ上にはつねに暗号化されたデータしか存在しない点です。万一デバイスを紛失しても、Keychainの鍵がなければデータは読めません。

アーキテクチャの詳細は [SimpleMemoの開発ログ](https://simplememofast.com/devlog/) に記載しています。

## パフォーマンス

AES-GCMはApple Siliconのハードウェアアクセラレーションにより、非常に高速に動作します。

短いテキスト（数百バイト）の暗号化であれば、iPhone 12以降のデバイスで **約0.1ms以下** で完了します。メモアプリのようなユースケースでは、暗号化によるUXへの影響は実質ゼロです。

```swift
// 簡易ベンチマーク
let key = SymmetricKey(size: .bits256)
let text = String(repeating: "あ", count: 100)

let start = CFAbsoluteTimeGetCurrent()
for _ in 0..<1000 {
    let encrypted = try encrypt(text, using: key)
    _ = try decrypt(encrypted, using: key)
}
let elapsed = (CFAbsoluteTimeGetCurrent() - start) / 1000
print("平均: \(elapsed * 1000)ms") // ~0.05ms on iPhone 15 Pro
```

大きなファイル（数MB以上）を扱う場合は、ストリーミング処理を検討してください。

## まとめ

- **AES-GCM + CryptoKit** は、2026年現在のiOSアプリにおける暗号化のデファクトスタンダード
- CryptoKitのAPIはシンプルで、暗号の専門知識がなくても安全に使える
- 鍵管理にはKeychainを使い、平文での保存は絶対に避ける
- Apple Siliconのハードウェアアクセラレーションにより、パフォーマンスの心配は不要

実際にAES-GCMを活用したアプリの例として、[SimpleMemo](https://simplememofast.com/) の実装も参考にしてください。
