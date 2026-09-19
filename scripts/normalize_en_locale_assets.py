#!/usr/bin/env python3
"""Normalize locale-specific links/assets/shared chrome on public EN pages."""
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parent.parent

TEXT={
    '使い方':'Guides',
    '活用事例':'Use Cases',
    '比較':'Compare',
    'メソッド':'Methods',
    'ブログ':'Blog',
    '用語集':'Glossary',
    '開発者':'About',
    '開発記録':'Dev Log',
    'ダウンロード':'Download',
    'プロダクト':'Product',
    'ホーム':'Home',
    '設定ガイド':'Setup Guides',
    'テンプレ':'Templates',
    '比較・乗り換え':'Compare & Switch',
    'Captio代替':'Captio Alternatives',
    'メモ→メール':'Note to Email',
    'アプリ比較':'App Comparisons',
    '読みもの':'Learn',
    'について':'About',
    'サポート':'Support',
    '公開ロードマップ':'Public Roadmap',
    'プライバシー':'Privacy',
    'お問い合わせ':'Contact',
}
EXTRA_EXACT={
 'Obsidian連携シンプルメモ — App Store':'Simple Memo - for Obsidian — App Store',
 'ショートカットユーザガイド（Apple）':'Shortcuts User Guide (Apple)',
 'git-merge — Git公式ドキュメント':'git-merge — official Git documentation',
 'Logseq 2.0.1 リリースノート':'Logseq 2.0.1 release notes',
 'Obsidian Sync（公式）':'Obsidian Sync (official)',
 'Obsidian — Download（公式）':'Obsidian — Download (official)',
 'Obsidian Help（公式ヘルプ）':'Obsidian Help (official)',
 'Obsidian — Pricing（公式）':'Obsidian — Pricing (official)',
 'Obsidian ヘルプ — デバイス間でノートを同期する（日本語版）':'Obsidian Help — Sync notes between devices (Japanese version)',
 'Simple Memo - for Obsidianの開発者。本記事は開発元による測定記録の解説です。機能・測定条件・訂正履歴を確認できる形で掲載しています。':
   'Written by the developer of Simple Memo - for Obsidian. This article explains measurements published by the developer, with test conditions, feature details, and correction history.',
 'Obsidian InboxのMarkdownと日次レビュー用ひな形':'Markdown template for an Obsidian Inbox and daily review',
 'iPhoneから保管庫へ追記する手順':'How to append to your vault from iPhone',
 'ObsidianでPARAを実装する：4フォルダ・内部リンク・Archive移動の実画面':'Implement PARA in Obsidian: four folders, internal links, and archive moves (Japanese)',
}
EXACT={
 '© 2026 Obsidian連携シンプルメモ（Simple Memo - for Obsidian） / 運営: 株式会社ユリカ':
   '© 2026 Simple Memo - for Obsidian / Yurika Inc.',
 'Obsidian連携シンプルメモ開発者。iOS開発歴10年以上。Captio終了をきっかけに「起動0.4秒・メモ→メール特化」のシンプルメモを開発。プライバシーファースト設計（端末内 Outbox / 履歴の AES-GCM 暗号化、メール本文の恒常保存なし）を信条とする。':
   'Developer of Simple Memo - for Obsidian, an iOS quick-capture app focused on fast note-to-email workflows, with an on-device Outbox, AES-GCM-encrypted history, and no persistent storage of memo bodies by the relay.',
 'Captio利用者向けの紹介・検証資料':'Reference and verification material for former Captio users',
 'Obsidian Inbox用Markdownを試す':'Try the Markdown template for an Obsidian inbox',
}
changed=0
for p in (ROOT/'en').rglob('*.html'):
    s=p.read_text(encoding='utf-8')
    out=s.replace('https://apps.apple.com/jp/','https://apps.apple.com/us/')
    out=out.replace('ct=jp__','ct=en__')
    out=out.replace('/assets/img/app-store-badge-ja.svg','/assets/img/app-store-badge-en.svg')
    out=out.replace('App Store からダウンロード','Download on the App Store')
    for ja,en in EXTRA_EXACT.items(): out=out.replace(ja,en)
    for ja,en in EXACT.items(): out=out.replace(ja,en)
    for ja,en in TEXT.items():
        out=re.sub(rf'(?<=>){re.escape(ja)}(?=<)',en,out)
    # One legacy EN devlog page used the page title as h2.
    if p.as_posix().endswith('/en/devlog/day1.html'):
        out=out.replace('<h2 class="page-content__title">','<h1 class="page-content__title">',1)
        title='[Dev Log Day 1] Loved Captio So Much, I Had to Recreate That Experience'
        out=out.replace(title+'</h2>',title+'</h1>',1)
    if out!=s:
        p.write_text(out,encoding='utf-8'); changed+=1
print(f'normalized_en_locale_files={changed}')
