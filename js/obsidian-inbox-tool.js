(function () {
  'use strict';
  var form = document.getElementById('inbox-tool');
  if (!form) return;
  var en = document.documentElement.lang === 'en';
  var preview = document.getElementById('markdown-preview');
  var status = document.getElementById('tool-status');
  var filename = document.getElementById('markdown-filename');
  function pad(n) { return String(n).padStart(2, '0'); }
  var now = new Date();
  form.elements.date.value = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  form.elements.time.value = pad(now.getHours()) + ':' + pad(now.getMinutes());
  function build() {
    var date = form.elements.date.value;
    var daily = form.elements.destination.value === 'daily';
    var title = form.elements.heading.value.trim().replace(/[\r\n]+/g, ' ') || 'Inbox';
    var text = form.elements.memo.value.trim();
    var prefix = form.elements.style.value === 'task' ? '- [ ] ' : '- ';
    var time = form.elements.timestamp.checked && form.elements.time.value ? form.elements.time.value + ' ' : '';
    var lines = text.split(/\r?\n/);
    var content = '# ' + (daily && date ? date : title) + '\n\n' + prefix + time + lines.join('\n  ') + '\n';
    preview.textContent = content;
    filename.textContent = daily && date ? date + '.md' : 'Inbox.md';
    status.textContent = '';
    return content;
  }
  form.addEventListener('input', build);
  form.addEventListener('change', build);
  form.addEventListener('submit', function (event) { event.preventDefault(); });
  document.getElementById('copy-markdown').addEventListener('click', async function () {
    var content = preview.textContent;
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(content);
      status.textContent = en ? 'Markdown copied.' : 'Markdownをコピーしました。';
    } catch (_) {
      var range = document.createRange();
      range.selectNodeContents(preview);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      status.textContent = en ? 'Copy was unavailable. The Markdown is selected; use your browser’s Copy command.' : '自動コピーを利用できません。選択されたMarkdownをブラウザのコピー操作で取得してください。';
    }
  });
  document.getElementById('download-markdown').addEventListener('click', function () {
    var blob = new Blob([preview.textContent], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename.textContent;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    status.textContent = en ? 'Markdown download started. Your vault has not been changed.' : 'Markdownのダウンロードを開始しました。保管庫の内容は変更していません。';
  });
  build();
})();
