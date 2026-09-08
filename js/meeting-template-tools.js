(function () {
  'use strict';
  document.querySelectorAll('[data-copy-template]').forEach(function (button) {
    var code = document.getElementById(button.getAttribute('data-copy-template'));
    var container = button.closest('.meeting-template');
    var status = container && container.querySelector('.template-status');
    if (!code || !status) return;
    button.hidden = false;
    button.addEventListener('click', async function () {
      var en = code.closest('[data-lang]').getAttribute('data-lang') === 'en';
      button.disabled = true;
      status.textContent = '';
      try {
        if (!navigator.clipboard) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(code.textContent);
        status.textContent = en ? 'Copied. Paste into your notes app.' : 'コピーしました。メモアプリへ貼り付けて使えます。';
      } catch (_) {
        code.parentElement.focus();
        var range = document.createRange();
        range.selectNodeContents(code);
        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        status.textContent = en ? 'Automatic copy is unavailable. Copy the selected text using your browser, or download the Markdown file.' : '自動コピーを利用できません。選択された本文をブラウザでコピーするか、Markdownを保存してください。';
      } finally {
        button.disabled = false;
      }
    });
  });
})();
