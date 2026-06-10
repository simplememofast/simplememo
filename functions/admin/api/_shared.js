// /admin/api/* 共通ヘルパ。
//
// アンダースコア始まりのファイルは Pages Functions のルートにならない
// （onRequest を export していないため、仮にルーティングされても静的
// フォールバック → 404。/admin/* は Cloudflare Access 配下でもある）。

// ---- OAuth 1.0a 署名 (X API v2) ----
//
// POST /2/tweets 等の JSON ボディはリクエストボディを署名対象に含めない。
// URL クエリパラメータと oauth_* のみが対象。
export async function buildOAuth1Header(opts) {
  const oauth = {
    oauth_consumer_key: opts.consumerKey,
    oauth_nonce: randomNonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: opts.token,
    oauth_version: '1.0',
  };

  const u = new URL(opts.url);
  const params = Object.assign({}, oauth);
  for (const [k, v] of u.searchParams.entries()) params[k] = v;

  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map(function (k) { return pe(k) + '=' + pe(params[k]); }).join('&');
  const baseUrl = u.origin + u.pathname;
  const sigBase = opts.method.toUpperCase() + '&' + pe(baseUrl) + '&' + pe(paramString);
  const signingKey = pe(opts.consumerSecret) + '&' + pe(opts.tokenSecret);

  const signature = await hmacSha1(signingKey, sigBase);
  oauth.oauth_signature = signature;

  const authParts = Object.keys(oauth).sort().map(function (k) { return pe(k) + '="' + pe(oauth[k]) + '"'; });
  return 'OAuth ' + authParts.join(', ');
}

// RFC 3986 percent-encode (encodeURIComponent が逃す 5 文字も対象)
function pe(s) {
  return encodeURIComponent(String(s))
    .replace(/!/g, '%21').replace(/\*/g, '%2A').replace(/'/g, '%27')
    .replace(/\(/g, '%28').replace(/\)/g, '%29');
}

function randomNonce() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

async function hmacSha1(key, data) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  const bytes = new Uint8Array(sig);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ---- レスポンスヘルパ ----

export async function safeJson(res) {
  try {
    return await res.json();
  } catch (e) {
    return { _raw: await res.text().catch(function () { return '(本文読み取り不能)'; }) };
  }
}

export function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
