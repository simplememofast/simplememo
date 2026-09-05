# GSC (BigQuery export) — measurement notes for the 2026-09-05 audit

Source: `yurika-simplememo.searchconsole.searchdata_url_impression`, 24 days available (2026-08-10 → 2026-09-02). Position = sum_position/impressions + 1. Windows A = 08-10..08-21 (12d), B = 08-22..09-02 (12d).

## Site totals

| Window | Imp | Clicks | CTR | Pos | Mobile imp | JPN imp | USA imp |
|---|---:|---:|---:|---:|---:|---:|---:|
| A 08-10..08-21 | 23,534 | 431 | 1.83% | 8.8 | 11,567 | 17,676 | 2,810 |
| B 08-22..09-02 | 24,255 | 438 | 1.81% | 9.3 | 12,364 | 19,150 | 2,411 |
| 24d total | 47,789 | 869 | 1.8% | ~9 | | | |

- 240 distinct URLs had ≥1 impression (of 261 indexable). **0 variant URLs** (`?`, `.html`, `//`) received impressions — the middleware 301s are fully effective in search.
- EN: 46 URLs, 9,371 imp (19.6% of site), **56 clicks = 0.6% CTR** (JA ≈ 2.1%). By country for /en/: usa 4,537 imp / 16 clicks (0.4%) pos 9.2 · gbr 653/8 · can 418/1 · ind 301/1 · deu 287/3 · aus 285/2 · jpn 183/0.

## Top pages (24d)

| Path | Imp | Clicks | CTR | Pos | impA→impB |
|---|---:|---:|---:|---:|---|
| /blog/line-keep-alternative | 6,514 | 42 | 0.6% | 6.5 | 3,766→2,748 |
| /blog/free-memo-apps-ranking | 6,034 | 36 | 0.6% | 9.2 | 1,796→4,238 (+136%) |
| /en/iphone-shortcuts-email-guide/ | 3,123 | 16 | 0.5% | 7.3 | 1,745→1,378 |
| /blog/best-memo-apps-2026 | 1,711 | 38 | 2.2% | 7.4 | 904→807 |
| /blog/offline-memo-apps | 1,482 | 32 | 2.2% | 6.4 | 760→722 |
| /en/vs/google-keep-vs-apple-notes/ | 1,425 | 4 | 0.3% | 8.1 | 750→675 |
| /vs/dynalist/ | 1,364 | 27 | 2.0% | 9.5 | 813→551 |
| /apple-watch/ | 1,153 | 18 | 1.6% | 7.6 | 511→642 |
| /glossary/aes-gcm/ | 1,084 | 25 | 2.3% | 9.6 | 482→602 |
| /obsidian/ | 1,060 | 35 | 3.3% | 13.6 | 400→660 (+65%, pos 9.6→16.0) |
| /blog/google-keep-shutdown | 925 | 8 | 0.9% | 4.6 | 827→98 (−88%, news spike faded) |
| /methods/second-brain/ | 919 | 20 | 2.2% | 7.7 | 465→454 |
| /blog/meeting-memo-template | 905 | 28 | 3.1% | 9.9 | 425→480 |
| /obsidian/getting-started/ | 850 | 17 | 2.0% | 11.8 | 459→391 |
| / | 796 | 46 | 5.8% | 14.1 | 474→322 |
| /en/blog/ios26-speechanalyzer-live-mic | 716 | 1 | 0.1% | 7.0 | 381→335 |
| /blog/memo-app-encryption-comparison | 647 | 16 | 2.5% | 9.5 | |
| /vs/notion-vs-evernote/ | 592 | 21 | 3.5% | 8.1 | |
| /blog/memo-app-security-comparison | 545 | 9 | 1.7% | 13.5 | |
| /en/blog/best-memo-apps-2026 | 524 | 4 | 0.8% | 8.8 | |
| /blog/obsidian-voice-input | 511 | 48 | **9.4%** | 5.7 | (best-converting page) |
| /vs/capacities/ | 475 | 14 | 2.9% | 8.6 | 435→40 (−91%, pos 8.1→14.3) |
| /en/blog/ios-quick-capture-comparison | 465 | 3 | 0.6% | 7.6 | |
| /en/vs/notion-vs-evernote/ | 332 | 0 | 0.0% | 22.1 | |

## Page-1 zero/near-zero-click queries (CTR gap = title/snippet lever)

| Query | Imp | Clicks | Pos | Landing |
|---|---:|---:|---:|---|
| メモアプリ 無料 シンプル | 2,228 | 13 | 8.2 | /blog/free-memo-apps-ranking |
| メモアプリ 無料 | 1,185 | 4 | 9.3 | /blog/free-memo-apps-ranking |
| dynalist | 826 | 7 | 9.6 | /vs/dynalist/ |
| line keepメモ 終了 | 608 | 2 | 6.9 | /blog/line-keep-alternative |
| メモアプリ 無料 おすすめ | 575 | 4 | 8.7 | /blog/free-memo-apps-ranking |
| google keepサービス終了 | 531 | 3 | 4.8 | /blog/google-keep-shutdown |
| capacities | 381 | 2 | 8.4 | /vs/capacities/ |
| obsidian インストール | 159 | 0 | 9.7 | /obsidian/getting-started/ |
| obsidian ダウンロード | 131 | 0 | 8.8 | /obsidian/getting-started/ |
| secondbrain | 121 | 0 | 6.2 | /methods/second-brain/ |
| line キープメモ サービス終了 | 101 | 0 | 5.9 | /blog/line-keep-alternative |
| google keep vs apple notes | 183 | 2 | 7.8 | /en/vs/google-keep-vs-apple-notes/ |
| apple notes vs google keep | 85 | 0 | 8.6 | /en/vs/google-keep-vs-apple-notes/ |
| アップルウォッチ 音声入力 + apple watch 音声入力 | 161 | 0 | 7.2–7.7 | /apple-watch/ |
| pkm | 93 | 0 | 9.7 | /glossary/pkm/ |
| ラインのキープメモはどこにありますか | 57 | 0 | 10.3 | /blog/line-keep-alternative |

Winners for contrast: obsidian 音声入力 118 imp / 15 clicks / 12.7% pos 2.8; シンプルメモ 105/9/8.6% pos 2.8; obsidian連携シンプルメモ 67/11/16.4%.

## Cannibalization (query split ≥20% across ≥2 URLs)

- メモアプリ おすすめ (532): best-memo-apps-2026 398 @9.9 vs free-memo-apps-ranking 133 @12.2.
- 暗号化 比較 (104): memo-app-security-comparison 73 @22.8 vs memo-app-encryption-comparison 31 @32.1 — both weak.
- メモアプリ 比較 / メモツール 比較 (99): /comparison/ (19+18 @33–40), how-to-choose-memo-app 17 @24, free-memo-apps-ranking 15, best-memo-apps-2026 12 — 4-way, all off page 1. /comparison/ itself: 124 imp, 0 clicks, pos 18.5.
- logseq / logseq obsidian vergleich|unterschiede (259): /vs/logseq/ vs /obsidian/compare/logseq/ (German queries, pos 30–44; low value).
- notion vs evernote family (331): EN /en/vs/notion-vs-evernote/ takes USA impressions at pos 20–28 with 0 clicks; JA /vs/notion-vs-evernote/ takes JPN at 4–11. Not an hreflang mis-serve (countries are separated) — the EN page is simply weak.
- obsidian連携シンプルメモ (brand, 67): 7 URLs incl. /guides/ 24 @6.4 — fine.

## Declines / rises between windows (imp ≥60 in A, ±40%)

| Path | impA | impB | Δ | posA→posB | Read |
|---|---:|---:|---:|---|---|
| /blog/free-memo-apps-ranking | 1,796 | 4,238 | +136% | 8.3→9.5 | demand surge, CTR still 0.6% |
| /blog/google-keep-shutdown | 827 | 98 | −88% | 4.8→3.5 | news-cycle query faded, rank fine |
| /vs/capacities/ | 435 | 40 | −91% | 8.1→14.3 | real decline; retitle experiment title-2026-08-12-015 is running on it |
| /obsidian/ | 400 | 660 | +65% | 9.6→16.0 | broader, weaker queries ("obsidian" generic @65) |
| /blog/iphone-memo-katsuyou | 112 | 300 | +168% | 7.2→8.2 | |
| /obsidian/compare/logseq/ | 155 | 14 | −91% | 17.5→12.1 | |
| /en/blog/email-to-obsidian | 261 | 139 | −47% | | |
| /obsidian/shortcuts-not-working/ | 81 | 30 | −63% | | |
| /guides/ | 62 | 15 | −76% | 8.2→13.9 | |

## New-since-July pages (24d)

/obsidian/getting-started/ 850 · /obsidian/what-is-vault/ 403 · /obsidian/pricing/ 393 (3.6%) · /obsidian/plugins/dataview/ 187 · /obsidian/compare/logseq/ 169 · /comparison/ 124 (0 clicks) · /obsidian/shortcuts-not-working/ 111 · /obsidian/sync/ 96 · /obsidian/plugins/ 76 (11.8%) · /obsidian/daily-note/ 43 · /privacy-architecture/ 12 · /download/ 6 · /roadmap/ 1 · /autopilot/ 1 · /data/voice-shift/ 1.

## Indexable pages with ZERO impressions in 24 days (21 of 261)

`/blog/benchmark-methodology` (the speed-claim canon page!) · `/blog/business-memo-apps-2026`* · `/blog/freelance-memo-management`* · `/blog/instant-capture-workflow`* · `/contact` · `/devlog/day1`* · `/en/roadmap/` · `/glossary/digital-detox/` · `/glossary/markdown/` · `/glossary/pomodoro/` · `/guides/draft-autosave/`* · `/guides/outlook/` · `/methods/inbox-zero/` · `/obsidian/apple-watch-not-working/` (new) · `/use-cases/ideas/` · `/use-cases/parents/` · `/use-cases/writers/` · `/vs/captioo/`* · `/vs/memo-post/` · `/vs/stock/` · `/vs/todoist/`*

\* = already on the GSC "crawled – currently not indexed" list (gsc-crawled-not-indexed-2026-09-02.md). 0 URLs in BQ that are missing from the sitemap.
