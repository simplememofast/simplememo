// X ツイート削除エンドポイント (OAuth 1.0a 署名付き DELETE /2/tweets/:id)
//
// 使い方:
//   POST /admin/api/x-delete
//   Body: { "id": "<tweet_id>" }

import { buildOAuth1Header, json } from './_shared.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return json({ error: 'POST only' }, 405);
  }

  const required = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET'];
  for (const k of required) {
    if (!env[k]) return json({ error: k + ' 未設定' }, 400);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: '不正な JSON' }, 400);
  }

  const id = body && body.id;
  if (!id) return json({ error: 'id が必要' }, 400);

  const url = 'https://api.x.com/2/tweets/' + encodeURIComponent(String(id));
  const method = 'DELETE';

  const authHeader = await buildOAuth1Header({
    method: method,
    url: url,
    consumerKey: env.X_API_KEY,
    consumerSecret: env.X_API_SECRET,
    token: env.X_ACCESS_TOKEN,
    tokenSecret: env.X_ACCESS_TOKEN_SECRET,
  });

  try {
    const res = await fetch(url, {
      method: method,
      headers: {
        'Authorization': authHeader,
        'User-Agent': 'SimpleMemoAdmin/1.0',
      },
    });
    const respBody = await res.json().catch(function () { return null; });
    return json({ status: res.status, body: respBody });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
