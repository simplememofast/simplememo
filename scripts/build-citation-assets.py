#!/usr/bin/env python3
"""Build the bilingual editorial kit, local Markdown tool, and dated research assets.

Run normally to write; --check verifies committed outputs without changing files.
The historical research input is separate from the live operations ledger.
"""
import argparse
import csv
import hashlib
import io
import json
import tempfile
from collections import Counter
from datetime import date
from html import escape as e
from pathlib import Path
from normalize_i18n_head import build_block, replace_i18n_lines

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://simplememofast.com"
DATA_PATH = "data/autopilot-research-2026-09-02.json"
data = json.loads((ROOT / DATA_PATH).read_text())
constants = json.loads((ROOT / "data/site-constants.json").read_text())
rows = data["runs"]
attempts = [r for r in rows if r["attempted"]]
shipped = [r for r in attempts if r["outcome"] == "shipped"]
intervened = [r for r in attempts if r["intervention_kinds"]]
days = (date.fromisoformat(data["period_end"]) - date.fromisoformat(data["period_start"])).days + 1
outcomes = Counter(r["outcome"] for r in attempts)
kinds = Counter(k for r in attempts for k in set(r["intervention_kinds"]))
rate = f"{100 * len(shipped) / len(attempts):.1f}"
human_rate = f"{100 * len(intervened) / len(attempts):.1f}"
source = data["source_url"]
outputs = {}


def asset(path):
    return "/" + path + "?v=" + hashlib.sha256((ROOT / path).read_bytes()).hexdigest()[:10]


def put(path, text):
    outputs[path] = text.rstrip() + "\n"


def table(headers, records):
    return '<div class="table-scroll"><table><thead><tr>' + "".join(f"<th scope=\"col\">{e(str(h))}</th>" for h in headers) + "</tr></thead><tbody>" + "".join("<tr>" + "".join(f"<td>{e(str(c))}</td>" for c in r) + "</tr>" for r in records) + "</tbody></table></div>"


def links(items):
    return '<div class="actions">' + "".join(f'<a class="button secondary" href="{e(url)}">{e(label)}</a>' for url, label in items) + "</div>"


def page(path, title, description, body, ja, en, lang, tool=False):
    english = lang == "en"
    name = constants["appNameEn"] if english else constants["appNameJa"]
    prefix = "/en" if english else ""
    nav = [(prefix + "/obsidian/", "Obsidian"), (prefix + "/press/", "Media kit" if english else "紹介用資料"), (prefix + "/resources/obsidian-inbox/", "Markdown tool" if english else "Markdownツール")]
    schema = {"@context": "https://schema.org", "@type": "WebPage", "@id": BASE + path + "#webpage", "name": title, "url": BASE + path, "inLanguage": lang, "description": description, "isPartOf": {"@id": BASE + "/#website"}, "about": {"@id": BASE + "/#app"}}
    seed = """<!-- locale-seed: declare EN once so dual-DOM pages resolve to English (scripts/inject_locale_seed.py) -->
<script>try{var k='simple-memo-lang';if(!localStorage.getItem(k))localStorage.setItem(k,'en')}catch(e){}</script>""" if english else ""
    scripts = f'<script src="{asset("js/obsidian-inbox-tool.js")}" defer></script>' if tool else f'<script src="{asset("js/analytics.js")}" defer></script>'
    og = "/assets/img/og/autopilot.png" if "autopilot" in path else "/assets/img/og/obsidian.png"
    copyright_line = constants["copyrightLine"]
    html = f"""<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="index,follow,max-image-preview:large">
<title>{e(title)}</title>
<meta name="description" content="{e(description)}">
<link rel="canonical" href="{BASE}{path}">
<link rel="alternate" hreflang="ja" href="{BASE}{ja}">
<link rel="alternate" hreflang="en" href="{BASE}{en}">
<link rel="alternate" hreflang="x-default" href="{BASE}{ja}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="{BASE}{path}">
<meta property="og:site_name" content="{e(name)}">
<meta property="og:locale" content="{'en_US' if english else 'ja_JP'}">
<meta property="og:image" content="{BASE}{og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@simplememofast">
<meta name="twitter:image" content="{BASE}{og}">
<link rel="icon" href="/favicon.ico">
<link rel="stylesheet" href="{asset('assets/css/editorial-resources.css')}">
<script type="application/ld+json">{json.dumps(schema, ensure_ascii=False)}</script>
{seed}
{scripts}
</head>
<body>
<a class="skip-link" href="#main">{'Skip to content' if english else '本文へ移動'}</a>
<header class="resource-nav"><div>
<a class="resource-brand" href="{prefix}/">{e(name)}</a>
{''.join(f'<a href="{url}">{label}</a>' for url, label in nav)}
<nav class="languages" aria-label="{'Language' if english else '言語'}"><a href="{ja}" lang="ja" {'aria-current="page"' if not english else ''}>JA</a><a href="{en}" lang="en" {'aria-current="page"' if english else ''}>EN</a></nav>
</div></header>
<main id="main" class="resource-main">{body}</main>
<footer class="resource-footer"><div><nav aria-label="{'Footer navigation' if english else 'フッターナビゲーション'}">
<a href="{prefix}/about/">{'About the developer' if english else '開発者について'}</a>
<a href="{prefix}/privacy">{'Privacy' if english else 'プライバシー'}</a>
<a href="/contact">{'Contact' if english else 'お問い合わせ'}</a>
<a href="{prefix}/autopilot/">{'Operations research' if english else '運営の実測値'}</a>
</nav><p>{e(copyright_line)}</p></div></footer>
</body></html>"""
    return replace_i18n_lines(html, build_block(lang, BASE + path, [("ja", BASE + ja), ("en", BASE + en)], BASE + ja))


def csv_text(headers, records):
    out = io.StringIO(newline="")
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(headers)
    writer.writerows(records)
    return out.getvalue()


put("assets/downloads/autopilot-runs-2026-09-02.csv", csv_text(
    ["run_id", "date_jst", "route", "attempted", "outcome", "pr", "intervention_kinds"],
    [[r["run_id"], r["date_jst"], r["route"], str(r["attempted"]).lower(), r["outcome"], r["pr"] or "", "|".join(r["intervention_kinds"])] for r in rows]))


def chart(path, title, series, denominator, note):
    height = 135 + len(series) * 78
    elements = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 {height}" role="img" aria-labelledby="title desc">',
                f'<title id="title">{e(title)}</title><desc id="desc">{e(note)}. ' + e("; ".join(f"{label}: {value} of {denominator}" for label, value in series)) + '</desc>',
                f'<rect width="900" height="{height}" rx="14" fill="#122139"/>',
                f'<g font-family="system-ui, sans-serif" fill="#eef3fc"><text x="28" y="43" font-size="23" font-weight="700">{e(title)}</text>']
    for i, (label, value) in enumerate(series):
        y = 83 + i * 78
        elements.extend([f'<text x="28" y="{y}" font-size="18">{e(label)}</text>',
                         f'<rect x="28" y="{y+13}" width="700" height="20" rx="4" fill="#30435e"/>',
                         f'<rect x="28" y="{y+13}" width="{700*value/denominator:.2f}" height="20" rx="4" fill="#99ccff"/>',
                         f'<text x="750" y="{y+30}" font-size="19">{value}/{denominator}</text>'])
    elements.append(f'<text x="28" y="{height-20}" font-size="14" fill="#becbdf">{e(note)}</text></g></svg>')
    put(path, "\n".join(elements))


chart("assets/img/research/autopilot-outcomes-2026-09-02.svg", "28 attempted runs: what reached production",
      [("Shipped", outcomes["shipped"]), ("Failed", outcomes["failed"]), ("No artifact", outcomes["no_artifact"]), ("Cancelled", outcomes["cancelled"])], len(attempts),
      "11 Aug–2 Sep 2026 JST · 41 ledger records; 13 non-attempts excluded · simplememofast.com")
chart("assets/img/research/autopilot-interventions-2026-09-02.svg", "Human intervention: counted per attempted run",
      [("At least one intervention", len(intervened)), ("Infrastructure repair", kinds["infra"]), ("Human edit to the artifact", kinds["artifact"])], len(attempts),
      "11 Aug–2 Sep 2026 JST · categories can overlap; bars must not be added · simplememofast.com")
chart("assets/img/research/autopilot-shipping-days-2026-09-02.svg", "Days with at least one shipment",
      [("One or more shipped runs", len({r["date_jst"] for r in shipped})), ("No shipped run", days-len({r["date_jst"] for r in shipped}))], days,
      "11 Aug–2 Sep 2026 JST · calendar days, not runs or working hours · simplememofast.com")

research = f"""
<p class="eyebrow">Field report · a small iPhone app</p>
<h1>What happened when AI ran the daily operations of an app?</h1>
<p class="lead">We published the runs that shipped, the runs that failed, and the times a human stepped in. Across {days} days, {len(shipped)} of {len(attempts)} attempted runs shipped work. A successful workflow status did not always mean useful work was produced.</p>
<p class="stamp">Published 5 September 2026 · Observation window: 11 August–2 September 2026, Japan time · By the Simple Memo development team</p>
<div class="stats"><div class="stat"><strong>{rate}%</strong><span>Shipment rate: {len(shipped)}/{len(attempts)} attempted runs</span></div><div class="stat"><strong>{human_rate}%</strong><span>Human intervention: {len(intervened)}/{len(attempts)} attempted runs</span></div><div class="stat"><strong>{len(rows)}</strong><span>Ledger records, including skips and no-run records</span></div></div>
<p>This is a historical case study of <a href="/en/obsidian/">Simple Memo - for Obsidian</a>, a working iPhone app. The operating loop measures results, chooses a task, makes a change, checks it, ships eligible changes, and records the outcome. It is a study of app operations, not a claim that an AI independently owns or runs a company.</p>
{links([('/assets/downloads/autopilot-runs-2026-09-02.csv','Download all 41 rows (CSV)'),('/'+DATA_PATH,'Snapshot and source (JSON)'),('/en/press/','Media kit and illustrations')])}
<section id="method"><h2>How we counted</h2>
<p>We selected public ledger records dated {data['period_start']} through {data['period_end']}, inclusive. A row is one recorded run. The {len(rows)-len(attempts)} rows with attempted=false include 11 gate skips and 2 no-run records. They remain in the download but are excluded from the shipment and intervention denominators.</p>
<p>A shipment means outcome=shipped in the ledger. It can be a website article, an update, or an operations change; it is not an App Store release. A human intervention means at least one recorded intervention on an attempted run. It includes infrastructure repair, initial setup, substitution, and an owner request. It does not measure minutes worked.</p>
<p>The snapshot was extracted from a <a href="{source}">specific revision of the public ledger</a>. Later records do not change this observation window. The <a href="/data/autopilot-runs.json">live ledger</a> and <a href="/autopilot/">full Japanese operations page</a> continue to change. The page and all three charts are generated from the same downloadable snapshot.</p>
</section>
<section id="results"><h2>Results with the denominators intact</h2>
{table(['Attempted-run outcome','Runs','Share of attempted runs'],[(label,outcomes[key],f'{100*outcomes[key]/len(attempts):.1f}%') for label,key in [('Shipped','shipped'),('Failed','failed'),('No artifact','no_artifact'),('Cancelled','cancelled')]])}
<figure><img src="/assets/img/research/autopilot-outcomes-2026-09-02.svg" width="900" height="447" alt="Of 28 attempted runs: 19 shipped, 6 failed, 2 produced no artifact, and 1 was cancelled." loading="lazy"><figcaption>Shipment rate is an outcome measure. It is not the percentage of the business that is automated.</figcaption></figure>
<p>There were no recorded human edits to the shipped artifacts. This does not mean there was no human involvement: infrastructure repairs occurred in four attempted runs, and initial setup, substitution, and an owner request each appeared in one run.</p>
<figure><img src="/assets/img/research/autopilot-interventions-2026-09-02.svg" width="900" height="369" alt="Human intervention appeared in 7 of 28 attempted runs, infrastructure repair in 4, and artifact editing in 0." loading="lazy"><figcaption>Intervention categories describe work types. Zero artifact edits does not imply zero human work.</figcaption></figure>
<figure><img src="/assets/img/research/autopilot-shipping-days-2026-09-02.svg" width="900" height="291" alt="17 of 23 calendar days had at least one shipment; 6 had none." loading="lazy"><figcaption>17/23 calendar days had a shipment. Starting a workflow and shipping useful work are separate events.</figcaption></figure>
</section>
<section id="failures"><h2>Three failures that changed what we check</h2>
<div class="cards">
<article class="card"><h3>Green status, no artifact</h3><p>On 22 August, the workflow reported success while the ledger recorded 14 permission denials and no artifact. Run: ap-20260822-actions. A success status alone was insufficient evidence of delivery.</p></article>
<article class="card"><h3>A stale claim blocked the fallback</h3><p>On 29 August, a fallback claimed the day’s branch but produced neither an article nor a PR. The primary route treated the claim as work in progress and skipped. Run: ap-20260829-ccr0920.</p></article>
<article class="card"><h3>Two routes, one shared limit</h3><p>On 30–31 August, the primary route hit an account usage limit. The 31 August fallback shared the account and also failed. Different schedules did not provide independence from the same limit.</p></article>
</div><p>These are observations from the <a href="{source}">source records</a>, including later diagnostic annotations. They are not a controlled comparison of AI vendors, and the original cause was not always known at the time of failure.</p></section>
<section><h2>What humans still decide</h2><p>The published operating policy separates reversible website work from pricing, contracts, spending, and App Store release decisions. Humans remain responsible for those decisions and for device verification. The complete, changing permission table is on the <a href="/autopilot/">Japanese operations page</a>.</p>
<p>Task-inventory automation rates, shipment rates, and human working-time savings have different denominators. This report does not infer one from another. It also does not demonstrate automatic production rollback, end-to-end incident recovery, or an increase in revenue.</p></section>
<section><h2>Limits and how to cite this report</h2><p>This is one team, one app, a short observation window, and an operator-maintained ledger. Some entries were reconstructed from workflow history. Missing interventions would undercount human involvement. There is no control group and no measured counterfactual human workload.</p>
<p>For coverage, retain the observation dates and the denominator. A suitable description is: “In Simple Memo’s 11 August–2 September 2026 operations ledger, 19 of 28 attempted runs shipped work; 7 of those 28 recorded human intervention.” Link to this report or its snapshot so readers can check the definitions.</p>
{links([('/assets/img/research/autopilot-outcomes-2026-09-02.svg','Outcome chart (SVG)'),('/assets/img/research/autopilot-interventions-2026-09-02.svg','Intervention chart (SVG)'),('/assets/img/research/autopilot-shipping-days-2026-09-02.svg','Shipping-day chart (SVG)')])}
<p>To inspect the product behind these records, see <a href="/en/obsidian/">the Obsidian workflow</a>, <a href="/en/siri/">Siri setup</a>, or <a href="/en/press/">the product facts and media kit</a>. For corrections or reproducibility questions, <a href="/contact">contact the developer</a>.</p></section>
"""
put("en/autopilot/index.html", page("/en/autopilot/", "AI app operations: 23 days of results | Simple Memo", "A dated field report from Simple Memo: 41 ledger records, 28 attempted runs, 19 shipments, human interventions, failures, and downloadable source data.", research, "/autopilot/", "/en/autopilot/", "en"))

summaries = {
    "en": """Simple Memo - for Obsidian is an independent iPhone app for capturing a thought and sending it to your own email address, with optional appending to an Obsidian vault. It supports typed notes, Siri capture, and Apple Watch. With a compatible folder selected, the app writes to the vault on the iPhone without an Obsidian community plugin. Email delivery and vault appending are separate paths: offline email waits in the Outbox, while folder-based appending can work locally. A vault must be accessible in the Files picker for the direct-folder method. The app also publishes a dated operations ledger describing work performed by AI, human interventions, and failures. Those records are available for inspection and reuse as research material. Simple Memo is developed by YURIKA, K.K. It is not an official Obsidian product and does not claim to be an official successor to Captio. Setup instructions and limitations are available on its website.""",
    "ja": """「Obsidian連携シンプルメモ」は、思いついたことを自分のメールへ送り、必要に応じてObsidianの保管庫にも追記できるiPhoneアプリです。文字入力、Siriからの音声キャプチャ、Apple Watchに対応しています。対応するフォルダを選択すると、ObsidianのコミュニティプラグインなしでiPhoneから追記できます。メール配送と保管庫への追記は別の処理で、オフライン時のメールはOutboxで待機します。開発・運営は株式会社ユリカ。AIが行った運営業務、失敗、人間の介入を記録した台帳も公開しています。Obsidianの公式製品ではなく、Captioの正式な後継・承継製品でもありません。"""
}

for lang in ("ja", "en"):
    english = lang == "en"
    prefix = "/en" if english else ""
    title = "Simple Memo media kit: facts, screenshots and research" if english else "紹介・取材用資料｜Obsidian連携シンプルメモ"
    desc = "Product facts, setup screenshots, explanatory videos, downloadable descriptions, and a dated AI operations dataset for writers covering Simple Memo." if english else "Obsidian連携シンプルメモの紹介・取材用資料。製品の説明文、設定画面、説明動画、対応条件、公開済みのAI運営実測データと引用用図表をまとめています。検証に必要な手順や制約、素材の原本、開発者への問い合わせ先まで、このページから確認できます。"
    put(f"assets/downloads/simplememo-facts-{lang}.txt", summaries[lang] + "\n\n" + BASE + prefix + "/press/\n" + BASE + prefix + "/obsidian/\n" + BASE + prefix + "/siri/\n")
    screenshots = ["onboarding-en-1.png", "onboarding-en-2.png", "onboarding-en-3.png"] if english else ["onboarding-1.png", "onboarding-2.png", "onboarding-3.png"]
    screen_html = '<div class="screens">' + "".join(f'<figure><a href="{asset("assets/img/siri/" + s)}"><img src="{asset("assets/img/siri/" + s)}" width="220" height="476" alt="{e(("Siri setup screen " if english else "Siri設定画面 ") + str(i+1))}" loading="lazy"></a><figcaption>{"Open original PNG" if english else "PNG原本を開く"}</figcaption></figure>' for i,s in enumerate(screenshots)) + '</div>'
    facts = [
        ("Product" if english else "製品", constants["appNameEn"] if english else constants["appNameJa"]),
        ("Developer" if english else "開発・運営", "YURIKA, K.K." if english else "株式会社ユリカ"),
        ("Capture" if english else "入力", "Typed notes, Siri and Apple Watch" if english else "文字入力、Siri、Apple Watch"),
        ("Obsidian" if english else "Obsidian連携", "Optional; no community plugin required" if english else "任意で設定。コミュニティプラグイン不要"),
        ("Direct-folder requirement" if english else "フォルダ直接追記の条件", "A writable vault folder accessible through Files" if english else "「ファイル」から選択できる書き込み可能な保管庫フォルダ"),
        ("Offline behavior" if english else "オフライン時", "Email queues in Outbox; folder append can run locally" if english else "メールはOutboxで待機。フォルダ追記は端末内で実行可能"),
    ]
    if english:
        body = f"""<p class="eyebrow">For writers and reviewers</p><h1>Product facts, visuals, and the original sources.</h1><p class="lead">A compact kit for covering email-to-self capture, Siri, Obsidian workflows, or the operations of a small app. Descriptions are ready to copy; setup conditions and source data are linked alongside them.</p><p class="stamp">Updated 5 September 2026 · Maintained by the Simple Memo development team</p>
<h2>A short product description</h2><div class="quote">{e(summaries[lang])}</div>
{links([(f'/assets/downloads/simplememo-facts-{lang}.txt','Download description (TXT)'),('/en/obsidian/','Obsidian setup'),('/en/siri/','Siri setup')])}
<h2>Check the facts before reviewing</h2>{table(['Item','What the product does'],facts)}
<p>The vault picker and the URL-scheme fallback behave differently. With no compatible folder selected, the fallback may open Obsidian. Apple Watch hands off the append to the iPhone. Cloud synchronization can add delay. Normal email sending is not end-to-end encrypted email; local encryption and transport security are separate properties. Read the <a href="/en/privacy-architecture/">privacy architecture</a> before making privacy claims.</p>
<p>Use the <a href="/en/obsidian/">current setup guide</a> and <a href="/en/">product page</a> for availability and pricing. This kit deliberately avoids a competing-app speed table: warm and cold starts, different definitions of “ready,” and human actions are not interchangeable.</p>
<h2>Setup screens and explanatory videos</h2><p>These are published Siri setup screens. They show the setup guide; their labels are not a promise that every OS version presents the same interface.</p>{screen_html}
<figure><video controls playsinline preload="none" poster="/assets/video/obsidian-append-poster.jpg" aria-label="Japanese explanatory animation of the note-to-Obsidian workflow"><source src="/assets/video/obsidian-append.mp4" type="video/mp4"></video><figcaption>Japanese explanatory animation: capture a memo, send it to yourself, and append it to the selected vault. This is an illustration, not a timed recording from an iPhone.</figcaption></figure>
{links([('/assets/video/obsidian-append.mp4','Obsidian illustration (MP4)'),('/assets/video/siri-airpods.mp4','Siri illustration (MP4)'),('/assets/img/app-icon-256.png','App icon (PNG)')])}
<h2>Three angles with material to inspect</h2><ul><li><strong>Returning to email-to-self:</strong> a current option for readers who previously used Captio. See the <a href="/en/captio-alternative/">Captio alternative guide</a>; this is not an official successor.</li><li><strong>Capture before organizing:</strong> inspect the <a href="/en/obsidian/">Obsidian guide</a> and try the <a href="/en/resources/obsidian-inbox/">standalone Inbox Markdown tool</a>.</li><li><strong>What AI operations actually delivered:</strong> the <a href="/en/autopilot/">23-day report</a> includes failed runs, intervention definitions, CSV data, and three reusable charts.</li></ul>
<h2>Using the material</h2><p>When covering Simple Memo, these product descriptions and original illustrations can be used with their context intact. Identify explanatory animations as animations. Screenshots may contain third-party trademarks; this kit does not grant rights in those trademarks or imply endorsement. Please retain the dates and denominators when citing research, and link readers to the relevant source page.</p><p>For additional screenshots, an interview, or a reproducibility question, <a href="/contact">contact the developer</a>. Editorial conclusions and link choices belong to the publisher.</p>"""
    else:
        body = f"""<p class="eyebrow">紹介・レビュー・取材向け</p><h1>紹介に必要な説明と、確かめられる原本を。</h1><p class="lead">自分宛メールメモ、Siri、Obsidian連携、小さなアプリのAI運営。記事で扱う切り口ごとに、説明文・画面・対応条件・実測資料をまとめました。</p><p class="stamp">2026年9月5日更新 ／ シンプルメモ開発チーム</p>
<h2>そのまま使える製品説明</h2><div class="quote">{e(summaries[lang])}</div>
{links([(f'/assets/downloads/simplememo-facts-{lang}.txt','説明文をダウンロード（TXT）'),('/obsidian/','Obsidianの設定'),('/siri/','Siriの設定')])}
<h2>紹介前に確認できる製品情報</h2>{table(['項目','内容'],facts)}
<p>対応するフォルダを選べない場合はURLスキーム経由となり、Obsidianが開くことがあります。Apple Watchからの追記はiPhoneが担当します。クラウド同期には時間差が生じます。メール配送をエンドツーエンド暗号化と表現しないでください。端末内の暗号化と通信経路は別の性質です。詳細は<a href="/privacy-architecture/">プライバシー設計</a>で確認できます。</p>
<p>料金や現在の提供状況は<a href="/">製品ページ</a>、動作条件は<a href="/obsidian/">設定ガイド</a>を参照してください。起動速度を比較する場合は、ウォーム／コールド起動や「入力可能」の定義を揃える必要があります。</p>
<h2>設定画面と説明動画</h2><p>公開済みのSiri設定ガイド画面です。OSのバージョンによって表示が異なる場合があります。</p>{screen_html}
<figure><video controls playsinline preload="none" poster="/assets/video/obsidian-append-poster.jpg" aria-label="メモからObsidianへの流れを説明するアニメーション"><source src="/assets/video/obsidian-append.mp4" type="video/mp4"></video><figcaption>入力→自分宛メール→保管庫への追記を説明するアニメーションです。実機録画・速度の測定映像ではありません。</figcaption></figure>
{links([('/assets/video/obsidian-append.mp4','Obsidianの説明動画（MP4）'),('/assets/video/siri-airpods.mp4','Siriの説明動画（MP4）'),('/assets/img/app-icon-256.png','アプリアイコン（PNG）')])}
<h2>検証資料がある3つの切り口</h2><ul><li><strong>自分宛メールで残す：</strong><a href="/captio-alternative/">Captioの代替を探す人向けガイド</a>。正式な後継・承継製品ではありません。</li><li><strong>整理する前に、残す手間を減らす：</strong><a href="/obsidian/">Obsidianへの追記手順</a>と、アプリなしでも使える<a href="/resources/obsidian-inbox/">Inbox用Markdownツール</a>があります。</li><li><strong>AI運営は何を出荷できたか：</strong><a href="/autopilot/">運営の実測ページ</a>と<a href="/en/autopilot/">英語レポート</a>に、失敗例、集計条件、CSV、引用用図表を用意しています。</li></ul>
<h2>素材を使うとき</h2><p>シンプルメモを紹介する記事では、文脈を保ったうえで説明文と独自の説明図をご利用いただけます。説明動画はアニメーションと明記してください。画面内の第三者の商標について権利を付与するものではなく、提携・推奨を意味しません。実測の引用時は期間と分母を併記し、読者が検証できる原本ページを案内してください。</p><p>追加の画面、取材、検証方法に関するご相談は<a href="/contact">お問い合わせフォーム</a>へ。記事の評価やリンクの選択は掲載者に委ねます。</p>"""
    put(prefix.lstrip("/") + ("/" if prefix else "") + "press/index.html", page(prefix + "/press/", title, desc, body, "/press/", "/en/press/", lang))

for lang in ("ja", "en"):
    english = lang == "en"
    prefix = "/en" if english else ""
    title = "Obsidian Inbox Markdown generator | Simple Memo" if english else "Obsidian Inbox用Markdown生成ツール｜シンプルメモ"
    desc = "Create an Inbox or daily-note Markdown example in your browser. Preview timestamps and checkboxes, copy or download a file, and use free starter templates." if english else "ObsidianのInboxやデイリーノート向けに、時刻・チェックボックス付きのMarkdownをブラウザで作成。プレビュー、コピー、ファイル保存ができる無料ツールです。アカウントやアプリは不要。入力内容を送信せず、保管庫を変更することもありません。"
    def tr(en, ja):
        return en if english else ja
    form = f"""<div class="tool-grid"><form id="inbox-tool" class="tool-panel">
<label for="destination">{tr('Destination example','出力先の例')}</label><select id="destination" name="destination"><option value="inbox">Inbox.md</option><option value="daily">{tr('Daily note (YYYY-MM-DD.md)','デイリーノート（YYYY-MM-DD.md）')}</option></select>
<label for="heading">{tr('Inbox heading','Inboxの見出し')}</label><input id="heading" name="heading" value="Inbox" maxlength="100" autocomplete="off">
<label for="note-date">{tr('Date','日付')}</label><input type="date" id="note-date" name="date" required>
<label for="note-time">{tr('Time','時刻')}</label><input type="time" id="note-time" name="time">
<label class="check-label" for="timestamp"><input type="checkbox" id="timestamp" name="timestamp" checked>{tr('Include a timestamp','時刻を付ける')}</label>
<label for="style">{tr('Line format','行の形式')}</label><select id="style" name="style"><option value="bullet">{tr('Bullet list','箇条書き')}</option><option value="task">{tr('Checkbox','チェックボックス')}</option></select>
<label for="memo">{tr('Example note','メモの例')}</label><textarea id="memo" name="memo" maxlength="10000" autocomplete="off" spellcheck="false">{tr('Review the notes after my walk.','散歩のあとで、今日のメモを見返す。')}</textarea>
<p class="small">{tr('The generator works locally. It has no account, upload, or vault access.','生成処理はブラウザ内で完結します。アカウント、アップロード、保管庫へのアクセスはありません。')}</p>
</form><section class="tool-panel" aria-label="{tr('Markdown preview','Markdownプレビュー')}"><h2 style="margin-top:0;border:0;padding:0">{tr('Preview','プレビュー')}</h2><p><code id="markdown-filename">Inbox.md</code></p><pre><code id="markdown-preview"># Inbox\n\n- 09:00 {tr('Review the notes after my walk.','散歩のあとで、今日のメモを見返す。')}</code></pre>
<div class="actions"><button id="copy-markdown" type="button">{tr('Copy Markdown','Markdownをコピー')}</button><button id="download-markdown" type="button">{tr('Download .md',' .mdを保存')}</button></div><p id="tool-status" role="status" aria-live="polite"></p></section></div>
<noscript><p class="note">{tr('Enable JavaScript for the generator, or download the ready-made Markdown templates below.','生成ツールにはJavaScriptが必要です。下の配布用MarkdownはJavaScriptなしで取得できます。')}</p></noscript>"""
    downloads = links([(f"/assets/downloads/obsidian-inbox-{lang}.md",tr("Inbox starter (.md)","Inboxのひな形（.md）")),(f"/assets/downloads/obsidian-daily-{lang}.md",tr("Daily review starter (.md)","日次レビューのひな形（.md）")),("/assets/downloads/capture-measurement-worksheet.csv",tr("Capture measurement sheet (CSV)","キャプチャ実測シート（CSV）"))])
    if english:
        body = f"""<p class="eyebrow">Free resource · no account</p><h1>Turn a passing thought into a usable Inbox note.</h1><p class="lead">Try a timestamped list or checkbox, preview the Markdown, and download a small file for your vault. This tool works on its own; Simple Memo is not required.</p>{form}
<h2>Use the result in your vault</h2><ol><li>Choose an Inbox or daily-note example, a date, and a line format.</li><li>Edit the sample and copy the Markdown, or download the file.</li><li>Open your existing note in Obsidian and paste the part you want to keep. If you import a file, use a new name when a file with that name already exists.</li><li>During a review, turn the useful lines into tasks or permanent notes. Keep capture simple so the Inbox remains easy to empty.</li></ol>
<p class="note">This is a Markdown example generator. It does not configure Simple Memo, install an Obsidian plugin, or automatically append to a vault. It does not overwrite existing notes. The date and time initially use your browser’s local clock; you can change them.</p>
<h2>Starter files you can keep</h2><p>These plain Markdown files have a small capture area and review prompts. They require no template plugin. The dates in the examples are placeholders for you to replace.</p>{downloads}
<h2>Compare capture workflows fairly</h2><p>The CSV is a blank measurement worksheet, not a table of results. It has 10 trials for each of five example methods: direct Obsidian entry, Apple Shortcuts, Simple Memo, email-to-self, and a share sheet. Record your actual setup; some methods require extra configuration to reach the same destination.</p><p>Use the same device and OS, define the start and end of “ready to capture,” separate warm from cold starts, and record both successful and failed trials. Record the number of actions and time to appear in the destination separately. Do not infer that 50 trials represent all users. See the <a href="/blog/benchmark-methodology">published measurement methodology (Japanese)</a> for context.</p>
<h2>From a sample file to automatic capture</h2><p>For appending notes directly from an iPhone, follow the <a href="/en/obsidian/">Simple Memo Obsidian setup guide</a>. It explains folder access, Inbox and daily-note destinations, offline behavior, and the fallback that opens Obsidian. <a href="/en/siri/">Siri setup</a> covers voice capture. Your Obsidian folders and note names remain your choice.</p><p>Writing a tutorial? Link readers to this tool so they can change the example themselves. The <a href="/en/press/">media kit</a> contains the product description and setup visuals.</p>"""
    else:
        body = f"""<p class="eyebrow">無料・アカウント不要</p><h1>思いつきを、使いやすいInboxの形に。</h1><p class="lead">時刻付きの箇条書きやチェックボックスを試して、Markdownをコピー・保存できます。シンプルメモのアプリを使っていなくても利用できます。</p>{form}
<h2>保管庫で使う手順</h2><ol><li>Inboxかデイリーノートを選び、日付と行の形式を決めます。</li><li>例文を編集し、Markdownをコピーするかファイルを保存します。</li><li>Obsidianで既存のノートを開き、必要な部分を貼り付けます。ファイルを取り込む場合、同名のノートがあれば別名にしてください。</li><li>見返す時間に、必要な行をタスクや保存用ノートへ移します。Inboxを空にしやすい、小さな形式から始めます。</li></ol>
<p class="note">これはMarkdownの例を作るツールです。シンプルメモの設定変更、プラグイン導入、保管庫への自動追記は行いません。既存のメモも上書きしません。最初の日付と時刻にはブラウザのローカル時刻を使い、自由に変更できます。</p>
<h2>そのまま保存できるひな形</h2><p>記録欄と見返しの問いだけを置いたMarkdownです。テンプレート用プラグインは不要で、日付の例は自分の運用に合わせて置き換えます。</p>{downloads}
<h2>キャプチャ方法を同じ条件で比べる</h2><p>CSVは記入用の実測シートで、測定結果ではありません。Obsidianへの直接入力、Appleショートカット、シンプルメモ、自分宛メール、共有シートの5方式を例に、各10試行の空欄を用意しました。同じ保存先まで到達するには、方式ごとの追加設定が必要になる場合があります。自分の設定を記録してください。</p><p>端末とOSを揃え、「どの操作から、何ができるまで」を測るか先に決めます。ウォーム起動とコールド起動は分け、失敗も残します。操作数、入力開始までの時間、保存先に現れるまでの時間は別に計測します。50試行で利用者全体を代表できるとは扱いません。既存の<a href="/blog/benchmark-methodology">測定方法の説明</a>も参照できます。</p>
<h2>例文作成から、自動で残す運用へ</h2><p>iPhoneから保管庫へ自動で追記する場合は、<a href="/obsidian/">シンプルメモのObsidian設定ガイド</a>をご覧ください。フォルダ選択、Inbox・デイリーノートの使い分け、オフライン時、Obsidianが開く代替経路を説明しています。音声入力は<a href="/siri/">Siriの設定</a>へ。フォルダやノート名は自分の運用に合わせて選べます。</p><p>使い方を記事で紹介するときは、読者が例を変更できるこのページを案内できます。製品説明や設定画面は<a href="/press/">紹介用資料</a>にまとめています。</p>"""
    put(prefix.lstrip("/") + ("/" if prefix else "") + "resources/obsidian-inbox/index.html", page(prefix + "/resources/obsidian-inbox/", title, desc, body, "/resources/obsidian-inbox/", "/en/resources/obsidian-inbox/", lang, tool=True))
    put(f"assets/downloads/obsidian-inbox-{lang}.md", "# Inbox\n\n## " + tr("Capture","記録") + "\n\n- [ ] " + tr("An idea to revisit","あとで見返したいアイデア") + "\n\n## " + tr("Review","見返す") + "\n\n- " + tr("What needs a next action?","次の行動が必要なものは？") + "\n- " + tr("What is worth keeping?","残しておきたいものは？") + "\n- " + tr("What can I delete?","削除できるものは？") + "\n")
    put(f"assets/downloads/obsidian-daily-{lang}.md", "# YYYY-MM-DD\n\n## " + tr("Capture","記録") + "\n\n- HH:mm " + tr("Replace this example with a thought.","この例を、残したいことに置き換える。") + "\n\n## " + tr("End-of-day review","1日の終わりに") + "\n\n- " + tr("One thing to do tomorrow:","明日やることを1つ：") + "\n- " + tr("One thing to remember:","覚えておきたいことを1つ：") + "\n")

put("assets/downloads/capture-measurement-worksheet.csv", csv_text(
    ["method", "trial", "device", "os_version", "app_version", "warm_or_cold", "start_definition", "end_definition", "ready_seconds", "actions_count", "destination", "destination_delay_seconds", "success", "notes"],
    [[method,i]+[""]*12 for method in ["Obsidian direct entry","Apple Shortcuts","Simple Memo","Email to self","Share sheet"] for i in range(1,11)]))

def output_differences(root, expected):
    differences = []
    for rel, text in expected.items():
        path = root / rel
        if not path.exists() or path.read_text() != text:
            differences.append(rel)
    return differences


def selftest():
    with tempfile.TemporaryDirectory(prefix="citation-assets-test-") as folder:
        root = Path(folder)
        expected = {"report.html": "<p>19 of 28</p>\n", "runs.csv": "attempted,shipped\n28,19\n"}
        assert output_differences(root, expected) == ["report.html", "runs.csv"], "missing outputs must fail"
        for rel, text in expected.items():
            (root / rel).write_text(text)
        assert output_differences(root, expected) == [], "matching outputs must pass"
        (root / "report.html").write_text("<p>19 of 41</p>\n")
        assert output_differences(root, expected) == ["report.html"], "a changed denominator must fail"
        (root / "report.html").write_text(expected["report.html"])
        (root / "runs.csv").write_text("attempted,shipped\n28,20\n")
        assert output_differences(root, expected) == ["runs.csv"], "changed downloaded data must fail"
    print("Citation selftest: missing outputs, matching outputs, changed page, and changed CSV verified.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()
    if args.selftest:
        selftest()
        raise SystemExit(0)
    differences = output_differences(ROOT, outputs) if args.check else []
    if not args.check:
        for rel, text in outputs.items():
            path = ROOT / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
    if differences:
        print("Citation assets differ from their sources:\n" + "\n".join(differences))
        raise SystemExit(1)
    print(f"Citation assets: {len(outputs)} files {'verified' if args.check else 'written'}; {len(rows)} records, {len(attempts)} attempted, {len(shipped)} shipped.")
