# Captio式シンプルメモ (Simple Memo - Captio-style) Landing Page

> **⏸ SNS自動投稿は運用停止中（2026-08-11〜）**
> X日英・TikTokの scheduled 自動投稿（サイト管理画面 /admin/api 経由）はオーナー判断で停止。
> - **X日本語**: Claude定期タスク（Cowork）でのバッチ運用に一本化したため（二重運用の防止）
> - **X英語**: アカウントバン1回目を受けたため（回復とライブラリ鮮度化が先）
> - **TikTok**: 画像系コンテンツの品質が基準未達のため（privacy_level問題も未解決）
>
> **C2（scheduled失敗）の原因は判明済み（2026-08-18）**: 投稿ロジックではなく認証。
> `/admin/*` が Cloudflare Access の背後にあるのに、ワークフローは Basic 認証しか
> 送っていないため、投稿本文を出す前に302でログイン画面へ飛ばされている。
> 再開にはAccessのサービストークンが要る（詳細は `x-post-scheduled.yml` 冒頭）。
>
> 詳細な理由・再開条件は各workflowファイル冒頭に記載:
> `.github/workflows/x-post-scheduled.yml` / `x-post-en-scheduled.yml` / `auto-post-tiktok.yml`。
> `workflow_dispatch` による手動実行（dry_run含む）は引き続き可能。

The website for the Simple Memo iOS app (simplememofast.com): static HTML and CSS served by Cloudflare Pages, with Pages Functions (`functions/`) for redirects and for blocking internal paths.


## Project Structure

Cloudflare Pages serves the repository as it is, so every tracked file is a URL unless
`functions/_middleware.js` blocks it.

```
simplememo/
├── index.html            # Japanese home page
├── en/                   # English pages (ar/ es/ id/ ko/ pt-BR/ tr/ zh/ zh-Hant/ hold localized home pages)
├── blog/ guides/ vs/ …   # content sections
├── privacy.html          # Privacy policy (en/privacy.html in English)
├── terms.html            # Terms of service (en/terms.html in English)
├── contact.html          # Contact form
├── assets/               # CSS (assets/css/style.css, style.min.css), images, fonts, video, favicons
├── js/                   # small scripts, e.g. js/analytics.js (deferred Google Analytics 4 loader)
├── functions/            # Pages Functions; _middleware.js handles redirects and returns 404 for internal paths
├── _headers, _redirects  # Cloudflare Pages configuration
├── scripts/ tools/ docs/ growth/ fixtures/   # repository-only working files (not served)
├── CLAUDE.md             # working rules (not served)
└── README.md             # this file (served at /README.md)
```

## Design Features

- **Dark Theme**: midnight-navy surfaces with electric-blue, cyan and violet accents
- **Glassmorphism**: semi-transparent cards with backdrop blur effects
- **Glow Effects**: soft blue glow on buttons, icons, and text
- **Mobile-First**: responsive layout designed for iPhone Safari
- **No front-end framework**: plain HTML and CSS, with small scripts in `js/`

## Color Palette

The palette is defined in the `:root` block of `assets/css/style.css` (for example `--bg: #070b14`,
`--text: #f2f6ff`, `--accent: #4da3ff`). Edit it there; this file does not keep a copy.


## Deployment

### How this site actually deploys

**Cloudflare Pages, auto-deployed on every push to `main`.** There is no manual
step and no `wrangler deploy` in the loop — the `functions/` directory in this
repo is Pages Functions, not a Worker.

```
work on a claude/* branch → open a PR → SEO Validation passes
→ auto-merge merges it → Cloudflare Pages deploys main
```

Merging to `main` **is** the production deploy, which is why
`.github/workflows/auto-merge.yml` waits for SEO Validation to succeed and
merges only the validated SHA. To hold a change back, mark the PR as draft.

See `CLAUDE.md` for the full workflow and the auto-merge design notes.

### One-time Pages setup (already done — for rebuilding from scratch)

1. Push this repository to GitHub
2. In Cloudflare Dashboard, go to Pages
3. Click "Connect to Git" and select your repository
4. Set build settings:
   - **Framework preset**: None
   - **Build command**: (leave empty)
   - **Build output directory**: `/`
5. Deploy
6. Add the custom domain (`simplememofast.com`) under the project's Custom
   domains tab and point DNS at it

## Pages

### `/` - Home page
The Japanese home page (`index.html`); the English home page is `/en/`.

### `/privacy` - Privacy Policy
Sections: information collected, purposes of use, differences by plan, handling of memo content, the optional
email reminder, provision to third parties, outsourcing (email delivery and others), security measures, retention
periods, revisions, contact, and technical notes on encryption (English: `/en/privacy`).

### `/terms` - Terms of Service
Sections: the service, features by plan, sending limits and Premium, safety sending limits, payment and
auto-renewing subscriptions, prohibited acts, sending results and disclaimers, intellectual property, changes to or
suspension of the service, changes to the terms, governing law and jurisdiction, and contact.

### `/contact` - Contact
Contact form (`contact.html`). The support address is `support@simplememofast.com`. (`/support` is not a route; it returns 404.)

## Assets

- Favicons: `favicon.ico` at the root and `assets/favicon/` (including `apple-touch-icon.png` and `site.webmanifest`)
- Images, fonts and video: `assets/img/`, `assets/fonts/`, `assets/video/`

## Browser Support

Some CI checks render pages in a real browser engine (see the workflows under `.github/workflows/`).
No list of supported browsers or versions is maintained or tested.

## Accessibility

- Semantic HTML structure
- Supports `prefers-reduced-motion`
- Text colors are chosen for contrast on the dark background (see the comments in `assets/css/style.css`)
- WCAG conformance has not been audited. Do not describe the site as WCAG compliant

## Performance

- No front-end framework
- On the production host, Google Analytics 4 loads after the page has loaded (`js/analytics.js` or an inline loader)
- PageSpeed results are collected by `.github/workflows/pagespeed-audit.yml`

## License

© 2026 Simple Memo. All rights reserved.
