#!/usr/bin/env python3
"""Apply the shared reading design to public HTML, preserving copy and scripts.

The migration adds layout wrappers around existing headings, never rewrites their
contents, and leaves enhanced pages and interactive applications structurally intact.
Run --write after adding a page; --check reports missing or outdated design assets.
"""
from html import escape, unescape
from html.parser import HTMLParser
from pathlib import Path
import argparse
import hashlib
import re
import subprocess

ROOT = Path(__file__).resolve().parent.parent
VOID = set('area base br col embed hr img input link meta param source track wbr'.split())
ASSETS = ['assets/css/capture-editorial.css', 'assets/css/capture-content.css', 'assets/css/site-design.css']

class Node:
    def __init__(self, tag, attrs, start, inner, parent=None):
        self.tag, self.attrs, self.start, self.inner = tag, dict(attrs), start, inner
        self.close, self.end, self.parent, self.children = inner, inner, parent, []
    def has(self, name): return name in self.attrs.get('class','').split()
    def within(self, node): return node.start < self.start < node.end

class Document(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.source, self.nodes, self.stack = source, [], []
        self.lines = [0] + [m.end() for m in re.finditer('\n',source)]
        self.feed(source)
    def position(self): return self.lines[self.getpos()[0]-1]+self.getpos()[1]
    def handle_starttag(self, tag, attrs):
        start=self.position(); parent=self.stack[-1] if self.stack else None
        n=Node(tag,attrs,start,start+len(self.get_starttag_text()),parent)
        self.nodes.append(n)
        if parent: parent.children.append(n)
        if tag not in VOID: self.stack.append(n)
    def handle_startendtag(self,tag,attrs):
        self.handle_starttag(tag,attrs)
        if tag not in VOID: self.stack.pop()
    def handle_endtag(self,tag):
        for i in range(len(self.stack)-1,-1,-1):
            if self.stack[i].tag==tag:
                n=self.stack[i];n.close=self.position();n.end=n.close+len(tag)+3
                del self.stack[i:];break

def text(source,node):
    return re.sub(r'\s+',' ',unescape(re.sub(r'<[^>]+>',' ',source[node.inner:node.close]))).strip()

def transform(source,rel):
    if rel.startswith(('admin/','docs/','fixtures/')): return source
    doc=Document(source);nodes=doc.nodes
    body=next((n for n in nodes if n.tag=='body'),None)
    head=next((n for n in nodes if n.tag=='head'),None)
    if not body or not head: return source
    changes=[];attrs={};inserts={}
    def add(pos,value): inserts[pos]=inserts.get(pos,'')+value
    def attr(n,key,value): attrs.setdefault(n.start,(n,{}))[1][key]=value
    def cls(n,*values):
        current=attrs.get(n.start,(n,{}))[1].get('class',n.attrs.get('class','')).split()
        attr(n,'class',' '.join(dict.fromkeys(current+list(values))))
    cls(body,'site-designed')
    main=next((n for n in nodes if n.tag=='main'),None)
    refined=any(body.has(x) for x in ['capture-full','capture-home','capture-editorial'])
    home=rel in ['index.html','en/index.html','ar/index.html','es/index.html','id/index.html','ko/index.html','pt-BR/index.html','tr/index.html','zh-Hant/index.html','zh/index.html']
    utility=not main or rel.startswith('memo-inbox/')
    family=body.attrs.get('data-design-family') or ('refined' if refined else ('home' if home else 'utility' if utility else 'reading'))
    attr(body,'data-design-family',family)
    ja=next((n.attrs.get('lang') for n in nodes if n.tag=='html'),None)=='ja'
    if not refined and not utility:
        if home:
            cls(body,'capture-home','capture-full')
            for n in main.children:
                if n.tag=='section' and not n.has('hero'): cls(n,'ce-home-section')
        else:
            cls(body,'capture-editorial','capture-full','site-reading')
            if not body.attrs.get('data-design-family'):
                # Collect section headings before adding navigation; preserve existing IDs.
                headings=[n for n in nodes if n.tag=='h2' and n.within(main) and not any(p.has('article-toc') for p in ancestors(n))]
                used={n.attrs['id'] for n in nodes if 'id' in n.attrs}
                for i,h in enumerate(headings,1):
                    if not h.attrs.get('id'):
                        id_=f'reading-{i:02d}'
                        while id_ in used: id_+='-section'
                        attr(h,'id',id_); used.add(id_)
                    if not re.match(r'^(?:(?:Step|STEP|ステップ)\s*)?[0-9０-９]+\s*[.．、):：）]|^第[0-9０-９一二三四五六七八九十]+[章条]',text(source,h)):
                        attr(h,'data-ce-number',f'{i:02d}')
                hero=next((n for n in nodes if n.has('lp-hero') and n.within(main)),None)
                if hero:
                    cls(hero,'sd-hero')
                    media=[n for n in nodes if n.tag in ['img','video'] and n.within(hero) and not any(a.tag=='a' and 'apps.apple.com' in a.attrs.get('href','') for a in ancestors(n)) and (n.tag=='video' or n.has('hero-graphic') or (n.attrs.get('width','').isdigit() and int(n.attrs['width'])>=320))]
                    has_media=bool(media)
                    for image in media: cls(image,'sd-hero-media')
                    if has_media: cls(hero,'sd-hero--media')
                    elif headings:
                        add(hero.inner,'<div class="sd-hero-copy">')
                        links=[]
                        for i,h in enumerate(headings[:3],1):
                            id_=attrs.get(h.start,(h,{}))[1].get('id',h.attrs.get('id'))
                            links.append(f'<a href="#{escape(id_,quote=True)}"><span aria-hidden="true">{i:02d}</span><span>{escape(text(source,h))}</span><span aria-hidden="true">↗</span></a>')
                        label='このページの内容' if ja else 'On this page'
                        add(hero.close,'</div><nav class="sd-hero-index" aria-label="'+label+'"><p>'+label+'</p>'+''.join(links)+'</nav>')
                else:
                    h1=next((n for n in nodes if n.tag=='h1' and n.within(main)),None)
                    if h1: cls(h1,'sd-title')
                # Existing sections get a heading lane and a generous reading column.
                # Generated reports, forms and application state remain untouched.
                managed=rel in ['autopilot/index.html','en/autopilot/index.html']
                for h in headings:
                    if managed: break
                    p=h.parent
                    if not p or p.tag not in ['section','div'] or p.has('article-toc'):continue
                    is_section=p.tag=='section' or (p.has('container') and p.parent and p.parent.tag=='section')
                    if not is_section or any(x.tag not in ['h2'] and x.start<h.start for x in p.children):continue
                    if any(a.has('ce-chapter') or 'ce-chapter' in attrs.get(a.start,(a,{}))[1].get('class','').split() for a in ancestors(p)):continue
                    cls(p,'ce-chapter','sd-chapter')
                    if any(n.within(p) and (n.tag in ['table','pre','figure'] or any(n.has(c) for c in ['reason-cards','hub-cards','tool-grid','template-index','app-grid','comparison-grid','guide-cards','blog-grid'])) for n in nodes):cls(p,'ce-chapter--wide')
                    add(h.start,'<div class="ce-chapter__head">')
                    add(h.end,'</div><div class="ce-chapter__body">')
                    add(p.close,'</div>')
                # Keep real table semantics instead of turning every mobile row into cards.
                for t in [n for n in nodes if n.tag=='table' and n.within(main)]:
                    p=t.parent
                    if p and p.tag=='div' and len(p.children)==1:
                        cls(p,'sd-table');attr(p,'tabindex','0');attr(p,'role','region')
                        if not (p.attrs.get('aria-label') or p.attrs.get('aria-labelledby')):attr(p,'aria-label','横にスクロールできる表' if ja else 'Scrollable table')
                    else:
                        label='横にスクロールできる表' if ja else 'Scrollable table'
                        add(t.start,'<div class="sd-table" tabindex="0" role="region" aria-label="'+label+'">');add(t.end,'</div>')
                for n in nodes:
                    if (n.tag=='pre' or n.has('arch-diagram')) and n.within(main) and 'tabindex' not in n.attrs:attr(n,'tabindex','0')
    if main:
        for n in nodes:
            if n.within(main) and (n.has('arch-diagram') or n.has('shot-strip')) and 'tabindex' not in n.attrs:
                attr(n,'tabindex','0')
            # Existing ordered instructions already supply their own numbering.
            if n.tag=='h2' and 'data-ce-number' in n.attrs and re.match(r'^(?:(?:Step|STEP|ステップ)\s*)?[0-9０-９]+\s*[.．、):：）]|^第[0-9０-９一二三四五六七八九十]+[章条]',text(source,n)):
                attr(n,'data-ce-number',None)
            if n.has('guide-cards') or n.has('blog-grid'):
                chapter=next((a for a in ancestors(n) if a.has('sd-chapter')),None)
                if chapter:cls(chapter,'ce-chapter--wide')
    # Add a single family-independent finishing layer; existing assets stay in place.
    needed=ASSETS if family in ['reading','home'] else [ASSETS[-1]]
    for asset in needed:
        href='/'+asset+'?v='+hashlib.sha256((ROOT/asset).read_bytes()).hexdigest()[:10]
        existing=next((n for n in nodes if n.tag=='link' and n.attrs.get('href','').split('?')[0]=='/'+asset),None)
        if existing: attr(existing,'href',href)
        elif 'data-perf-source="/'+asset+'"' not in source: add(head.close,'<link rel="stylesheet" href="'+href+'">\n')
    for n,updates in attrs.values():
        old=source[n.start:n.inner]
        for key,value in updates.items():
            pattern=r'\b'+re.escape(key)+r'=("[^"]*"|\x27[^\x27]*\x27)'
            if value is None:
                old=re.sub(r'\s+'+pattern,'',old,count=1)
                continue
            replacement=key+'="'+escape(value,quote=True)+'"'
            if re.search(pattern,old): old=re.sub(pattern,lambda _:replacement,old,count=1)
            else: old=old[:-1]+' '+replacement+'>'
        changes.append((n.start,n.inner,old))
    changes.extend((pos,pos,value) for pos,value in inserts.items())
    for start,end,value in sorted(changes,key=lambda x:(x[0],x[1]),reverse=True):source=source[:start]+value+source[end:]
    return source

def ancestors(node):
    p=node.parent
    while p:
        yield p;p=p.parent

def selftest():
    import unittest
    class DesignTests(unittest.TestCase):
        def fixture(self, lang='en'):
            return '<html lang="'+lang+'"><head><link rel="alternate" hreflang="ja" href="/ja/"></head><body><main class="page-content"><div class="container"><div class="lp-hero"><h1>Original title</h1><a href="https://apps.apple.com/app?ct=original" data-cta-placement="hero"><img src="badge.svg" width="140"></a></div><section><h2>First section</h2><p>Original answer</p><section><h2>Nested section</h2><p>Still original</p></section></section><section><h2>Second section</h2><table><tr><td>Original cell</td></tr></table></section></div></main><script>const text = "<h2>not markup</h2>";</script></body></html>'
        def test_idempotence(self):
            once=transform(self.fixture(),'example/index.html')
            self.assertEqual(once,transform(once,'example/index.html'))
        def test_document_language_not_alternate_link(self):
            output=transform(self.fixture(),'en/example/index.html')
            self.assertIn('aria-label="On this page"',output)
            self.assertNotIn('このページの内容',output)
            self.assertIn('このページの内容',transform(self.fixture('ja'),'example/index.html'))
        def test_no_nested_chapter_grid(self):
            output=transform(self.fixture(),'example/index.html')
            self.assertEqual(output.count('class="ce-chapter sd-chapter'),2)
        def test_script_tracking_and_existing_text(self):
            source=self.fixture();output=transform(source,'example/index.html')
            for pattern in [r'<script>.*?</script>',r'<a href="https://apps.apple.com.*?</a>']:
                self.assertEqual(re.findall(pattern,source),re.findall(pattern,output))
            for copy in ['Original title','Original answer','Still original','Original cell']:
                self.assertIn(copy,output)
        def test_scrollable_table_and_badge(self):
            output=transform(self.fixture(),'example/index.html')
            self.assertIn('class="sd-table" tabindex="0" role="region"',output)
            self.assertNotIn('sd-hero--media',output)
        def test_private_pages_excluded(self):
            self.assertEqual(self.fixture(),transform(self.fixture(),'admin/index.html'))
        def test_authored_numbering_is_not_duplicated(self):
            output=transform(self.fixture().replace('First section','4. Existing step'),'example/index.html')
            heading=next(n for n in Document(output).nodes if n.tag=='h2')
            self.assertNotIn('data-ce-number',heading.attrs)
    return 0 if unittest.TextTestRunner().run(unittest.defaultTestLoader.loadTestsFromTestCase(DesignTests)).wasSuccessful() else 1

def main():
    parser=argparse.ArgumentParser(description=__doc__);group=parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--write',action='store_true');group.add_argument('--check',action='store_true');group.add_argument('--selftest',action='store_true')
    args=parser.parse_args()
    if args.selftest:return selftest()
    changed=[]
    for rel in subprocess.check_output(['git','ls-files','*.html'],cwd=ROOT,text=True).splitlines():
        p=ROOT/rel;old=p.read_text();new=transform(old,rel)
        if old!=new:
            changed.append(rel)
            if args.write:p.write_text(new)
    print(f'Page design: {len(changed)} '+('updated' if args.write else 'stale')+' pages')
    if changed and not args.write:print('\n'.join(changed));return 1
    return 0

if __name__=='__main__':raise SystemExit(main())
