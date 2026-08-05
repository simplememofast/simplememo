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
