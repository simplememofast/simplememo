#!/usr/bin/env python3
"""Maintain the shared site chrome without rewriting page content.

Run --write after adding pages, or --check in CI. Existing destinations,
locale controls, analytics identities and footer link groups remain intact.
The standalone Memo Inbox app and transactional/error pages are excluded.
"""
from pathlib import Path
from html.parser import HTMLParser
import argparse
import hashlib
import re
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY_NAV_HASHES = {'819e1ccab4904eec4087983fd8c627ae6697a5c4d8be7e37e51d2a832d2b5d47', '6964d51af27f64b1c9e550081764a9b45be93aaf11c65c0090452fef09dcbe1b', 'e0b42976d9f50f5556a7e736778a8045cdb4c51e1d23da48f990775143aac214', 'fbee48f90f2ab147491909454cbbf56a7af5ce4b02d05f006f53cb13ada361ed', '1378be4ab4d6fdfd34e55913673b57ff15f255d7b293652df1fb852048d26681'}
CSS = "assets/css/site-chrome.css"
JS = "js/site-chrome.js"

class Elements(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.source = source
        self.offsets = [0]
        for m in re.finditer("\n", source): self.offsets.append(m.end())
        self.stack, self.elements = [], []
        self.feed(source)
    def handle_starttag(self, tag, attrs):
        start = self.offsets[self.getpos()[0]-1] + self.getpos()[1]
        if tag in {"head", "body", "nav", "header", "footer", "a", "button", "script", "ul"}:
            self.stack.append((tag, dict(attrs), start, start+len(self.get_starttag_text())))
    def handle_endtag(self, tag):
        end = self.offsets[self.getpos()[0]-1] + self.getpos()[1] + len(tag)+3
        for i in range(len(self.stack)-1, -1, -1):
            if self.stack[i][0] == tag:
                self.elements.append((*self.stack.pop(i), end))
                break

def has(el, cls): return cls in el[1].get("class", "").split()
def asset(path):
    return "/"+path+"?v="+hashlib.sha256((ROOT/path).read_bytes()).hexdigest()[:10]
def brand(home, ja, footer=False):
    name, sub = ("シンプルメモ", "Obsidian連携") if ja else ("Simple Memo", "for Obsidian")
    size = 48 if footer else 36
    return f'<a class="site-brand" href="{home}"><img src="/assets/img/app-icon-56.png" width="{size}" height="{size}" alt="" loading="{"lazy" if footer else "eager"}"><span><small>{sub}</small><strong>{name}</strong></span></a>'
def intro(home, ja):
    heading = "思いついたことを、次の一歩へ。" if ja else "A small note. A next step."
    copy = "Obsidianとメールに、メモを送るiPhoneアプリ。" if ja else "Send notes from your iPhone to Obsidian and email."
    return f'<div class="site-footer-intro" lang="{"ja" if ja else "en"}" dir="ltr">{brand(home,ja,True)}<div><p class="site-footer-title">{heading}</p><p class="site-footer-description">{copy}</p></div></div>'

def before_close(source, tag, snippet):
    element=next(e for e in Elements(source).elements if e[0]==tag)
    pos=element[4]-len(tag)-3
    return source[:pos].rstrip()+"\n"+snippet+"\n"+source[pos:]

def transform(source, rel):
    if rel.startswith(("memo-inbox/", "fixtures/", "admin/", "docs/")): return source
    # Rebuild managed pieces so later design updates have one source of truth.
    source = re.sub(r'<!-- site-chrome:bootstrap -->.*?<!-- /site-chrome:bootstrap -->', '', source, flags=re.S)
    source = re.sub(r'<!-- site-chrome:quick -->.*?<!-- /site-chrome:quick -->', '', source, flags=re.S)
    source = re.sub(r'<!-- site-chrome:intro -->.*?<!-- /site-chrome:intro -->', '', source, flags=re.S)
    source = re.sub(r'\s*<link rel="stylesheet" href="/assets/css/site-chrome.css[^"]*">', '', source)
    source = re.sub(r'\s*<script src="/js/site-chrome.js[^"]*"[^>]*></script>', '', source)
    els = Elements(source).elements
    nav = next((e for e in els if has(e,"global-nav")), None)
    header = nav or next((e for e in els if e[0]=="header" and (has(e,"resource-nav") or rel.startswith("obsidian/"))), None)
    footer = next((e for e in els if e[0]=="footer"),None)
    if not header and not footer: return source
    ja = bool(re.search(r'<html[^>]*lang="ja"',source))
    home = "/" if ja else "/en/"
    changes=[]
    if header:
        changes.append((header[2],header[3],re.sub(r' data-site-header=""','',source[header[2]:header[3]])[:-1]+' data-site-header="">'))
        logo = next((e for e in els if e[0]=="a" and header[2]<e[2]<header[4] and (has(e,"global-nav__logo") or has(e,"resource-brand") or has(e,"brand") or has(e,"site-brand"))),None)
        if not logo and not nav:
            logo=next((e for e in sorted(els,key=lambda e:e[2]) if e[0]=="a" and header[2]<e[2]<header[4]),None)
        if logo:
            home=logo[1].get("href",home)
            # Keep the legacy selector for existing layout hooks.
            cls='global-nav__logo site-brand' if nav else 'site-brand'
            changes.append((logo[2],logo[4],brand(home,ja).replace('class="site-brand"',f'class="{cls}"')))
    if nav:
        menu = next((e for e in els if e[1].get("id")=="navLinks"),None)
        toggle = next((e for e in els if has(e,"global-nav__hamburger")),None)
        if menu and toggle:
            label="メニュー" if ja else "Explore"
            links=[e for e in els if e[0]=="a" and menu[2]<e[2]<menu[4] and "data-cta-placement" not in e[1]][:3]
            quick=''.join(source[e[2]:e[4]] for e in sorted(links,key=lambda e:e[2]))
            changes.append((menu[2],menu[2],f'<!-- site-chrome:quick --><div class="site-quick-links">{quick}</div><!-- /site-chrome:quick -->'))
            changes.append((toggle[2],toggle[4],f'<button type="button" class="global-nav__hamburger" aria-controls="navLinks" aria-expanded="false" aria-label="{label}"><span>{label}</span><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 8h16"/><path d="M4 16h16"/></svg></button>'))
            # These legacy scripts contain only the old navigation handler.
            for e in els:
                if e[0]=="script" and "src" not in e[1]:
                    code=source[e[3]:e[4]-9]
                    if hashlib.sha256(code.encode()).hexdigest() in LEGACY_NAV_HASHES:
                        start=source.rfind("\n",0,e[2])+1
                        if source[start:e[2]].strip(): start=e[2]
                        changes.append((start,e[4],""))
                    elif "navLinks" in code or "global-nav__hamburger" in code:
                        raise ValueError(f"Unrecognized navigation script in {rel}; review it before replacing the handler")
    if footer:
        changes.append((footer[2],footer[3],re.sub(r' data-site-footer=""','',source[footer[2]:footer[3]])[:-1]+' data-site-footer="">'))
        for e in els:
            if (has(e,"capture-footer-brand") or has(e,"lpr-footer-brand")) and footer[2]<e[2]<footer[4]: changes.append((e[2],e[4],""))
        changes.append((footer[3],footer[3],'<!-- site-chrome:intro -->'+intro(home,ja)+'<!-- /site-chrome:intro -->'))
    for start,end,value in sorted(changes,reverse=True): source=source[:start]+value+source[end:]
    assets=f'<link rel="stylesheet" href="{asset(CSS)}">'
    if nav:
        bootstrap="<!-- site-chrome:bootstrap --><script>document.documentElement.classList.add('site-chrome-js');</script><!-- /site-chrome:bootstrap -->"
        fallback="document.documentElement.classList.remove('site-chrome-js')"
        assets=bootstrap+"\n"+assets+f'\n<script src="{asset(JS)}" defer onerror="{fallback}"></script>'
    source=before_close(source,"head",assets)
    return source

def selftest():
    import unittest
    class ChromeTests(unittest.TestCase):
        def fixture(self):
            return '''<html lang="ja"><head><title>Test</title><script type="application/ld+json">{"x":1}</script></head><body><nav class="global-nav"><a class="global-nav__logo" href="/">Old</a><ul id="navLinks"><li><a href="/guides/">Guide</a></li><li class="nav-cta-mobile"><a href="https://apps.apple.com/?ct=original&amp;ppid=original" data-cta-placement="nav">Get</a></li></ul><button class="global-nav__hamburger" onclick="old()">Menu</button></nav><main><h1>Content</h1><details><summary>Question</summary>Answer</details></main><footer class="footer"><nav><a href="/privacy">Privacy</a></nav></footer><script>
  // Close mobile nav when clicking a link
  document.querySelectorAll('#navLinks a').forEach(function(a){
    a.addEventListener('click', function(){ document.getElementById('navLinks').classList.remove('open'); });
  });
  </script></body></html>'''
        def test_idempotence(self):
            once=transform(self.fixture(),"index.html")
            self.assertEqual(once,transform(once,"index.html"))
        def test_comment_is_not_a_head_close(self):
            before=self.fixture().replace('<title>', '<!-- insert before </head> -->\n<title>')
            after=transform(before,"index.html")
            self.assertIn('<!-- insert before </head> -->',after)
            self.assertEqual(after.count('<link rel="stylesheet"'),1)
            self.assertTrue(after.index('/assets/css/site-chrome.css') > after.index('</script>'))
        def test_content_and_tracking(self):
            before=self.fixture(); after=transform(before,"index.html")
            for pattern in [r'<main>.*?</main>',r'<script type="application/ld\+json">.*?</script>',r'<a href="https://apps.apple.com/.*?</a>']:
                self.assertEqual(re.findall(pattern,before),re.findall(pattern,after))
            self.assertIn('<a href="/privacy">Privacy</a>',after)
        def test_legacy_script_replaced(self):
            after=transform(self.fixture(),"index.html")
            self.assertNotIn('onclick="old()"',after)
            self.assertNotIn("document.querySelectorAll",after)
            self.assertEqual(after.count('/js/site-chrome.js?'),1)
        def test_nested_nav_and_footer(self):
            after=transform(self.fixture(),"index.html")
            self.assertEqual(after.count('data-site-footer=""'),1)
            self.assertEqual(after.count('site-chrome:intro -->'),2)
        def test_locale_and_excluded_app(self):
            before=self.fixture()
            self.assertEqual(before,transform(before,"memo-inbox/index.html"))
            en=transform(before.replace('lang="ja"','lang="en"'),"en/index.html")
            self.assertIn('A small note. A next step.',en)
            self.assertNotIn('思いついたこと',en)
        def test_unrelated_script_kept(self):
            before=self.fixture().replace('</script></body>', 'window.paymentFormReady = true;</script></body>')
            with self.assertRaisesRegex(ValueError, 'Unrecognized navigation script'):
                transform(before,"index.html")
    return 0 if unittest.TextTestRunner().run(unittest.defaultTestLoader.loadTestsFromTestCase(ChromeTests)).wasSuccessful() else 1

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write",action="store_true"); mode.add_argument("--check",action="store_true"); mode.add_argument("--selftest",action="store_true")
    args=parser.parse_args()
    if args.selftest: return selftest()
    files=subprocess.check_output(["git","ls-files","*.html"],cwd=ROOT,text=True).splitlines()
    changed=[]
    for rel in files:
        path=ROOT/rel; old=path.read_text(); new=transform(old,rel)
        if new!=old:
            changed.append((rel,new))
    if args.write:
        for rel,new in changed: (ROOT/rel).write_text(new)
    print(f"Shared chrome: {len(changed)} {'updated' if args.write else 'stale'} pages")
    if changed and not args.write:
        print("\n".join(rel for rel,new in changed)); return 1
    return 0

if __name__=="__main__": raise SystemExit(main())
