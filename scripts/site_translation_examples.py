"""Keep demonstrated spoken commands literal and explain their source language."""
from html import escape
from site_translation_units import Parser, all_nodes, SPOKEN_PAGES

NOTICES = {
    'ja': '以下の音声フレーズは、日本語設定の例です。Siriの言語と、端末に登録されたショートカットを確認してください。',
    'en': 'The spoken phrases below are Japanese examples. Check the language set for Siri and the shortcuts registered on your device.',
    'zh-Hans': '下方的语音指令为日语示例。请确认 Siri 的语言设置，以及设备上已注册的快捷指令。',
    'zh-Hant': '下方的語音指令為日語範例。請確認 Siri 的語言設定，以及裝置上已註冊的捷徑。',
    'ko': '아래 음성 명령은 일본어 설정의 예시입니다. Siri의 언어 설정과 기기에 등록된 단축어를 확인하세요.',
    'es': 'Las frases de voz que aparecen a continuación son ejemplos en japonés. Comprueba el idioma de Siri y los atajos registrados en tu dispositivo.',
    'pt-BR': 'As frases de voz abaixo são exemplos em japonês. Confira o idioma da Siri e os atalhos registrados no seu dispositivo.',
    'id': 'Frasa perintah suara di bawah ini adalah contoh dalam bahasa Jepang. Periksa bahasa Siri dan pintasan yang terdaftar di perangkat Anda.',
    'ar': 'العبارات الصوتية أدناه أمثلة باللغة اليابانية. تحقّق من لغة Siri والاختصارات المسجّلة على جهازك.',
    'tr': 'Aşağıdaki sesli komutlar Japonca örneklerdir. Siri dilini ve cihazınızda kayıtlı kestirmeleri kontrol edin.',
}


def add_notice(source, source_file, locale):
    if source_file not in SPOKEN_PAGES or locale == 'ja':
        return source
    if source_file == 'obsidian/index.html':
        heading = next(node for node in all_nodes(Parser(source).root)
                       if node.tag == 'h2' and 'シンプルメモで残す' in source[node.inner:node.end])
        note = '\n<p class="lpr-section-sub" data-translation-example-note="">' + escape(NOTICES[locale]) + '</p>\n'
        return source[:heading.start] + note + source[heading.start:]
    heading = next(node for node in all_nodes(Parser(source).root) if node.tag == 'h1')
    note = '\n<p class="guide-note" data-translation-example-note="">' + escape(NOTICES[locale]) + '</p>\n'
    return source[:heading.stop] + note + source[heading.stop:]
