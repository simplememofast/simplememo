// captio 言及ツイート収集用エンドポイント。
// 認証は /functions/admin/_middleware.js (Cloudflare Access) で担保。
//
// 検索は @simplememo_en の User Context (OAuth 1.0a) で叩く。Bearer
// (App-only) ではなく、X_EN_* 4 キーで HMAC-SHA1 署名する。
//   - X_EN_API_KEY / X_EN_API_SECRET           = Consumer Key / Secret
//   - X_EN_ACCESS_TOKEN / X_EN_ACCESS_TOKEN_SECRET = User Access Token
// この移行で X_BEARER_TOKEN へのこの関数の依存はゼロになる（他の関数で
// 引き続き使用）。
//
// 使い方:
//   GET /admin/api/x-captio-search?q=<query>&endpoint=recent|all
//                                  &max_results=100&next_token=<token>
//     → X API v2 GET /2/tweets/search/{recent|all} を 1 コール叩いて
//       正規化済みツイート配列と next_token を返す。
//
// フロント側で localStorage に結果をマージしつつ「次のページを取得」で
// 1 コールずつ叩く想定。サーバ側ではページ自動連結しない（API 課金対策）。

export async function onRequest(context) {
  const { request, env } = context;

  const required = ['X_EN_API_KEY', 'X_EN_API_SECRET', 'X_EN_ACCESS_TOKEN', 'X_EN_ACCESS_TOKEN_SECRET'];
  for (const k of required) {
    if (!env[k]) {
      return json({ error: k + ' が Cloudflare 環境変数に未登録です。' }, 400);
    }
  }

  const url = new URL(request.url);
  const q = url.searchParams.get('q') || 'captio (メモ OR メモ帳 OR アプリ) lang:ja min_faves:1 -is:retweet';
  const endpointParam = url.searchParams.get('endpoint') === 'recent' ? 'recent' : 'all';
  const nextToken = url.searchParams.get('next_token') || '';
  const startTime = url.searchParams.get('start_time') || '';
  const endTime = url.searchParams.get('end_time') || '';

  // max_results: recent は 10-100、all は 10-500
  let maxResults = parseInt(url.searchParams.get('max_results') || '100', 10);
  if (!Number.isFinite(maxResults)) maxResults = 100;
  const upper = endpointParam === 'all' ? 500 : 100;
  if (maxResults < 10) maxResults = 10;
  if (maxResults > upper) maxResults = upper;

  const params = new URLSearchParams();
  params.set('query', q);
  params.set('max_results', String(maxResults));
  params.set('tweet.fields', 'created_at,public_metrics,lang,author_id,conversation_id');
  params.set('user.fields', 'username,name');
  params.set('expansions', 'author_id');
  if (nextToken) params.set('next_token', nextToken);
  // search/all は start_time を指定しないと「過去 30 日」に狭められるため、
  // endpoint=all かつ未指定なら Twitter 創業日を自動注入してアーカイブ全期間に。
  const effectiveStartTime = startTime
    || (endpointParam === 'all' ? '2006-03-21T00:00:00Z' : '');
  if (effectiveStartTime) params.set('start_time', effectiveStartTime);
  if (endTime) params.set('end_time', endTime);
  // 並びはサーバ側で触らず、フロントで created_at 昇順ソートする

  const apiUrl = 'https://api.x.com/2/tweets/search/' + endpointParam + '?' + params.toString();

  try {
    const authHeader = await buildOAuth1Header({
      method: 'GET',
      url: apiUrl,
      consumerKey: env.X_EN_API_KEY,
      consumerSecret: env.X_EN_API_SECRET,
      token: env.X_EN_ACCESS_TOKEN,
      tokenSecret: env.X_EN_ACCESS_TOKEN_SECRET,
    });

    const res = await fetch(apiUrl, {
      headers: {
        'Authorization': authHeader,
        'User-Agent': 'SimpleMemoAdmin/1.0',
      },
    });
    const body = await safeJson(res);

    const users = {};
    if (body && body.includes && Array.isArray(body.includes.users)) {
      for (const u of body.includes.users) users[u.id] = u;
    }
    const rawTweets = (body && Array.isArray(body.data)) ? body.data : [];
    const tweets = rawTweets.map(function (t) {
      const author = users[t.author_id] || {};
      const m = t.public_metrics || {};
      const username = author.username || 'i';
      return {
        id: t.id,
        url: 'https://x.com/' + username + '/status/' + t.id,
        author_id: t.author_id || null,
        author_username: author.username || null,
        author_name: author.name || null,
        created_at: t.created_at || null,
        lang: t.lang || null,
        text: t.text || '',
        like_count: m.like_count || 0,
        retweet_count: m.retweet_count || 0,
        reply_count: m.reply_count || 0,
        quote_count: m.quote_count || 0,
        impression_count: m.impression_count || 0,
      };
    });

    return json({
      status: res.status,
      ok: res.ok,
      endpoint: endpointParam,
      query: q,
      account: 'en', // どのアカウントの User Context で叩いたか（ログ/デバッグ用）
      tweets: tweets,
      result_count: (body && body.meta && body.meta.result_count) || tweets.length,
      next_token: (body && body.meta && body.meta.next_token) || null,
      newest_id: (body && body.meta && body.meta.newest_id) || null,
      oldest_id: (body && body.meta && body.meta.oldest_id) || null,
      rateLimit: {
        limit: res.headers.get('x-rate-limit-limit'),
        remaining: res.headers.get('x-rate-limit-remaining'),
        reset: res.headers.get('x-rate-limit-reset'),
      },
      errors: (body && (body.errors || body.error)) || null,
      title: (body && body.title) || null,
      detail: (body && body.detail) || null,
    }, res.ok ? 200 : res.status);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ---- OAuth 1.0a 署名ヘルパー ----
// 同じ実装が x-post.js / x-delete.js / x-verify.js にもある。共通モジュールに
// 抽出する案はあるが、現状は各エンドポイントで自己完結させる方針。

async function buildOAuth1Header(opts) {
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

async function safeJson(res) {
  try {
    return await res.json();
  } catch (e) {
    try {
      return { _raw: await res.text() };
    } catch (e2) {
      return { _raw: '(本文読み取り不能)' };
    }
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
