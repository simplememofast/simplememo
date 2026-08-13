#!/usr/bin/env node
/**
 * OG card generator for the top pages and the AI auto-tagging LP.
 *
 * These four cards carry release-sensitive copy (feature status, branding,
 * app icon), so they need regenerating whenever that copy changes — the
 * generic generate-og-images.js only renders title/subtitle cards and would
 * drop the mic/waveform/tag artwork.
 *
 * Usage:
 *   npm install --no-save playwright
 *   node scripts/generate-og-feature.js            # all four
 *   node scripts/generate-og-feature.js ai-tags    # one slug
 *
 * Chromium: honours CHROMIUM_PATH, otherwise Playwright's own download.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'assets', 'img', 'og');

const ICON_DATA_URI = 'data:image/png;base64,' +
  fs.readFileSync(path.join(ROOT_DIR, 'assets', 'img', 'app-icon-256.png')).toString('base64');

// Tag chips shown in the artwork. `cyan` flips a chip to the accent colour.
//
// Note: the Japanese /ai-tags/ card is NOT generated here — it is cropped from
// the designer's banner by scripts/build-ai-tags-banner.py. Only the cards
// without dedicated artwork are rendered below.
const CARDS = {
  'ai-tags-en': {
    file: 'ai-tags-en.png',
    lang: 'en',
    brand: 'Simple Memo',
    badge: 'AI auto-tagging — available now',
    title: 'Just <em class="c">speak</em>.<br><em class="v">AI</em> files it.',
    sub: 'Speak, and the tagging happens <b>automatically</b>.',
    tags: [['#obsidian'], ['#groceries', 'cyan'], ['#idea'], ['#ai', 'cyan'], ['#sync']],
    note: 'AI tagging runs entirely on your iPhone.<br>Your memos are never sent to an external server for it.',
  },
  'siri-en': {
    file: 'siri-en.png',
    lang: 'en',
    brand: 'Simple Memo - for Obsidian',
    badge: 'AirPods \u00d7 Siri \u2014 hands-free',
    title: 'From your <em class="c">AirPods</em>,<br>straight to <em class="v">Obsidian</em>.',
    titleSize: '54px', // "straight to Obsidian." overflows the 640px column at 60px
    sub: 'Say it \u2014 your phone <b>stays in your pocket</b>.',
    tags: [['#airpods', 'cyan'], ['#siri'], ['#obsidian'], ['#handsfree', 'cyan']],
    note: 'No app to open, no screen to look at.<br>Queued offline and sent when you are back in range.',
    // Also used as the /en/siri/ hero (LCP), so emit the light banner pair
    // next to the JA one. The 500KB OG png is fine for scrapers, not for a hero.
    banner: 'siri-banner-en',
  },
  index: {
    file: 'index.png',
    lang: 'ja',
    brand: 'Obsidian連携シンプルメモ',
    badge: 'NEW ― AIタグ自動追加',
    title: '話すだけで、<br>メールと<em class="v">Obsidian</em>へ。',
    titleSize: '56px', // "メールとObsidianへ。" overflows the 640px column at the default size
    sub: 'AIがタイトル・タグ・種別まで<b>自動</b>で整える。',
    tags: [['#Obsidian'], ['#AI', 'cyan'], ['#アイデア'], ['#連携', 'cyan']],
    note: 'Apple Watch対応 ・ 最速の音声自動入力 ・ 起動約1秒',
  },
  'index-en': {
    file: 'index-en.png',
    lang: 'en',
    brand: 'Simple Memo - for Obsidian',
    badge: 'NEW — AI auto-tagging',
    title: 'Just speak.<br>To your email — and <em class="v">Obsidian</em>.',
    sub: 'AI adds the title, tags and type <b>for you</b>.',
    tags: [['#obsidian'], ['#ai', 'cyan'], ['#idea'], ['#sync', 'cyan']],
    note: 'Apple Watch ・ fastest voice auto-input ・ ~1s launch',
  },
};

function renderTags(tags) {
  return tags
    .map(([label, mod]) => `<span class="tag${mod ? ' tag--' + mod : ''}">${label}</span>`)
    .join('');
}

function buildHtml(card) {
  // The EN cards use a system stack; JA needs Noto Sans JP for kana/kanji.
  const fontImport =
    card.lang === 'ja'
      ? "@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&display=swap');"
      : '';
  const fontStack =
    card.lang === 'ja'
      ? "'Noto Sans JP', -apple-system, sans-serif"
      : "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

  return `<!DOCTYPE html>
<html lang="${card.lang}">
<head>
<meta charset="utf-8">
<style>
${fontImport}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: 1200px; height: 630px; overflow: hidden; position: relative;
  font-family: ${fontStack};
  color: #fff;
  background:
    radial-gradient(52% 62% at 14% 20%, rgba(124,77,255,.28), transparent 68%),
    radial-gradient(48% 54% at 82% 44%, rgba(34,211,238,.16), transparent 70%),
    linear-gradient(135deg, #05070f 0%, #0a1024 45%, #05070f 100%);
}
/* faint starfield so the flat gradient does not band on dark screens */
body::before {
  content: ''; position: absolute; inset: 0; opacity: .5;
  background-image:
    radial-gradient(1.5px 1.5px at 12% 72%, rgba(255,255,255,.55), transparent),
    radial-gradient(1.5px 1.5px at 26% 22%, rgba(255,255,255,.4), transparent),
    radial-gradient(1.5px 1.5px at 68% 78%, rgba(140,200,255,.5), transparent),
    radial-gradient(1.5px 1.5px at 88% 16%, rgba(255,255,255,.45), transparent),
    radial-gradient(1.5px 1.5px at 54% 8%, rgba(180,160,255,.5), transparent),
    radial-gradient(1.5px 1.5px at 94% 62%, rgba(255,255,255,.35), transparent);
}
.wrap { position: relative; height: 100%; display: flex; align-items: center; padding: 54px 64px; }
.left { width: 640px; flex: none; }
.brand { display: flex; align-items: center; gap: 16px; margin-bottom: 26px; }
/* The app icon is itself dark-on-dark, so it needs a light plate to read
   against the card gradient. Keeps working if the icon art changes again. */
.brand img { width: 56px; height: 56px; border-radius: 13px; display: block; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.18); box-shadow: 0 2px 14px rgba(0,0,0,.4); }
.brand span { font-size: 28px; font-weight: 700; letter-spacing: .01em; }
.badge {
  display: inline-block; font-size: 21px; font-weight: 700; color: #ece6ff;
  background: rgba(124,77,255,.22); border: 2px solid rgba(139,124,255,.62);
  border-radius: 999px; padding: 10px 26px; margin-bottom: 28px;
}
.title { font-size: ${card.titleSize || (card.lang === 'ja' ? '68px' : '60px')}; font-weight: 900; line-height: 1.22; letter-spacing: .005em; margin-bottom: 22px; }
.title em { font-style: normal; }
.title .c { background: linear-gradient(135deg,#22d3ee,#4da3ff 92%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.title .v { background: linear-gradient(135deg,#8b7cff,#b388ff 92%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.sub { font-size: 27px; font-weight: 400; color: rgba(226,235,255,.9); line-height: 1.5; }
.sub b { font-weight: 900; color: #b9a8ff; }
.right { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 34px; }
.flow { display: flex; align-items: center; gap: 18px; }
.mic {
  width: 96px; height: 96px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at 30% 30%, rgba(34,211,238,.45), rgba(77,163,255,.16));
  border: 2px solid rgba(77,195,255,.6); box-shadow: 0 0 46px rgba(56,140,255,.45);
}
.mic svg { width: 44px; height: 44px; fill: #e6f7ff; }
.wave { display: flex; align-items: center; gap: 5px; height: 68px; }
.wave i { display: block; width: 5px; border-radius: 3px; background: linear-gradient(180deg,#22d3ee,#8b7cff); }
.tags { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; max-width: 400px; }
.tag {
  font-size: 25px; font-weight: 700; color: #efe9ff; padding: 12px 26px; border-radius: 999px;
  background: rgba(139,124,255,.16); border: 2px solid rgba(139,124,255,.5);
  box-shadow: 0 0 26px rgba(124,108,255,.2);
}
.tag--cyan { color: #ddf6ff; background: rgba(34,211,238,.12); border-color: rgba(34,211,238,.5); }
.domain {
  position: absolute; left: 64px; bottom: 44px; display: flex; align-items: center; gap: 12px;
  font-size: 25px; font-weight: 700; color: #d8e6ff;
}
.domain i { width: 12px; height: 12px; border-radius: 50%; background: #22d3ee; display: block; }
.note {
  position: absolute; right: 64px; bottom: 44px; text-align: right;
  font-size: 19px; line-height: 1.6; color: rgba(196,212,240,.78);
}
</style>
</head>
<body>
  <div class="wrap">
    <div class="left">
      <div class="brand"><img src="${ICON_DATA_URI}" alt=""><span>${card.brand}</span></div>
      <div class="badge">${card.badge}</div>
      <div class="title">${card.title}</div>
      <div class="sub">${card.sub}</div>
    </div>
    <div class="right">
      <div class="flow">
        <div class="mic"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg></div>
        <div class="wave">${[38, 66, 92, 54, 100, 72, 44, 84, 30]
          .map((h) => `<i style="height:${h}%"></i>`)
          .join('')}</div>
      </div>
      <div class="tags">${renderTags(card.tags)}</div>
    </div>
  </div>
  <div class="domain"><i></i>simplememofast.com</div>
  <div class="note">${card.note}</div>
</body>
</html>`;
}

async function main() {
  const only = process.argv[2];
  const slugs = only ? [only] : Object.keys(CARDS);
  for (const slug of slugs) {
    if (!CARDS[slug]) {
      console.error(`Unknown card: ${slug} (known: ${Object.keys(CARDS).join(', ')})`);
      process.exit(1);
    }
  }

  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
  );
  try {
    for (const slug of slugs) {
      const card = CARDS[slug];
      const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
      await page.setContent(buildHtml(card), { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      const out = path.join(OUTPUT_DIR, card.file);
      await page.screenshot({ path: out });
      console.log(`  ${card.file}`);

      // Cards flagged with `banner` double as a page hero, where the OG png is
      // far too heavy. Emit the same artwork as webp + jpg beside the JA pair.
      if (card.banner) {
        const png = fs.readFileSync(out).toString('base64');
        for (const [ext, mime, quality] of [['webp', 'image/webp', 0.9], ['jpg', 'image/jpeg', 0.9]]) {
          const dataUri = await page.evaluate(
            async ([b64, m, q]) => {
              const img = new Image();
              img.src = 'data:image/png;base64,' + b64;
              await img.decode();
              const c = document.createElement('canvas');
              c.width = img.width; c.height = img.height;
              c.getContext('2d').drawImage(img, 0, 0);
              return c.toDataURL(m, q);
            },
            [png, mime, quality]
          );
          const buf = Buffer.from(dataUri.split(',')[1], 'base64');
          const bannerPath = path.join(ROOT_DIR, 'assets', 'img', `${card.banner}.${ext}`);
          fs.writeFileSync(bannerPath, buf);
          console.log(`  ${card.banner}.${ext} (${Math.round(buf.length / 1024)}KB)`);
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main();
