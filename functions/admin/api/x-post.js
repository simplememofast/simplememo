// X (Twitter) への投稿エンドポイント
// OAuth 1.0a 署名付きで POST /2/tweets を叩く
// 認証は /functions/admin/_middleware.js の Basic 認証で担保されているため、
// この関数自体では認証チェックをしない。
//
// 使い方:
//   POST /admin/api/x-post
//   Content-Type: application/json
//   Body: {
//     "text": "本文 (280 字以内)",
//     "quote_tweet_id": "引用 RT する場合の元ツイート ID (任意)",
//     "in_reply_to_tweet_id": "返信する場合の対象ツイート ID (任意)"
//   }

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return json({ error: 'POST only' }, 405);
  }

  const required = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET'];
  for (const k of required) {
    if (!env[k]) return json({ error: k + ' が Cloudflare 環境変数に未設定です' }, 400);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: '不正な JSON' }, 400);
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
      consumerKey: env.X_API_KEY,
      consumerSecret: env.X_API_SECRET,
      token: env.X_ACCESS_TOKEN,
      tokenSecret: env.X_ACCESS_TOKEN_SECRET,
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
      sent: payload,
      body: respBody,
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ---- OAuth 1.0a 署名 ----

async function buildOAuth1Header(opts) {
  const oauth = {
    oauth_consumer_key: opts.consumerKey,
    oauth_nonce: randomNonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: opts.token,
    oauth_version: '1.0',
  };

  // POST /2/tweets は JSON ボディなので、ボディのパラメータは署名対象に含めない。
  // URL クエリパラメータと oauth_* のみが対象。
  const u = new URL(opts.url);
  const params = Object.assign({}, oauth);
  for (const [k, v] of u.searchParams.entries()) {
    params[k] = v;
  }

  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys
    .map(function (k) { return pe(k) + '=' + pe(params[k]); })
    .join('&');

  const baseUrl = u.origin + u.pathname;
  const sigBase = opts.method.toUpperCase() + '&' + pe(baseUrl) + '&' + pe(paramString);
  const signingKey = pe(opts.consumerSecret) + '&' + pe(opts.tokenSecret);

  const signature = await hmacSha1(signingKey, sigBase);
  oauth.oauth_signature = signature;

  const authParts = Object.keys(oauth).sort().map(function (k) {
    return pe(k) + '="' + pe(oauth[k]) + '"';
  });
  return 'OAuth ' + authParts.join(', ');
}

function pe(s) {
  return encodeURIComponent(String(s))
    .replace(/!/g, '%21')
    .replace(/\*/g, '%2A')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}

function randomNonce() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

async function hmacSha1(key, data) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  const bytes = new Uint8Array(sig);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch (e) {
    return { _raw: await res.text().catch(function () { return '(本文読み取り不能)'; }) };
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
