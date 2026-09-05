#!/usr/bin/env python3
"""seo-schema census + validation over live crawl bodies, mapped to wt/ source lines."""
import json, re, os, sys, glob, unicodedata
from collections import Counter, defaultdict
from bs4 import BeautifulSoup, Comment

S = '/private/tmp/claude-501/-Users-hajimeataka-simplememo/94e79856-0565-4e19-bb64-c1132a529dfe/scratchpad'
WT = S + '/wt'; PAGES = S + '/crawl/pages'; W = S + '/work-seo-schema'
CONST = json.load(open(WT + '/data/site-constants.json'))

# ---- crawl records
crawl = {}
for line in open(S + '/crawl/crawl.jsonl'):
    r = json.loads(line); crawl[r['url']] = r
def fname_for(url):
    p = url.replace('https://simplememofast.com', '').strip('/')
    return 'root.html' if p == '' else p.replace('/', '_') + '.html'
url_by_file = {fname_for(u): u for u in crawl}
sitemap = dict(l.rstrip('\n').split('\t') for l in open(W + '/sitemap_lastmod.tsv'))
live_ok = {u for u, r in crawl.items() if r.get('status') == 200 and r.get('final_url') == u} | set(sitemap)

def wt_path(fname):
    if fname == 'root.html': return 'index.html'
    p = fname[:-5].replace('_', '/')
    for c in (p + '/index.html', p + '.html'):
        if os.path.exists(os.path.join(WT, c)): return c
    return None

QMAP = {'“': '"', '”': '"', '‘': "'", '’': "'", '—': '-', '–': '-', ' ': ' ', '‑': '-', '−': '-'}
def norm(s):
    s = unicodedata.normalize('NFKC', s or '')
    s = ''.join(QMAP.get(c, c) for c in s)
    s = re.sub(r'\s+', '', s).lower()
    s = s.replace('"', '').replace("'", '')  # quote-glyph tolerant
    return s
def strip_tags(s):
    return BeautifulSoup(s or '', 'html.parser').get_text(' ')

def walk(node, out):
    """collect all dict nodes with @type, @graph-aware"""
    if isinstance(node, dict):
        if '@graph' in node:
            for g in node['@graph']: walk(g, out)
        if '@type' in node: out.append(node)
        for k, v in node.items():
            if k in ('@graph',): continue
            walk(v, out)
    elif isinstance(node, list):
        for x in node: walk(x, out)
def types_of(n):
    t = n.get('@type'); return t if isinstance(t, list) else [t]

results = {}; census = Counter(); docs_with_ld = 0; total_blocks = 0; parse_errors = []
sameas_all = Counter(); id_defs_global = defaultdict(list)
for fname in sorted(os.listdir(PAGES)):
    url = url_by_file.get(fname); html = open(os.path.join(PAGES, fname), encoding='utf-8', errors='replace').read()
    soup = BeautifulSoup(html, 'html.parser')
    lang = (soup.html.get('lang') if soup.html else None) or ('en' if fname.startswith('en') else 'ja')
    lang_base = lang.split('-')[0]
    title = soup.title.get_text(' ', strip=True) if soup.title else ''
    h1s = [h.get_text(' ', strip=True) for h in soup.find_all('h1')]
    canonical = (soup.find('link', rel='canonical') or {}).get('href')
    # --- JSON-LD extraction (live) + line numbers in wt source
    scripts = soup.find_all('script', type='application/ld+json')
    wp = wt_path(fname); wt_lines = []
    if wp:
        src = open(os.path.join(WT, wp), encoding='utf-8').read()
        for m in re.finditer(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>', src):
            wt_lines.append(src[:m.start()].count('\n') + 1)
    blocks = []
    for i, sc in enumerate(scripts):
        raw = sc.string or sc.get_text()
        try: data = json.loads(raw)
        except Exception as e:
            parse_errors.append((fname, i, str(e)[:80])); data = None
        blocks.append({'i': i, 'line': wt_lines[i] if i < len(wt_lines) else None, 'data': data, 'raw': raw})
    total_blocks += len(scripts); docs_with_ld += bool(scripts)
    # --- visible DOM (default language only)
    vis = BeautifulSoup(html, 'html.parser')
    for t in vis.find_all(['script', 'style', 'noscript', 'template']): t.decompose()
    for c in vis.find_all(string=lambda x: isinstance(x, Comment)): c.extract()
    removed_lang = 0
    if not fname.startswith('tiktok'):
        for el in vis.find_all(attrs={'data-lang': True}):
            dl = el.get('data-lang')
            if dl and dl.split('-')[0] != lang_base:
                el.decompose(); removed_lang += 1
    body = vis.body or vis
    vis_text = body.get_text(' ')
    vis_norm = norm(vis_text)
    vis_updated = re.findall(r'(?:更新日|最終更新|Updated|Last updated)[^0-9]{0,12}(\d{4})[年/.\-](\d{1,2})[月/.\-](\d{1,2})', vis_text)
    vis_updated = ['%s-%02d-%02d' % (y, int(m), int(d)) for y, m, d in vis_updated]
    nodes = []
    for b in blocks:
        if b['data'] is not None:
            bn = []; walk(b['data'], bn); b['nodes'] = bn; nodes.extend((b, n) for n in bn)
    page_types = Counter()
    for b, n in nodes:
        for t in types_of(n): page_types[t] += 1
    census.update(page_types)
    pr = {'url': url, 'wt': wp, 'lang': lang, 'title': title, 'h1': h1s, 'canonical': canonical, 'blocks': len(scripts),
          'types': dict(page_types), 'removed_lang_blocks': removed_lang, 'vis_updated': vis_updated, 'issues': [],
          'faq': {'q': 0, 'name_miss': [], 'ans_miss': []}}
    def issue(sev, b, msg, ev=''):
        pr['issues'].append({'sev': sev, 'loc': f"{wp}:{b['line']}" if b and b.get('line') else (wp or fname), 'msg': msg, 'ev': ev[:200]})
    # --- @id graph within page
    id_defs = defaultdict(list); id_refs = Counter()
    for b, n in nodes:
        if '@id' in n and len([k for k in n if k not in ('@id', '@type')]) > 0:
            id_defs[n['@id']].append((b, n))
            id_defs_global[n['@id']].append((fname, b['line'], json.dumps(n, ensure_ascii=False, sort_keys=True)))
    def collect_refs(node):
        if isinstance(node, dict):
            if set(node.keys()) <= {'@id', '@type'} and '@id' in node: id_refs[node['@id']] += 1
            for v in node.values(): collect_refs(v)
        elif isinstance(node, list):
            for x in node: collect_refs(x)
    for b in blocks:
        if b['data'] is not None: collect_refs(b['data'])
    for i, d in id_defs.items():
        if len(d) > 1:
            same = len({json.dumps(x[1], sort_keys=True) for x in d}) == 1
            issue('MEDIUM' if not same else 'LOW', d[0][0], f"@id {i} defined {len(d)}x in page ({'identical' if same else 'DIFFERENT'})")
    for i, c in id_refs.items():
        if i not in id_defs and i.startswith('#') or (i not in id_defs and i.startswith('https://simplememofast.com') and '#' in i):
            pr.setdefault('dangling', []).append(i)
    # --- per type validation
    faq_seen = 0
    for b, n in nodes:
        ts = types_of(n); t0 = ts[0]
        if any(t in ('Article', 'BlogPosting', 'NewsArticle', 'TechArticle') for t in ts):
            for req in ('headline', 'author', 'publisher', 'datePublished', 'dateModified', 'image', 'mainEntityOfPage'):
                if req not in n: issue('MEDIUM' if req in ('image', 'dateModified') else 'HIGH', b, f"{t0} missing {req}")
            pub = n.get('publisher')
            if isinstance(pub, dict) and 'logo' not in pub and set(pub.keys()) - {'@id', '@type'}: issue('MEDIUM', b, f"{t0}.publisher lacks logo", json.dumps(pub, ensure_ascii=False)[:120])
            hl = n.get('headline', '')
            if hl and norm(hl) not in norm(title) and not any(norm(hl) in norm(h) or norm(h) in norm(hl) for h in h1s) and norm(hl) not in vis_norm:
                issue('MEDIUM', b, f"{t0}.headline not found in title/H1/visible text", f"headline={hl!r} title={title!r} h1={h1s[:1]!r}")
            if len(hl) > 110: issue('LOW', b, f"{t0}.headline {len(hl)} chars (>110)", hl[:80])
            dp, dm = n.get('datePublished', ''), n.get('dateModified', '')
            if dp and dm and dm[:10] < dp[:10]: issue('HIGH', b, 'dateModified < datePublished', f"{dp} / {dm}")
            for k in ('datePublished', 'dateModified'):
                v = n.get(k)
                if v and not re.match(r'^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)?)?$', v): issue('MEDIUM', b, f"{k} not ISO 8601", v)
            if dm and url in sitemap and sitemap[url] and dm[:10] > sitemap[url]: issue('LOW', b, 'dateModified newer than sitemap lastmod', f"{dm[:10]} > {sitemap[url]}")
            if dm and vis_updated and dm[:10] < max(vis_updated): issue('MEDIUM', b, 'dateModified older than visible 更新日', f"{dm[:10]} < visible {max(vis_updated)}")
            pr['article_dates'] = (dp, dm, sitemap.get(url), vis_updated)
            au = n.get('author')
            if isinstance(au, dict) and 'name' not in au and not (set(au.keys()) <= {'@id', '@type'}): issue('MEDIUM', b, 'author lacks name')
        if 'FAQPage' in ts:
            faq_seen += 1
            me = n.get('mainEntity')
            if not me: issue('HIGH', b, 'FAQPage with EMPTY mainEntity', json.dumps(n, ensure_ascii=False)[:120]); continue
            if isinstance(me, dict): me = [me]
            for q in me:
                pr['faq']['q'] += 1
                qn = q.get('name', ''); at = q.get('acceptedAnswer', {})
                at = at.get('text', '') if isinstance(at, dict) else ''
                if not qn or not at: issue('HIGH', b, 'Question missing name or acceptedAnswer.text', qn[:60]); continue
                if norm(qn) not in vis_norm: pr['faq']['name_miss'].append(qn)
                if norm(strip_tags(at)) not in vis_norm: pr['faq']['ans_miss'].append(qn)
        if 'BreadcrumbList' in ts:
            items = n.get('itemListElement', [])
            pos = [it.get('position') for it in items]
            if pos != list(range(1, len(items) + 1)): issue('MEDIUM', b, 'Breadcrumb positions not contiguous', str(pos))
            for it in items:
                u = it.get('item'); u = u.get('@id') if isinstance(u, dict) else u
                if not u:
                    if it is not items[-1]: issue('LOW', b, 'Breadcrumb item without URL', it.get('name', ''))
                    continue
                if not u.startswith('https://'): issue('MEDIUM', b, 'Breadcrumb item URL not absolute https', u)
                elif u.rstrip('/') + '/' not in live_ok and u not in live_ok and u.rstrip('/') not in {x.rstrip('/') for x in live_ok}:
                    issue('MEDIUM', b, 'Breadcrumb item URL not a live canonical', u)
                if it is items[-1] and canonical and u.rstrip('/') != canonical.rstrip('/'): issue('LOW', b, 'Breadcrumb last item != canonical', f"{u} vs {canonical}")
        if 'SoftwareApplication' in ts or 'MobileApplication' in ts:
            if n.get('@id', '').endswith('#app'):
                pr['app'] = {k: n.get(k) for k in ('name', 'softwareVersion', 'operatingSystem', 'applicationCategory')}
                ar = n.get('aggregateRating') or {}
                pr['app']['rating'] = (str(ar.get('ratingValue')), str(ar.get('ratingCount')))
                pr['app']['offers'] = bool(n.get('offers'))
                pr['app']['sameAs'] = n.get('sameAs')
                for req in ('name', 'operatingSystem', 'applicationCategory', 'offers', 'aggregateRating'):
                    if req not in n: issue('HIGH', b, f"#app missing {req}")
                if str(n.get('softwareVersion')) != CONST['appVersion']: issue('CRITICAL', b, f"#app softwareVersion != {CONST['appVersion']}", str(n.get('softwareVersion')))
                if (str(ar.get('ratingValue')), str(ar.get('ratingCount'))) != (CONST['ratingValue'], CONST['ratingCount']): issue('CRITICAL', b, f"#app aggregateRating != {CONST['ratingValue']}/{CONST['ratingCount']}", str(pr['app']['rating']))
            elif 'aggregateRating' in n: issue('MEDIUM', b, 'aggregateRating on non-#app SoftwareApplication', n.get('name', ''))
        if any(t in ('Organization', 'Person') for t in ts):
            for u in (n.get('sameAs') or []): sameas_all[u] += 1
        if 'WebSite' in ts:
            pa = n.get('potentialAction')
            if not pa: pr['website_no_search'] = True
            else:
                pa = pa if isinstance(pa, list) else [pa]
                for a in pa:
                    if a.get('@type') == 'SearchAction':
                        tgt = a.get('target'); tgt = tgt.get('urlTemplate') if isinstance(tgt, dict) else tgt
                        qi = a.get('query-input', '')
                        if not tgt or '{search_term_string}' not in str(tgt) or 'search_term_string' not in str(qi): issue('MEDIUM', b, 'SearchAction malformed', f"{tgt} / {qi}")
                        pr['search_target'] = tgt
        if 'WebPage' in ts and n.get('name'):
            if norm(n['name']) not in norm(title) and norm(title) not in norm(n['name']) and not any(norm(n['name']) in norm(h) or norm(h) in norm(n['name']) for h in h1s):
                issue('LOW', b, 'WebPage.name != title/H1', f"name={n['name']!r} title={title!r}")
        if 'speakable' in n:
            sp = n['speakable']; sels = sp.get('cssSelector', []) if isinstance(sp, dict) else []
            sels = sels if isinstance(sels, list) else [sels]
            for sel in sels:
                try: hit = vis.select(sel)
                except Exception: hit = None
                if not hit: issue('MEDIUM', b, 'speakable cssSelector matches nothing in visible DOM', sel)
        if 'ItemList' in ts and 'BreadcrumbList' not in ts:
            items = n.get('itemListElement', [])
            names = []
            for it in items:
                nm = it.get('name') or (it.get('item') or {}).get('name') if isinstance(it.get('item'), dict) else it.get('name')
                if nm: names.append(nm)
            miss = [nm for nm in names if norm(nm) not in vis_norm]
            pr.setdefault('itemlists', []).append({'line': b['line'], 'n': len(items), 'names': names, 'miss': miss})
            if miss: issue('HIGH', b, f"ItemList: {len(miss)}/{len(names)} item names not in visible text", ' | '.join(miss)[:200])
            cn = Counter(names)
            if names and cn.most_common(1)[0][1] > 1 and cn.most_common(1)[0][1] >= len(names) / 2: issue('CRITICAL', b, 'ItemList repeated self-name', str(cn.most_common(2)))
    # FAQ visible count sanity
    if faq_seen > 1: issue('LOW', blocks[0], f"{faq_seen} FAQPage blocks on one page")
    results[fname] = pr

json.dump({'census': census, 'docs_with_ld': docs_with_ld, 'total_blocks': total_blocks, 'parse_errors': parse_errors,
           'results': results, 'sameas': sameas_all,
           'id_defs_global': {k: v for k, v in id_defs_global.items()}}, open(W + '/census.json', 'w'), ensure_ascii=False, indent=1, default=str)
print('pages', len(results), 'docs_with_ld', docs_with_ld, 'blocks', total_blocks, 'parse_errors', len(parse_errors))
print('unmapped wt:', [f for f, r in results.items() if not r['wt']])
print('census:', sorted(census.items(), key=lambda x: -x[1]))
