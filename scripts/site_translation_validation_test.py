"""Translation safety checks exercise corrupt model output and preserved markup."""
import unittest
from pathlib import Path
import tempfile
import json
from zipfile import ZipFile
from site_translation_literals import literal_filenames
from site_translation_units import collect, collect_extra, prepare_source, examples_for
from site_translation_validation import validate, render

class TranslationTests(unittest.TestCase):
    def test_japanese_is_valid_only_for_japanese_target(self):
        self.assertIsNone(validate('Save your note.', 'メモを保存します。', 'ja'))
        self.assertEqual(validate('Save your note.', 'メモを保存します。', 'es'), 'untranslated_japanese')

    def test_untranslated_han_text_fails_outside_cjk_locales(self):
        self.assertEqual(validate('送信完了', '送信完了', 'en'), 'untranslated_cjk')
        self.assertIsNone(validate('送信完了', '发送完成', 'zh-Hans'))

    def test_grossly_truncated_paragraph_fails(self):
        source = '長い説明を省略せず内容を保って翻訳する必要があります。' * 5
        self.assertEqual(validate(source, 'Save.', 'en'), 'unexpectedly_short')
        self.assertIsNone(validate('保存', 'Save.', 'en'))

    def test_markers_alone_do_not_replace_a_sentence(self):
        self.assertEqual(validate('ZXQ0000への書き込みには事前の設定が必要です。',
                                  'ZXQ0000.', 'es'), 'missing_prose')

    def test_link_text_cannot_move_outside_an_empty_link(self):
        self.assertEqual(validate('Read <sm0>the guide</sm0>.',
                                  'Lee la guía <sm0></sm0>.','es'),'empty_inline')
        self.assertIsNone(validate('<sm0>ZXQ0000の説明</sm0>',
                                   'Explicación de <sm0>ZXQ0000</sm0>','es'))
        self.assertIsNone(validate('ZXQ0000<sm0>の</sm0>設定',
                                   'Ajustes de ZXQ0000<sm0></sm0>','es'))

    def test_markup_and_link_target_survive_reordering(self):
        source='<p>詳しくは<a href="/privacy?from=note#data"><strong>データの扱い</strong></a>をご覧ください。</p>'
        unit=collect(source)[0]
        result=render(unit,'See <sm0><sm1>data handling</sm1></sm0> for details.')
        self.assertEqual(result,'See <a href="/privacy?from=note#data"><strong>data handling</strong></a> for details.')

    def test_names_numbers_and_free_plan_are_not_rewritten(self):
        unit=collect('<p>Obsidianに送信。Freeは1日3通まで。</p>')[0]
        self.assertEqual(list(v['value'] for v in unit['tokens'].values()),['Obsidian','Free','1日3通まで'])
        self.assertEqual(render(unit,'Send to ZXQ0000. ZXQ0001: ZXQ0002.'),'Send to Obsidian. Free: up to 3 messages per day.')
        self.assertEqual(render(unit,'ZXQ0000. ZXQ0001: ZXQ0002.',locale='es'),'Obsidian. Free: hasta 3 mensajes al día.')
        self.assertEqual(validate(unit['text'],'Unlimited notes.'),'markers')

    def test_japanese_magnitudes_are_exact_including_compound_quantities(self):
        unit=collect('<p>2万文字、6000万ユーザー、480万5,635件、99.3万件。</p>')[0]
        self.assertEqual([v['value'] for v in unit['tokens'].values()],['20000','60000000','4805635','993000'])
        self.assertEqual(render(unit,'ZXQ0000 characters; ZXQ0001 users; ZXQ0002 items; ZXQ0003 items.'),
                         '20000 characters; 60000000 users; 4805635 items; 993000 items.')

    def test_korean_particles_follow_restored_product_pronunciation(self):
        unit=collect('<p>SimpleMemoとObsidianとGmailを使います。</p>')[0]
        self.assertEqual(render(unit,'ZXQ0000은 ZXQ0001와 ZXQ0002으로 보냅니다.',locale='ko'),
                         'SimpleMemo는 Obsidian과 Gmail로 보냅니다.')
        self.assertEqual(render(unit,'ZXQ0000을 ZXQ0001로 ZXQ0002를.',locale='ko'),
                         'SimpleMemo를 Obsidian으로 Gmail을.')
        self.assertEqual(render(unit,'ZXQ0000은(는) ZXQ0001이(가) ZXQ0002을(를).',locale='ko'),
                         'SimpleMemo는 Obsidian이 Gmail을.')

    def test_korean_particles_preserve_markup_and_do_not_rewrite_words(self):
        unit=collect('<p><strong>SimpleMemo</strong>を使います。</p>')[0]
        self.assertEqual(render(unit,'<sm0>ZXQ0000</sm0>은 편리합니다.',locale='ko'),
                         '<strong>SimpleMemo</strong>는 편리합니다.')
        self.assertEqual(render(unit,'<sm0>ZXQ0000</sm0> 이용 방법',locale='ko'),
                         '<strong>SimpleMemo</strong> 이용 방법')
        number=collect('<p>3を確認。</p>')[0]
        self.assertEqual(render(number,'ZXQ0000이 있습니다.',locale='ko'),'3이 있습니다.')

    def test_downloaded_filenames_match_literal_paths_and_archive_members(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            with ZipFile(root/'example.zip','w') as archive:
                archive.writestr('日誌/週.md','example')
            source='<a href="/note.md" download="索引.md">索引.md</a><code>ノート/観察メモ.md</code><a href="/example.zip">原本</a><p>ノート/観察メモ.mdを開きます。</p>'
            names=literal_filenames(source,'index.html',root)
            self.assertTrue({'索引.md','ノート/観察メモ.md','観察メモ.md','ノート/','日誌/週.md','日誌/'}<=set(names))
            units=collect(source,names)
            unit=next(u for u in units if '開きます' in u['text'])
            self.assertEqual(render(unit,'Open ZXQ0000.'),'Open ノート/観察メモ.md.')
            folder=collect('<p>ノートフォルダに保存します。</p>',names)[0]
            self.assertEqual(render(folder,'Save it in the ZXQ0000.'),'Save it in the ノート folder.')

    def test_duplicate_or_missing_protected_values_fail(self):
        self.assertEqual(validate('ZXQ0000とZXQ0001','ZXQ0000 and ZXQ0000'),'markers')
        self.assertEqual(validate('ZXQ0000とZXQ0001','ZXQ0000'),'markers')

    def test_encoded_contact_and_uri_parameters_are_not_translated(self):
        contact=collect('<p><a href="mailto:support&#64;simplememofast.com">support&#64;simplememofast.com</a></p>')[0]
        self.assertTrue(contact['direct'])
        self.assertIn('support@simplememofast.com',render(contact,contact['text'],locale='es'))
        parameter=collect('<td>clipboard</td>',examples_for('obsidian/uri-scheme/index.html'))[0]
        self.assertTrue(parameter['direct'])
        self.assertEqual(render(parameter,parameter['text'],locale='es'),'clipboard')

    def test_evidence_paths_hashes_and_query_values_are_exact(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            evidence=root/'assets/evidence/case.json'
            evidence.parent.mkdir(parents=True)
            evidence.write_text(json.dumps({'after_files':{'日次/2026-09-30.md':{}}}))
            source='<a href="/assets/evidence/case.json">原本</a><p>保存先：日次/2026-09-30.md</p><span>0037828ebe1eeec1…</span>'
            units=collect(source,literal_filenames(source,'index.html',root))
            saved=next(u for u in units if '保存先' in u['text'])
            self.assertEqual(render(saved,'Saved to: ZXQ0000'),'Saved to: 日次/2026-09-30.md')
            digest=units[-1]
            self.assertTrue(digest['direct'])
            self.assertEqual(render(digest,digest['text']),'0037828ebe1eeec1…')
        query=collect('<p>FROM "記録"とstatus = "進行中"を使います。</p>',examples_for('obsidian/properties/index.html'))[0]
        self.assertEqual(render(query,'Use ZXQ0000 and ZXQ0001.'),'Use FROM "記録" and status = "進行中".')
        canvas=collect('<p>「本文を確認」というラベルです。画像の本文を確認できます。</p>',examples_for('obsidian/canvas/index.html'))[0]
        self.assertEqual([token['value'] for token in canvas['tokens'].values()],['本文を確認'])
        self.assertIn('本文を確認できます',canvas['text'])

    def test_adjacent_product_version_stays_a_separate_protected_value(self):
        unit=collect('<p>Obsidian1.12とiOS26で確認しました。</p>')[0]
        self.assertEqual([v['value'] for v in unit['tokens'].values()],['Obsidian','1.12','iOS','26'])
        self.assertEqual(render(unit,'Checked with ZXQ0000 ZXQ0001 and ZXQ0002 ZXQ0003.'),'Checked with Obsidian 1.12 and iOS 26.')

    def test_crossed_markup_fails(self):
        self.assertEqual(validate('<sm0>あ<sm1>い</sm1></sm0>','<sm0>A<sm1>B</sm0></sm1>'),'nesting')

    def test_new_markup_is_escaped(self):
        unit=collect('<p>説明です。</p>')[0]
        with self.assertRaisesRegex(ValueError,'unknown_markup'):
            render(unit,'&lt;script&gt;alert(1)&lt;/script&gt;')

    def test_attribute_quotes_cannot_inject_handlers(self):
        unit=collect_extra('<img alt="画面の説明" src="image.png">')[0]
        self.assertEqual(render(unit,'Screen " onload="bad',attribute=True),'Screen &quot; onload=&quot;bad')

    def test_static_page_uses_one_source_language(self):
        source='<main><p data-lang="ja">日本語</p><p data-lang="en">English</p><button id="save">保存</button></main>'
        self.assertEqual(prepare_source(source,'ja'),'<main><p>日本語</p><button id="save">保存</button></main>')

    def test_paired_lang_spans_have_one_visible_translation(self):
        source='<main><h1><span lang="ja">説明</span><span lang="en">Description</span></h1></main>'
        self.assertEqual(prepare_source(source,'ja'),'<main><h1><span>説明</span></h1></main>')

    def test_spoken_example_is_not_an_invented_localized_command(self):
        for suffix in ('で残す','に送信','にメモ'):
            with self.subTest(suffix=suffix):
                source='<html lang="ja"><body><p title="シンプルメモ'+suffix+'">「シンプルメモ<strong>'+suffix+'</strong>」と言います。</p></body></html>'
                prepared=prepare_source(source,'ja','siri/index.html')
                self.assertIn('title="シンプルメモ'+suffix+'"',prepared)
                literal='<span lang="ja" translate="no">シンプルメモ<strong>'+suffix+'</strong></span>'
                self.assertIn(literal,prepared)
                unit=collect(prepared,examples_for('siri/index.html'))[0]
                self.assertNotIn(suffix,unit['text'])
                self.assertIn(literal,render(unit,unit['text'].replace('と言います。','Say this.'),locale='en'))

    def test_actual_phone_example_is_kept(self):
        source='<div class="lpr-phone-stage" aria-hidden="true"><span>あ</span><span>空白</span></div><p>画面の説明</p>'
        self.assertEqual(len(collect(source)),1)

    def test_troubleshooting_spoken_command_remains_literal(self):
        source='<html lang="ja"><body><p>「Hey Siri、シンプルメモで残す」と話します。</p></body></html>'
        prepared=prepare_source(source,'ja','obsidian/shortcuts-not-working/index.html')
        entry=collect(prepared,examples_for('obsidian/shortcuts-not-working/index.html'))[0]
        self.assertNotIn('で残す',entry['text'])
        self.assertIn('lang="ja" translate="no"',prepared)
        self.assertIn('Hey Siri、シンプルメモで残す',render(entry,entry['text'].replace('と話します。','Di esta frase.'),locale='es'))

    def test_demonstrated_file_and_search_literals(self):
        entry=collect('<p>ようこそ.mdと買い物リスト.mdを開く</p>',examples_for('obsidian/getting-started/index.html'))[0]
        self.assertNotIn('.md',entry['text'])
        search=collect('<p>verificationで検索</p>',examples_for('guides/gmail/index.html'))[0]
        self.assertNotIn('verification',search['text'])

    def test_jsonld_and_accessible_labels_are_extracted(self):
        source='<button aria-label="メニューを開く">開く</button><script type="application/ld+json">{"@type":"Question","name":"質問ですか？","url":"https://simplememofast.com/faq"}</script>'
        units=collect_extra(source)
        self.assertEqual({u['kind'] for u in units},{'attribute','json'})
        self.assertEqual(next(u for u in units if u['kind']=='json')['path'],['name'])

    def test_company_and_product_names_are_approved_names(self):
        units=collect('<p>株式会社ユリカのObsidian連携シンプルメモ</p>')
        self.assertEqual([t['value'] for t in units[0]['tokens'].values()],['YURIKA, K.K.','SimpleMemo'])

    def test_developer_byline_uses_the_approved_identity_in_every_locale(self):
        unit=collect('<p>執筆: シンプルメモ開発者</p>')[0]
        self.assertEqual(render(unit,'Autor: ZXQ0000',locale='es'),'Autor: SimpleMemo Developer')
        self.assertEqual(render(unit,'الكاتب: ZXQ0000',locale='ar'),'الكاتب: SimpleMemo Developer')

if __name__=='__main__': unittest.main()
