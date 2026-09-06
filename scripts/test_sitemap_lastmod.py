"""Regression tests for fabricated dates and content changes hidden by sweeps."""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from sitemap_lastmod import content_signature, content_lastmods, link_destination


PAGE = '<html><head><title>Notes</title><link rel="stylesheet" href="/a.css?v=1"></head><body><h1>Capture</h1><p>Save your note.</p><a href="/guide/">Guide</a><a href="https://apps.apple.com/jp/app/id1?ct=old&amp;ppid=product-a">Store</a><footer>© 2025 Notes</footer></body></html>'


class SignatureTests(unittest.TestCase):
    def test_mechanical_changes_do_not_refresh_content(self):
        changed = PAGE.replace('v=1', 'v=2').replace('ct=old', 'ct=new')
        changed = changed.replace('© 2025', '© 2026').replace('<p>', '<div class="table-scroll"><p class="wide">').replace('</p>', '</p></div>')
        changed = changed.replace('</body>', '<script src="/metrics.js?v=2">track()</script></body>')
        self.assertEqual(content_signature(PAGE), content_signature(changed))

    def test_text_link_media_and_heading_changes_are_detected(self):
        for changed in [PAGE.replace('your note', 'to your folder'), PAGE.replace('/guide/', '/setup/'),
                        PAGE.replace('product-a', 'product-b'), PAGE.replace('<h1>', '<h2>').replace('</h1>', '</h2>'),
                        PAGE.replace('</p>', '</p><img src="/step.png" alt="Folder setting">'),
                        PAGE.replace('</head>', '<meta name="description" content="Different intent"></head>')]:
            with self.subTest(changed=changed):
                self.assertNotEqual(content_signature(PAGE), content_signature(changed))

    def test_schema_dates_and_formatting_are_ignored_but_facts_are_not(self):
        old = '<script type="application/ld+json">{"dateModified":"2026-01-01","price":3}</script>'
        timestamp = '<script type="application/ld+json">{ "price":3, "dateModified":"2026-09-06" }</script>'
        self.assertEqual(content_signature(PAGE + old), content_signature(PAGE + timestamp))
        self.assertNotEqual(content_signature(PAGE + old), content_signature(PAGE + old.replace('"price":3', '"price":5')))
        self.assertNotEqual(content_signature(PAGE + old), content_signature(PAGE + old.replace('3}', '3')))

    def test_tracking_normalization_preserves_functional_queries(self):
        self.assertEqual(link_destination('/search?q=notes&utm_source=x'), '/search?q=notes')
        self.assertNotEqual(link_destination('/search?q=notes'), link_destination('/search?q=tasks'))
        self.assertNotEqual(link_destination('https://example.org/?ct=a'), link_destination('https://example.org/?ct=b'))


class HistoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.git('init', '-q', '-b', 'main')
        self.git('config', 'user.name', 'Sitemap fixture')
        self.git('config', 'user.email', 'fixture@example.invalid')
        self.git('config', 'commit.gpgsign', 'false')
        self.git('config', 'core.hooksPath', '/dev/null')

    def tearDown(self):
        self.tmp.cleanup()

    def git(self, *args, date=None):
        env = dict(os.environ)
        if date:
            env.update(GIT_AUTHOR_DATE=date, GIT_COMMITTER_DATE=date)
        return subprocess.check_output(['git', *args], cwd=self.root, env=env, text=True, stderr=subprocess.PIPE)

    def commit(self, day, message):
        self.git('add', '.')
        self.git('commit', '-qm', message, date=day + 'T01:00:00+09:00')
        return self.git('rev-parse', 'HEAD').strip()

    def results(self, files, today='2026-09-06'):
        return content_lastmods(self.root, files, today)

    def test_large_real_change_survives_large_and_small_mechanical_changes(self):
        files = [self.root / f'p{i}.html' for i in range(41)]
        for p in files:
            p.write_text(PAGE)
        self.commit('2026-01-01', 'Create 41 pages')
        for p in files:
            p.write_text(PAGE.replace('/guide/', '/setup/'))
        substantive = self.commit('2026-01-02', 'Change all 41 destinations')
        for p in files:
            p.write_text(p.read_text().replace('v=1', 'v=2').replace('ct=old', 'ct=new'))
        self.commit('2026-01-03', 'Refresh 41 asset references and attribution tokens')
        files[0].write_text(files[0].read_text().replace('<p>', '<p class="new-layout">'))
        self.commit('2026-01-04', 'Small mechanical update')
        result = self.results(files)
        self.assertEqual(len(result), 41)
        self.assertEqual({r['date'] for r in result.values()}, {'2026-01-02'})
        self.assertEqual({r['commit'] for r in result.values()}, {substantive})
        self.assertEqual(result, self.results(files, today='2026-09-07'))

    def test_first_parent_merge_date_and_jst_boundary(self):
        p = self.root / 'a.html'; p.write_text(PAGE)
        self.commit('2026-01-01', 'Initial')
        self.git('checkout', '-qb', 'article')
        p.write_text(PAGE.replace('your note', 'to Obsidian'))
        self.commit('2026-01-02', 'Article')
        self.git('checkout', '-q', 'main')
        self.git('merge', '--no-ff', '-qm', 'Publish article', 'article', date='2026-01-03T16:00:00+00:00')
        result = self.results([p])['a.html']
        self.assertEqual(result['date'], '2026-01-04')
        self.assertEqual(result['commit'], self.git('rev-parse', 'HEAD').strip())

    def test_working_changes_and_new_files_are_explicit(self):
        p = self.root / 'a.html'; p.write_text(PAGE)
        self.commit('2026-01-01', 'Initial')
        p.write_text(PAGE.replace('v=1', 'v=2'))
        self.assertEqual(self.results([p])['a.html']['date'], '2026-01-01')
        p.write_text(PAGE.replace('your note', 'a voice memo'))
        new = self.root / 'new.html'; new.write_text(PAGE)
        self.assertEqual({r['basis'] for r in self.results([p, new]).values()}, {'unpublished_content'})
        self.assertEqual({r['date'] for r in self.results([p, new]).values()}, {'2026-09-06'})

    def test_shallow_history_fails_instead_of_inventing_dates(self):
        p = self.root / 'a.html'; p.write_text(PAGE)
        self.commit('2026-01-01', 'Initial')
        p.write_text(PAGE.replace('v=1', 'v=2'))
        self.commit('2026-01-02', 'Mechanical')
        clone = self.root / 'shallow'
        self.git('clone', '-q', '--depth', '1', self.root.as_uri(), str(clone))
        with self.assertRaisesRegex(ValueError, 'Full Git history required'):
            content_lastmods(clone, [clone / 'a.html'])

    def test_index_uses_child_file_modification_not_article_maximum(self):
        import generate_sitemap as sm
        p = self.root / 'sitemap-ja.xml'
        old = '<urlset><url><loc>https://x/</loc><lastmod>2025-01-01</lastmod></url></urlset>'
        p.write_text(old)
        self.commit('2026-01-04', 'Correct an old article date')
        with patch.object(sm, 'REPO_ROOT', self.root), patch.object(sm, 'TODAY', '2026-09-06'):
            self.assertEqual(sm.child_lastmod(p, old), '2026-01-04')
            self.assertEqual(sm.child_lastmod(p, old.replace('2025-01-01', '2025-01-02')), '2026-09-06')


def run_tests():
    suite = unittest.TestSuite([unittest.defaultTestLoader.loadTestsFromTestCase(cls) for cls in (SignatureTests, HistoryTests)])
    return unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful()


if __name__ == '__main__':
    raise SystemExit(0 if run_tests() else 1)
