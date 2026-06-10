// X (Twitter) への投稿エンドポイント
// OAuth 1.0a 署名付きで POST /2/tweets を叩く
// 認証は /functions/admin/_middleware.js (Cloudflare Access) で担保されている
// ため、この関数自体では認証チェックをしない。
//
// 使い方:
//   POST /admin/api/x-post
//   Content-Type: application/json
//   Body: {
//     "text": "本文 (280 字以内)",
//     "account": "ja" | "en"  (任意・既定 "ja"。@simplememofast 用 / @simplememo_en 用の鍵を切替)
//     "quote_tweet_id": "引用 RT する場合の元ツイート ID (任意)",
//     "in_reply_to_tweet_id": "返信する場合の対象ツイート ID (任意)"
//   }

import { buildOAuth1Header, safeJson, json } from './_shared.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return json({ error: 'POST only' }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: '不正な JSON' }, 400);
  }

  const account = (body && body.account) === 'en' ? 'en' : 'ja';
  const prefix = account === 'en' ? 'X_EN_' : 'X_';
  const credKeys = {
    consumerKey: prefix + 'API_KEY',
    consumerSecret: prefix + 'API_SECRET',
    token: prefix + 'ACCESS_TOKEN',
    tokenSecret: prefix + 'ACCESS_TOKEN_SECRET',
  };
  for (const k of Object.values(credKeys)) {
    if (!env[k]) return json({ error: k + ' が Cloudflare 環境変数に未設定です' }, 400);
  }

  const text = body && body.text;
  if (!text || typeof text !== 'string') {
    return json({ error: 'text が必要です' }, 400);
  }
  if (text.length > 280) {
    return json({ error: 'text が 280 字を超えています (' + text.length + ' 字)' }, 400);
  }

  const payload = { text: text };
  if (body.quote_tweet_id) payload.quote_tweet_id = String(body.quote_tweet_id);
  if (body.in_reply_to_tweet_id) {
    payload.reply = { in_reply_to_tweet_id: String(body.in_reply_to_tweet_id) };
  }

  const url = 'https://api.x.com/2/tweets';
  const method = 'POST';

  let authHeader;
  try {
    authHeader = await buildOAuth1Header({
      method: method,
      url: url,
      consumerKey: env[credKeys.consumerKey],
      consumerSecret: env[credKeys.consumerSecret],
      token: env[credKeys.token],
      tokenSecret: env[credKeys.tokenSecret],
    });
  } catch (e) {
    return json({ error: 'OAuth 署名に失敗しました: ' + e.message }, 500);
  }

  try {
    const res = await fetch(url, {
      method: method,
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'User-Agent': 'SimpleMemoAdmin/1.0',
      },
      body: JSON.stringify(payload),
    });
    const respBody = await safeJson(res);
    return json({
      status: res.status,
      account: account,
      sent: payload,
      body: respBody,
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
