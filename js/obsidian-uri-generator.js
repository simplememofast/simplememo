(function (root) {
  'use strict';

  function encode(value) {
    return encodeURIComponent(value).replace(/[!'()*]/g, function (character) {
      return '%' + character.charCodeAt(0).toString(16).toUpperCase();
    });
  }

  function buildUri(input) {
    var action = input.action;
    if (action !== 'new' && action !== 'daily' && action !== 'open') {
      throw new Error('Unsupported action');
    }
    var vault = String(input.vault || '').trim();
    var file = String(input.file || '').trim();
    var content = String(input.content || '');
    if (!vault) throw new Error('Vault name is required');
    if (action !== 'daily' && !file) throw new Error('Note path is required');
    if (action === 'open' && content) throw new Error('Open does not add content');

    var parameters = [['vault', vault]];
    if (action !== 'daily') parameters.push(['file', file]);
    if (action !== 'open' && content) parameters.push(['content', content]);
    if (action !== 'open' && input.append) parameters.push(['append', null]);
    if (action !== 'open' && input.silent) parameters.push(['silent', null]);

    return 'obsidian://' + action + '?' + parameters.map(function (entry) {
      return encode(entry[0]) + (entry[1] === null ? '' : '=' + encode(entry[1]));
    }).join('&');
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { buildUri: buildUri };
  if (!root || !root.document) return;

  var form = root.document.getElementById('uri-tool');
  if (!form) return;
  var output = root.document.getElementById('uri-output');
  var status = root.document.getElementById('uri-status');
  var contentLabel = root.document.getElementById('content-label');
  var fileRow = root.document.getElementById('file-row');
  var contentRow = root.document.getElementById('content-row');
  var appendRow = root.document.getElementById('append-row');
  var silentRow = root.document.getElementById('silent-row');

  function update() {
    var action = form.elements.action.value;
    var opensExisting = action === 'open';
    fileRow.hidden = action === 'daily';
    contentRow.hidden = opensExisting;
    appendRow.hidden = opensExisting;
    silentRow.hidden = opensExisting;
    form.elements.file.required = action !== 'daily';
    contentLabel.textContent = action === 'daily' ? '日次ノートに入れる本文（任意）' : '本文（任意）';

    try {
      var uri = buildUri({
        action: action,
        vault: form.elements.vault.value,
        file: form.elements.file.value,
        content: opensExisting ? '' : form.elements.content.value,
        append: !opensExisting && form.elements.append.checked,
        silent: !opensExisting && form.elements.silent.checked
      });
      output.value = uri;
      status.textContent = uri.length > 1800 ? 'URLが長くなっています。長文が渡るかは端末・アプリで確認してください。' : '';
      return uri;
    } catch (_) {
      output.value = '';
      status.textContent = action === 'daily' ? '保管庫名を入力してください。' : '保管庫名とノートのパスを入力してください。';
      return null;
    }
  }

  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', function (event) { event.preventDefault(); });
  root.document.getElementById('copy-uri').addEventListener('click', async function () {
    var uri = update();
    if (!uri) {
      form.reportValidity();
      return;
    }
    try {
      if (!root.navigator.clipboard) throw new Error('Clipboard unavailable');
      await root.navigator.clipboard.writeText(uri);
      status.textContent = 'URIをコピーしました。本文を入れた場合、このURLの共有先にも本文が見えます。';
    } catch (_) {
      output.focus();
      output.select();
      status.textContent = '自動コピーが使えません。選択したURIをブラウザのコピー操作で取得してください。';
    }
  });
  update();
})(typeof window === 'undefined' ? null : window);
