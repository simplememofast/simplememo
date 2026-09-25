#!/usr/bin/env python3
"""Finish locale links and visible content after every English counterpart exists."""
from __future__ import annotations

import argparse
import html
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from inject_faq_schema import (
    MANAGED_MARKER, NON_MARKUP_RE, JSONLD_RE, build_faqpage,
    extract_faqs, hand_written_faqpage, managed_payload, build_payload,
    replace_or_insert,
)

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://simplememofast.com"
TAG_RE = re.compile(r"<[a-zA-Z][^>]*>")
HREF_RE = re.compile(r"(\bhref\s*=\s*)([\"'])(.*?)(\2)", re.I | re.S)
CLASS_RE = re.compile(r"(\bclass\s*=\s*)([\"'])(.*?)(\2)", re.I | re.S)
LABEL_RE = re.compile(r"(\b(?:alt|aria-label|title)\s*=\s*)([\"'])(.*?)(\2)", re.I | re.S)

# Translate interface descriptions, while preserving quoted UI names and samples.
EN_LABELS = {
    "このページの要点": "Key points on this page",
    "記事内の目次": "Table of contents",
    "ページ内の目次": "Table of contents",
    "メインナビゲーション": "Main navigation",
    "メニュー": "Menu",
    "比較対象アプリ": "Apps compared",
    "Obsidian連携シンプルメモ": "Simple Memo - for Obsidian",
    "UpNote比較表 / UpNote comparison": "UpNote comparison",
    "記入例の表 / Example worksheet table": "Example worksheet table",
    "旅行メモの整理表 / Travel note structure": "Travel note structure",
    "集中作業の整理表 / Work planning table": "Work planning table",
    "iPhone側面のアクションボタンを長押しすると「声でメモ」が起動し、開いた瞬間に音声入力が始まり、話した内容が文字になり、送信をタップして5秒で完了する様子": "Demonstration: hold the iPhone Action Button to open voice capture, dictate a note, and tap Send; the sequence takes five seconds",
    "Obsidian 1.13.6の初回起動画面。「保管庫を新規作成する」「保管庫としてフォルダを開く」「Obsidian Syncから保管庫を開く」の3択と、日本語が選択された言語Menuが表示されている": "Obsidian 1.13.6 first-launch screen in Japanese, with options to create a vault, open a folder as a vault, or open an Obsidian Sync vault",
    "ローカル保管庫を作成する画面。保管庫の名称に「メモ」と入力され、ロケーションに/root/Vaultsが指定されている": "Creating a local vault named Memo in the /root/Vaults folder, using the Japanese interface",
    "作成直後の保管庫。左にファイル一覧、中央に「ようこそ」ノート、右にグラフビューが表示されている": "New vault with a file list on the left, the Japanese Welcome note in the center, and graph view on the right",
    "「はじめてのノート」を編集中の画面。本文に段落と箇条書きが表示され、右のグラフビューにノードが増えている": "Editing the first sample note, with paragraphs and a bullet list in the body and additional nodes in graph view",
    "[[買い物リスト]]と入力中の画面。リンク候補のポップアップに「一致するものが見つかりません」と表示されている": "Entering a wiki link to a shopping-list note; the Japanese link suggestions report that no matching note exists",
    "リンクのクリックで作成された「買い物リスト」ノートと、はじめてのノートとのつながりが表示されたグラフビュー": "Shopping-list note created by following the link, with graph view showing its connection to the first sample note",
    "Obsidianデスクトップ版（Linux）で検証用ノートを開いた画面。見出し・段落・wikiリンク・タグが自由な形式で混在している": "Test note in Obsidian desktop on Linux, combining headings, paragraphs, wiki links, and tags in a free-form document",
    "Logseqデスクトップ版（Linux）で同じフォルダを開いた画面。同じデイリーノートがジャーナルとしてブロック表示されている": "The same folder in Logseq desktop on Linux, showing the same daily note as journal blocks",
    "Obsidianで開いた2026-08-11.mdに、Logseqで入力した行が追記されて表示されている画面": "Obsidian showing 2026-08-11.md with the line entered in Logseq appended to the note",
    "Obsidianのグラフビュー。3つのノートと1本のリンクが表示されている": "Obsidian graph view showing three notes and one link",
    "Logseqのグラフビュー。ページに加えてタグもノードとして表示されている": "Logseq graph view showing tags as nodes alongside pages",
    "Logseq 2.0.1（DB版）のジャーナル画面。フォルダを選ばずに入力したブロックが表示されている": "Journal in the database edition of Logseq 2.0.1, showing blocks entered without selecting a folder",
}

EN_SCHEMA_NAMES = {
    "Outboxアーキテクチャ": "Outbox Architecture", "間隔反復法": "Spaced Repetition",
    "ツェッテルカステン": "Zettelkasten", "マインドマップ": "Mind Map",
    "E2E暗号化": "End-to-End Encryption", "コーネルノート式": "Cornell Notes",
    "デジタルデトックス": "Digital Detox", "PKM（個人知識管理）": "Personal Knowledge Management (PKM)",
    "ディープワーク": "Deep Work", "カンバン": "Kanban", "ポモドーロ・テクニック": "Pomodoro Technique",
    "Captioメソッド": "Captio Method", "AES-GCM暗号化": "AES-GCM Encryption",
    "タイムボクシング": "Timeboxing", "セカンドブレイン": "Second Brain",
    "アイゼンハワーマトリクス": "Eisenhower Matrix", "メモアプリ用語集": "Memo App Glossary",
    "メモテンプレート集": "Memo Templates",
    "iPhoneメモアプリ 入力開始速度ベンチマーク 2026": "iPhone Memo App Input-Readiness Benchmark 2026",
}

EN_TEXT = {
    "Apple — iPhoneで背面タップを使う": "Apple — Use Back Tap on iPhone",
    "警察庁 — ながら運転の禁止": "National Police Agency — Ban on distracted driving",
    "シンプルメモ / Simple Memo": "Simple Memo",
    "Google — Gmailでメールを送信 / Send Gmail": "Google — Send Gmail",
    "国税庁 — 必要経費の知識 / National Tax Agency: Necessary expenses": "National Tax Agency — Necessary expenses",
    "国税庁 — 個人事業者の記帳・帳簿等の保存 / Bookkeeping and record retention": "National Tax Agency — Bookkeeping and record retention",
    "Obsidian連携シンプルメモ": "Simple Memo - for Obsidian",
    "開発者について": "About the developer",
    "Obsidian連携シンプルメモ — 0.4秒": "Simple Memo - for Obsidian — 0.4 seconds",
    "Yahoo — Yahoo!メール ヘルプ / Yahoo Mail Help": "Yahoo — Yahoo Mail Help",
    "Yahoo — 連絡先の追加とホワイトリスト / Add Contacts": "Yahoo — Add Contacts",
    "Google Workspace — MXレコードの設定 / Set Up MX Records": "Google Workspace — Set Up MX Records",
    "Microsoft 365 — DNSレコードの作成 / Create DNS Records": "Microsoft 365 — Create DNS Records",
    "Proton — ゼロアクセス暗号化 / Zero-Access Encryption": "Proton — Zero-Access Encryption",
    "Apple — Macのメールでルールを使用する / Use Rules in Mail on Mac": "Apple — Use Rules in Mail on Mac",
    "Gmail — フィルタの作成と使用 / Create rules to filter emails": "Gmail — Create rules to filter emails",
    "Gmail — スターを付ける / Star your emails": "Gmail — Star your emails",
    "Gmail — 検索演算子 / Search operators": "Gmail — Search operators",
    "Google — Gmail ヘルプセンター / Gmail Help Center": "Google — Gmail Help Center",
    "Gmail — フィルタの作成 / Create Filters": "Gmail — Create Filters",
    "Microsoft — 優先受信トレイ / Focused Inbox for Outlook": "Microsoft — Focused Inbox for Outlook",
    "Obsidian向けMarkdown生成ツールと配布テンプレート": "Markdown builder and downloadable templates for Obsidian",
    "紹介用資料": "Media kit",
    "保管庫（Vault）とは（当サイト）": "What is an Obsidian vault?",
    "ObsidianとLogseqの比較（当サイト）": "Obsidian and Logseq comparison",
    "Obsidianプラグイン入門（当サイト）": "Getting started with Obsidian plugins",
    "Obsidian Forum — Apple Watch app（機能要望）": "Obsidian Forum — Apple Watch app feature request",
    "Apple Watchユーザガイド": "Apple Watch User Guide",
    "Obsidianの始め方（当サイト）": "Getting started with Obsidian",
    "Obsidian比較ハブ（当サイト）": "Obsidian comparison hub",
    "Obsidian Help — Sync your notes across devices（英語・原文ソース）": "Obsidian Help — Sync your notes across devices (original English source)",
    "obsidian.md/pricing（公式）": "obsidian.md/pricing (official)",
    "Apple — iPhoneで音声入力する / Dictate text on iPhone": "Apple — Dictate text on iPhone",
}


def finish_text_labels(text: str) -> str:
    class Labels(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=False)
            self.excluded = []
            self.edits = []
            self.offsets = [0] + [m.end() for m in re.finditer(r"\n", text)]

        def handle_starttag(self, tag, attrs):
            if tag in ("head", "script", "style", "pre", "code"):
                self.excluded.append(tag)

        def handle_endtag(self, tag):
            if self.excluded and self.excluded[-1] == tag:
                self.excluded.pop()

        def handle_data(self, data):
            translated = EN_TEXT.get(data.strip())
            if not self.excluded and translated:
                line, column = self.getpos()
                start = self.offsets[line - 1] + column
                out = data[:len(data) - len(data.lstrip())] + html.escape(translated, quote=False) + data[len(data.rstrip()):]
                self.edits.append((start, start + len(data), out))

    parser = Labels()
    parser.feed(text)
    for start, end, replacement in reversed(parser.edits):
        text = text[:start] + replacement + text[end:]
    return text


class MarkupReader(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.anchor = {}
        self.in_heading = False
        self.heading = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.anchor = dict(attrs)
        if tag == "h1":
            self.in_heading = True

    def handle_endtag(self, tag):
        if tag == "h1":
            self.in_heading = False

    def handle_data(self, data):
        if self.in_heading:
            self.heading.append(data)


def english_target(href: str, root: Path) -> str | None:
    url = urlsplit(href)
    if url.scheme and (url.scheme != "https" or url.netloc != "simplememofast.com"):
        return None
    if url.netloc and url.netloc != "simplememofast.com":
        return None
    if not url.path.startswith("/") or url.path.startswith("/en/"):
        return None
    rel = url.path.strip("/")
    if rel.endswith(".html"):
        rel = rel[:-5]
    candidates = [(root / "en" / (rel + ".html"), "/en/" + rel),
                  (root / "en" / rel / "index.html", "/en/" + rel + "/")]
    if not rel:
        candidates = [(root / "en/index.html", "/en/")]
    for path, target in candidates:
        if path.is_file():
            return urlunsplit((url.scheme, url.netloc, target, url.query, url.fragment))
    return None


def finish_markup(text: str, root: Path, *, english: bool) -> str:
    masked = NON_MARKUP_RE.sub(lambda m: " " * len(m[0]), text)
    edits = []
    for match in TAG_RE.finditer(masked):
        tag = text[match.start():match.end()]
        out = tag
        if english:
            def localize_label(m):
                translated = EN_LABELS.get(html.unescape(m[3]))
                return m[1] + m[2] + html.escape(translated, quote=True) + m[2] if translated else m[0]
            out = LABEL_RE.sub(localize_label, out)
        # The toggle script is gone; its inactive wrappers must not hide content.
        if CLASS_RE.search(tag):
            def clean_class(m):
                classes = m[3].split()
                if "lang-content" not in classes:
                    return m[0]
                return m[1] + m[2] + " ".join(c for c in classes if c != "lang-content") + m[2]
            out = CLASS_RE.sub(clean_class, out)
        if english and re.match(r"<a\s", tag, re.I):
            reader = MarkupReader()
            reader.feed(tag)
            anchor = reader.anchor
            if anchor and anchor.get("hreflang", "en") == "en" and anchor.get("lang", "en") == "en":
                href = anchor.get("href", "")
                target = english_target(href, root)
                if target:
                    out = HREF_RE.sub(lambda m: m[1] + m[2] + html.escape(target, quote=True) + m[2], out, count=1)
        if out != tag:
            edits.append((match.start(), match.end(), out))
    for start, end, out in reversed(edits):
        text = text[:start] + out + text[end:]
    return text


def prune_empty_faq(value):
    if isinstance(value, list):
        return [item for row in value if (item := prune_empty_faq(row)) is not None]
    if isinstance(value, dict):
        if value.get("@type") == "FAQPage" and not value.get("mainEntity"):
            return None
        return {k: prune_empty_faq(v) for k, v in value.items()}
    return value


def finish_faq(text: str, page_url: str) -> str:
    edits = []
    for match in JSONLD_RE.finditer(text):
        payload = json.loads(match[1])
        cleaned = prune_empty_faq(payload)
        if cleaned == payload:
            continue
        start = match.start()
        if cleaned is None:
            marker = re.search(re.escape(MANAGED_MARKER) + r"\s*$", text[:start])
            if marker:
                start = marker.start()
            out = ""
        else:
            out = match[0].replace(match[1], json.dumps(cleaned, ensure_ascii=False, separators=(",", ":")))
        edits.append((start, match.end(), out))
    for start, end, out in reversed(edits):
        text = text[:start] + out + text[end:]
    faqs = extract_faqs(text, "en")
    if faqs and not hand_written_faqpage(text) and managed_payload(text) != build_payload(page_url, "en", faqs):
        text = replace_or_insert(text, build_faqpage(page_url, "en", faqs))
    return text


def rewrite_jsonld(text: str, localize) -> str:
    """Apply `localize` (in-place) to every JSON-LD block; re-serialize only blocks it changed."""
    def rewrite(match):
        payload = json.loads(match[1])
        before = json.dumps(payload, ensure_ascii=False)
        localize(payload)
        if json.dumps(payload, ensure_ascii=False) == before:
            return match[0]
        return match[0].replace(match[1], json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    return JSONLD_RE.sub(rewrite, text)


def finish_breadcrumbs(text: str, root: Path) -> str:
    def localize(value, breadcrumb=False):
        if isinstance(value, list):
            for item in value:
                localize(item, breadcrumb)
        elif isinstance(value, dict):
            if breadcrumb and value.get("@type") == "ListItem" and isinstance(value.get("item"), str):
                original = value["item"]
                target = english_target(original, root) or original
                url = urlsplit(target)
                if url.netloc in ("", "simplememofast.com") and url.path.startswith("/en/"):
                    rel = url.path.lstrip("/") + ("index.html" if url.path.endswith("/") else ".html")
                    path = root / rel
                    if path.is_file():
                        reader = MarkupReader()
                        reader.feed(path.read_text(encoding="utf-8"))
                        heading = " ".join(" ".join(reader.heading).split())
                        if heading:
                            value["item"] = target
                            value["name"] = "Home" if url.path == "/en/" else heading
            for key, item in value.items():
                if isinstance(item, (dict, list)):
                    localize(item, value.get("@type") == "BreadcrumbList" and key == "itemListElement")

    return rewrite_jsonld(text, localize)


def finish_schema_names(text: str, root: Path) -> str:
    constants = json.loads((root / "data/site-constants.json").read_text())
    reader = MarkupReader()
    reader.feed(text)
    heading = " ".join(" ".join(reader.heading).split())

    def localize(value):
        if isinstance(value, list):
            for row in value:
                localize(row)
        elif isinstance(value, dict):
            kind = value.get("@type")
            name = value.get("name")
            # Stable entity identifiers and original-language aliases remain intact.
            if kind in ("Organization", "SoftwareApplication") and name == constants["appNameJa"]:
                value["name"] = constants["appNameEn"]
                aliases = value.get("alternateName", [])
                aliases = aliases if isinstance(aliases, list) else [aliases]
                value["alternateName"] = list(dict.fromkeys([*aliases, constants["appNameJa"]]))
            elif kind in ("DefinedTerm", "DefinedTermSet", "Dataset", "ItemList") and name in EN_SCHEMA_NAMES:
                value["name"] = EN_SCHEMA_NAMES[name]
            elif kind == "CollectionPage" and isinstance(name, str) and re.search(r"[ぁ-んァ-ヶ一-龯]", name) and heading:
                value["name"] = heading
            elif kind == "Person" and name == "App Storeユーザー":
                value["name"] = "App Store user"
            for row in value.values():
                if isinstance(row, (dict, list)):
                    localize(row)

    return rewrite_jsonld(text, localize)


def finish_product_schema(text: str, rel: str) -> str:
    from inject_app_schema import MANAGED_MARKER, TARGETS, build_node, replace_or_insert
    if (rel, "en") not in TARGETS:
        return text
    if "SoftwareApplication" in text and MANAGED_MARKER not in text:
        return text
    return replace_or_insert(text, build_node("en"))


def finalize(root: Path = ROOT, *, apply: bool = False) -> list[str]:
    from i18n_config import JA_EN_PAIRS
    changed = []
    pages = {}
    for ja_url, en_url in JA_EN_PAIRS:
        for url, english in [(ja_url, False), (en_url, True)]:
            rel = url.lstrip("/") + ("index.html" if url.endswith("/") else ".html")
            pages[rel] = (url, english)
    # Existing English-only pages and the homepage also link to split pages.
    for path in sorted((root / "en").rglob("*.html")):
        rel = path.relative_to(root).as_posix()
        url = "/" + (rel[:-10] if rel.endswith("index.html") else rel[:-5])
        pages[rel] = (url, True)
    for rel, (url, english) in pages.items():
        path = root / rel
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        # Only pages whose language toggle has actually been removed.
        if re.search(r'<script[^>]+src=["\'][^"\']*/js/lang\.js', text):
            continue
        out = finish_markup(text, root, english=english).replace("AI Ataka", "AI ATAKA")
        if english:
            out = finish_text_labels(out)
            out = finish_faq(out, SITE + url)
            out = finish_breadcrumbs(out, root)
            out = finish_schema_names(out, root)
            out = finish_product_schema(out, rel)
        if out != text:
            changed.append(rel)
            if apply:
                path.write_text(out, encoding="utf-8")
    return changed


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    changed = finalize(apply=args.apply)
    print(f"split_pages_requiring_finalization={len(changed)}")
    if args.check:
        raise SystemExit(bool(changed))
