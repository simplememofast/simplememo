"""Reviewed shared navigation labels, keyed by stable destination routes."""
from urllib.parse import urlsplit
from site_locales import unprefixed_file

ROUTES = ('/', '/guides', '/use-cases', '/vs', '/download', '/apple-watch',
          '/obsidian', '/note-to-email', '/roadmap', '/devlog', '/about',
          '/faq', '/privacy', '/contact')
LABELS = {
    'ja': ('ホーム', '使い方', '活用事例', '比較', 'ダウンロード', 'Apple Watch', 'Obsidian連携', 'メモをメールへ', '公開ロードマップ', '開発記録', '開発者について', 'よくある質問', 'プライバシー', 'お問い合わせ'),
    'en': ('Home', 'Guides', 'Use cases', 'Compare', 'Download', 'Apple Watch', 'Obsidian integration', 'Notes to email', 'Public roadmap', 'Development log', 'About the developer', 'FAQ', 'Privacy', 'Contact'),
    'zh-Hans': ('首页', '使用指南', '使用场景', '对比', '下载', 'Apple Watch', 'Obsidian 集成', '将笔记发送到邮箱', '公开路线图', '开发日志', '关于开发者', '常见问题', '隐私', '联系我们'),
    'zh-Hant': ('首頁', '使用指南', '使用情境', '比較', '下載', 'Apple Watch', 'Obsidian 整合', '將筆記傳送至信箱', '公開路線圖', '開發日誌', '關於開發者', '常見問題', '隱私', '聯絡我們'),
    'ko': ('홈', '사용 가이드', '활용 사례', '비교', '다운로드', 'Apple Watch', 'Obsidian 연동', '메모를 이메일로', '공개 로드맵', '개발 기록', '개발자 소개', '자주 묻는 질문', '개인정보 보호', '문의'),
    'es': ('Inicio', 'Guías', 'Casos de uso', 'Comparar', 'Descargar', 'Apple Watch', 'Integración con Obsidian', 'Notas por correo', 'Hoja de ruta pública', 'Registro de desarrollo', 'Sobre el desarrollador', 'Preguntas frecuentes', 'Privacidad', 'Contacto'),
    'pt-BR': ('Início', 'Guias', 'Casos de uso', 'Comparar', 'Baixar', 'Apple Watch', 'Integração com Obsidian', 'Notas por e-mail', 'Roteiro público', 'Registro de desenvolvimento', 'Sobre o desenvolvedor', 'Perguntas frequentes', 'Privacidade', 'Contato'),
    'id': ('Beranda', 'Panduan', 'Contoh penggunaan', 'Bandingkan', 'Unduh', 'Apple Watch', 'Integrasi Obsidian', 'Catatan ke email', 'Rencana pengembangan', 'Catatan pengembangan', 'Tentang pengembang', 'Pertanyaan umum', 'Privasi', 'Hubungi kami'),
    'ar': ('الرئيسية', 'أدلة الاستخدام', 'حالات الاستخدام', 'المقارنة', 'تنزيل', 'Apple Watch', 'التكامل مع Obsidian', 'الملاحظات عبر البريد', 'خطة التطوير العامة', 'سجل التطوير', 'عن المطوّر', 'الأسئلة الشائعة', 'الخصوصية', 'تواصل معنا'),
    'tr': ('Ana sayfa', 'Kılavuzlar', 'Kullanım örnekleri', 'Karşılaştır', 'İndir', 'Apple Watch', 'Obsidian entegrasyonu', 'E-postaya not gönderme', 'Açık yol haritası', 'Geliştirme günlüğü', 'Geliştirici hakkında', 'Sık sorulan sorular', 'Gizlilik', 'İletişim'),
}
assert all(len(labels) == len(ROUTES) for labels in LABELS.values())


def label_for(href, locale):
    if not href or href.startswith('#'):
        return None
    url = urlsplit(href)
    if url.scheme not in ('', 'http', 'https') or url.netloc not in ('', 'simplememofast.com'):
        return None
    path = unprefixed_file(url.path.lstrip('/')).removesuffix('index.html').removesuffix('.html')
    route = '/' + path.strip('/')
    return dict(zip(ROUTES, LABELS[locale])).get(route)
