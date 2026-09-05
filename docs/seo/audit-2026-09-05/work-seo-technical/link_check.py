#!/usr/bin/env python3
"""Resolve every internal <a href>, <img src>, <source srcset>, <link rel=preload href>, <link rel=stylesheet>, <script src> in the checkout."""
import re,os,glob,collections,sys
from urllib.parse import urlparse, unquote
from bs4 import BeautifulSoup
W="/private/tmp/claude-501/-Users-hajimeataka-simplememo/94e79856-0565-4e19-bb64-c1132a529dfe/scratchpad/wt"
os.chdir(W)
files=[f for f in glob.glob("**/*.html",recursive=True) if not f.startswith(("node_modules/","docs/","fixtures/","scripts/","tools/","growth/",".git/"))]
RETIRED={"/blog/captio-alternatives-comparison":"/captio-alternative/","/blog/line-keep-migration":"/blog/line-keep-alternative","/blog/memo-app-free-guide":"/blog/free-memo-apps-ranking","/blog/memo-shuukan-tips":"/blog/memo-habit","/devlog/captio-alternative":"/captio-alternative/","/en/blog/why-captio-died":"/en/captio-alternative/","/privacy-policy":"/privacy","/privacy-policy/":"/privacy","/vs/whatsapp/":"/vs/","/vs/telegram/":"/vs/","/vs/trello/":"/vs/","/vs/mem/":"/vs/","/vs/slack-self-dm/":"/vs/","/)":"/","/%29":"/"}
GONE={"/blog/offline-first-outbox-teardown","/blog/email-inbox-as-task-manager","/blog/energy-budget-field-notes","/blog/ios-cold-start-1-4s-to-287ms","/blog/i-was-wrong-about-todo-debt","/blog/no-third-party-deps-ios-18-months"}
def exists(path):
    """Mimic Pages static resolution for an absolute site path."""
    p=unquote(path)
    if p.endswith("/"):
        return os.path.isfile(p.lstrip("/")+"index.html") or (p=="/" )
    q=p.lstrip("/")
    if os.path.isfile(q): return True
    if os.path.isfile(q+".html"): return True
    if os.path.isdir(q) and os.path.isfile(q+"/index.html"): return "dir-noslash"  # Pages 308s to trailing slash
    return False
def classify(href,src):
    h=href.strip()
    if not h or h.startswith(("#","mailto:","tel:","javascript:","sms:","data:")): return "skip",None
    if h.startswith("//"): return "protocol-relative",h
    u=urlparse(h)
    if u.scheme in ("http","https"):
        if u.netloc not in ("simplememofast.com","www.simplememofast.com"): return "external",None
        path=u.path or "/"
        if u.netloc=="www.simplememofast.com": return "www-internal",path
        return "abs-internal",path
    if u.scheme: return "external",None
    # relative or root-relative
    if h.startswith("/"): path=u.path
    else:
        base="/"+os.path.dirname(src);
        if not base.endswith("/"): base+="/"
        path=os.path.normpath(base+u.path) if u.path else "/"+src
        if u.path.endswith("/") and not path.endswith("/"): path+="/"
    return "internal",path
res=collections.Counter(); bad=[]; www=[]; query=[]; html_ext=[]; retired=[]; gone=[]; noslash=[]; frag=collections.Counter()
img_bad=[]; pre_bad=[]; pre_unused=[]; css_bad=[]; js_bad=[]
for f in files:
    s=BeautifulSoup(open(f,encoding="utf-8").read(),"html.parser")
    body=open(f,encoding="utf-8").read()
    for a in s.find_all("a",href=True):
        kind,path=classify(a["href"],f); res[kind]+=1
        if kind in("internal","abs-internal","www-internal","protocol-relative"):
            if kind=="www-internal": www.append((f,a["href"]))
            if kind=="protocol-relative": bad.append((f,a["href"],"protocol-relative")); continue
            u=urlparse(a["href"])
            if u.query: query.append((f,a["href"]))
            if path.endswith(".html") and not path.endswith("/404.html"): html_ext.append((f,a["href"]))
            core=path[:-5] if path.endswith(".html") and path!="/404.html" else path
            if core.endswith("/index"): core=core[:-5]
            if core in RETIRED: retired.append((f,a["href"])); continue
            if core in GONE: gone.append((f,a["href"])); continue
            e=exists(core)
            if e=="dir-noslash": noslash.append((f,a["href"]))
            elif not e: bad.append((f,a["href"],kind))
    for im in s.find_all("img"):
        for attr in ("src","data-src"):
            v=im.get(attr)
            if v and not v.startswith(("http","data:","//")):
                kind,path=classify(v,f)
                if kind=="internal" and not os.path.isfile(unquote(path).lstrip("/")): img_bad.append((f,v))
        ss=im.get("srcset")
        if ss:
            for part in ss.split(","):
                v=part.strip().split()[0] if part.strip() else ""
                if v and not v.startswith(("http","data:")):
                    kind,path=classify(v,f)
                    if kind=="internal" and not os.path.isfile(unquote(path).lstrip("/")): img_bad.append((f,v))
    for so in s.find_all("source"):
        ss=so.get("srcset") or so.get("src") or ""
        for part in ss.split(","):
            v=part.strip().split()[0] if part.strip() else ""
            if v and not v.startswith(("http","data:")):
                kind,path=classify(v,f)
                if kind=="internal" and not os.path.isfile(unquote(path).lstrip("/")): img_bad.append((f,v))
    for l in s.find_all("link"):
        rel=l.get("rel") or []; h=l.get("href") or ""
        if "preload" in rel and h and not h.startswith("http"):
            p=urlparse(h).path
            if not os.path.isfile(p.lstrip("/")): pre_bad.append((f,h))
            else:
                # used? font: referenced in some css loaded or inline; image: appears in body outside the preload tag
                fname=os.path.basename(p)
                occurrences=body.count(fname)
                if l.get("as")=="font":
                    css_ok=any("style.min.css" in (c.get("href") or "") for c in s.find_all("link") if "stylesheet" in (c.get("rel") or []))
                    inline_ff="@font-face" in body
                    if not css_ok and not inline_ff: pre_unused.append((f,h,"font, no @font-face and no style.min.css"))
                elif occurrences<2: pre_unused.append((f,h,f"as={l.get('as')} referenced only in preload"))
        if "stylesheet" in rel and h and not h.startswith("http"):
            if not os.path.isfile(urlparse(h).path.lstrip("/")): css_bad.append((f,h))
    for sc in s.find_all("script",src=True):
        h=sc["src"]
        if not h.startswith(("http","//")) and not os.path.isfile(urlparse(h).path.lstrip("/")): js_bad.append((f,h))
print("files:",len(files)); print("href kinds:",res)
print("\nBROKEN internal <a href>:",len(bad)); [print("  ",b) for b in bad[:60]]
print("\nwww-internal hrefs:",len(www)); [print("  ",b) for b in www[:20]]
print("\nhrefs with query strings:",len(query)); [print("  ",b) for b in query[:40]]
print("\nhrefs ending .html (would 301 via middleware):",len(html_ext)); [print("  ",b) for b in html_ext[:40]]
print("\nhrefs to RETIRED paths (301):",len(retired)); [print("  ",b) for b in retired[:40]]
print("\nhrefs to GONE (410):",gone)
print("\nhrefs to dir without trailing slash (308):",len(noslash)); [print("  ",b) for b in noslash[:40]]
print("\nIMG/SOURCE missing files:",len(img_bad)); [print("  ",b) for b in img_bad[:60]]
print("\nPRELOAD target missing:",pre_bad)
print("\nPRELOAD unused:",len(pre_unused)); [print("  ",b) for b in pre_unused]
print("\nCSS missing:",css_bad); print("JS missing:",js_bad)
