# /siri/ ヒーローバナー 画像生成依頼文（gpt-image2用）

- 用途: https://simplememofast.com/siri/ のヒーロー画像 兼 OGP画像（SNSシェア時のサムネイル）兼 プレスリリース素材
- 保存先: `assets/img/og/siri.png`（このパスに置けばページ側は有効化するだけ）
- サイズ: **1200×630px**（OGP標準）。可能なら2400×1260で生成して縮小
- 重要: **画像内に文字を入れない**（テキストはHTML/各媒体側で載せる。日本語フォント崩れ・改版時の作り直しを避けるため）

## そのまま貼れるプロンプト

```
A minimal, premium dark-mode hero illustration for a tech product landing page.

Scene: A person walking outdoors at dusk, seen from the side or behind at
waist-up, wearing white wireless earbuds (generic AirPods-like, no logos).
Their iPhone stays inside their pocket — subtly visible as a faint glowing
outline through the fabric, clearly NOT being held or touched. Hands are
relaxed or in pockets.

From the earbuds, an elegant glowing sound wave / voice waveform flows
upward and transforms mid-air into a small paper-plane-like streak of light
that splits into two soft trails: one landing on a subtle envelope icon,
one landing on a subtle gem-like purple crystal icon (both abstract, tiny,
in the upper right area).

Style: dark navy background (#070b14) with deep blue gradients, glowing
cyan (#22d3ee) and blue-violet (#5856D6) accents, thin luminous lines,
soft particle glow, generous negative space in the LEFT HALF of the image
(headline text will be overlaid there later). Apple-keynote-like premium
minimalism, flat-ish vector illustration with soft glow, no photorealism,
no clutter.

Strictly NO text, NO letters, NO numbers, NO logos, NO Apple logo, NO Siri
orb replica (use an abstract waveform instead), no watermark.

Composition: 1200x630 landscape. Main subject on the right third, flowing
light arc across the middle, left half kept dark and clean for overlay text.
```

## バリエーション指示（同時に2〜3案出させる場合）

1. 案A: 上記そのまま（歩行シーン）
2. 案B: `Scene:` を差し替え —
   `A cozy kitchen at night, a person cooking with both hands busy (kneading dough / stirring), earbuds glowing softly, phone visible on the far counter — untouched.`
3. 案C: 人物なし・完全アブストラクト —
   `No person. A large elegant voice waveform emerging from a single white earbud floating left-of-center, morphing into light trails that reach an envelope glyph and a crystal glyph. Even more negative space.`

## 選定基準（迷ったら）

- 「**iPhoneに触れていない**」が一目で伝わるか（この機能の核心）
- 左半分にコピーを載せる余白があるか
- 縮小（Xのタイムライン幅）でも波形の流れが判別できるか
- Siriオーブ/Appleロゴの模倣になっていないか（商標リスク回避）

## 納品後の作業（こちらでやります）

1. `assets/img/og/siri.png` に配置（1200×630、圧縮）
2. `/siri/index.html` 内のコメントアウト済み `<figure>`（TODO(hero-banner)マーカー）を有効化
3. 必要ならプレス用に文字入り版の組版（HTML側で重ねてスクショ）

## ✅ 納品済み（2026-08-05）

案A（歩行シーン）で生成・採用。1731×909 → 1200×630 リサイズ、256色最適化で 434KB。
`assets/img/og/siri.png` 配置・figure有効化済み。ページヒーロー／OGP／プレス素材を本画像1枚で兼用する。

## ✅ 差し替え済み — AirPods主語版（2026-08-05）

訴求の主語を Siri から **AirPods** に変更。文字入りバナーも
「SiriでObsidianへメモ／アプリを開かず、声で残す。」→
**「AirPodsからObsidianへメモ／スマホを触らず、声で残す」** に作り直した。

入稿は 1691×930（アスペクト1.818）。OGP標準の 1.905 に合わせるため、
**上26px・下16pxの黒余白だけを切って 1691×888 にしてから 1200×630 へ縮小**した
（歪ませない・内容を削らない）。内容は y=52〜916 に収まっており、下端に見えた
明部はテキストではなくフルブリードのジーンズ地なので切って問題ない。

### 生成物

| ファイル | 用途 | サイズ |
|---|---|---|
| `assets/img/og/siri.png` (1200×630, 256色) | OGPスロット／プレス素材／webp非対応フォールバック | 342KB |
| `assets/img/siri-banner-ja.webp` (1200×630) | 実ユーザー向け1x | 74KB |
| `assets/img/siri-banner-ja@2x.webp` (1691×888) | 実ユーザー向け2x | 124KB |
| `assets/img/siri-banner-ja.jpg` (1200×630) | トップページの非webpフォールバック | 113KB |

`/siri/` ヒーローとトップページのバナーはどちらも `<picture>` にしてあり、
実ユーザーには webp が届く。PNG は OGP クローラ用に URL を固定したまま残す
（ヒーローは LCP なので 342KB→74KB の差が効く）。

`og/siri.png` の参照には `?v=20260805c` を付けてある（`/assets/*` は7日
immutable キャッシュのため、中身を変えたらバンプが要る）。
`siri-banner-ja.*` は新規ファイルなのでバージョン不要。
