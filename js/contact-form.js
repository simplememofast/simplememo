/**
 * お問い合わせフォーム — /v1/inquiry へ送る。
 *
 * 【なぜフォームにするか】
 * これまでの窓口は `mailto:` だけで、**機械はメールを読めない。**
 * ⑧カスタマーサポートの各タスクが「基盤そのものが未整備」で止まっていた原因が
 * ここで、受け口が構造化されて初めて自動分類・自動返信・CSAT計測がつながる。
 *
 * 【mailto は消さない】
 * JSが動かない環境・フォームが落ちている日でも連絡手段が消えないように、
 * メールアドレスはページに残す。**新しい経路を足すのであって、
 * 既存の経路を人質にしない。**
 *
 * 【送信結果を誤魔化さない】
 * 失敗を「送信しました」と出さない。429（上限）と500（保存失敗）は
 * ユーザーから見て意味が違うので、文言も分ける。
 * 迷ったらメールへ誘導する — **こちらの都合で連絡を諦めさせない。**
 */

(function () {
  'use strict';

  var ENDPOINT = 'https://api.simplememofast.com/v1/inquiry';
  var MAX_BODY = 4000;

  var form = document.getElementById('inquiry-form');
  if (!form) return;

  var bodyEl = document.getElementById('inquiry-body');
  var emailEl = document.getElementById('inquiry-email');
  var submitEl = document.getElementById('inquiry-submit');
  var statusEl = document.getElementById('inquiry-status');
  var counterEl = document.getElementById('inquiry-counter');

  /** 表示言語。lang.js が <html lang> を切り替えるので、送信時点の値を読む。 */
  function currentLocale() {
    var l = (document.documentElement.getAttribute('lang') || 'ja').toLowerCase();
    return l.indexOf('en') === 0 ? 'en' : 'ja';
  }

  var MESSAGES = {
    ja: {
      sending: '送信しています…',
      ok: '送信しました。内容を確認します。',
      okReplied: '送信しました。折り返しの自動返信をメールでお送りしました。',
      empty: 'お問い合わせ内容を入力してください。',
      tooLong: '内容が長すぎます（4,000文字まで）。',
      rateLimited: '本日の送信上限に達しました。お手数ですが support@simplememofast.com へメールでご連絡ください。',
      failed: '送信できませんでした。お手数ですが support@simplememofast.com へメールでご連絡ください。'
    },
    en: {
      sending: 'Sending…',
      ok: "Sent. We'll read it.",
      okReplied: 'Sent. An automatic reply is on its way to your inbox.',
      empty: 'Please write your message.',
      tooLong: 'That message is too long (4,000 characters max).',
      rateLimited: "You've reached today's limit. Please email support@simplememofast.com instead.",
      failed: "Couldn't send. Please email support@simplememofast.com instead."
    }
  };

  function say(kind, key) {
    var m = MESSAGES[currentLocale()][key];
    statusEl.textContent = m;
    statusEl.className = 'inquiry-form__status inquiry-form__status--' + kind;
    // 送信結果は読み上げにも届ける（送信ボタンの下に静かに出るだけでは気づけない）。
    statusEl.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  }

  if (counterEl && bodyEl) {
    bodyEl.addEventListener('input', function () {
      counterEl.textContent = bodyEl.value.length + ' / ' + MAX_BODY;
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var body = (bodyEl.value || '').trim();
    if (!body) { say('error', 'empty'); bodyEl.focus(); return; }
    if (body.length > MAX_BODY) { say('error', 'tooLong'); return; }

    submitEl.disabled = true;
    say('pending', 'sending');

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        body: body,
        email: (emailEl.value || '').trim(),
        locale: currentLocale()
      })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { status: res.status, data: data };
      });
    }).then(function (r) {
      if (r.status === 429) { say('error', 'rateLimited'); return; }
      if (!r.data || r.data.success !== true) { say('error', 'failed'); return; }
      // **自動返信が出たかどうかで文言を変える。**「返信しました」と書いておいて
      // 何も届かないのが、この経路でいちばん信用を失う壊れ方。
      say('ok', r.data.auto_replied ? 'okReplied' : 'ok');
      form.reset();
      if (counterEl) counterEl.textContent = '0 / ' + MAX_BODY;
    }).catch(function () {
      say('error', 'failed');
    }).then(function () {
      submitEl.disabled = false;
    });
  });
})();
