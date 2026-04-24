// captio 言及ツイート収集用エンドポイント
// 認証は /functions/admin/_middleware.js の Basic 認証で担保されている。
//
// 使い方:
//   GET /admin/api/x-captio-search?q=<query>&endpoint=recent|all&max_results=100&next_token=<token>
//     → X API v2 の GET /2/tweets/search/{recent|all} を叩き、正規化済みツイート配列と
//       next_token（あれば）を返す。User-Context ではなく App-only Bearer を使う。
//
// フロント側で localStorage に結果をマージしつつ、「次の100件を取得」ボタンで
// 毎回この endpoint を 1 コールだけ叩く想定。API 課金を抑えるため、サーバ側では
// ページを自動連結しない。

export async function onRequest(context) {
  const { request, env } = context;

  if (!env.X_BEARER_TOKEN) {
    return json({ error: 'X_BEARER_TOKEN が Cloudflare 環境変数に未登録です。' }, 400);
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
  // endpoint=all かつ未指定の場合は Twitter 創業日 (2006-03-21) を自動注入して全アーカイブ対象にする。
  const effectiveStartTime = startTime
    || (endpointParam === 'all' ? '2006-03-21T00:00:00Z' : '');
  if (effectiveStartTime) params.set('start_time', effectiveStartTime);
  if (endTime) params.set('end_time', endTime);
  // 並びはサーバ側で触らず、フロントで created_at 昇順ソートする

  const apiUrl = 'https://api.x.com/2/tweets/search/' + endpointParam + '?' + params.toString();

  try {
    const res = await fetch(apiUrl, {
      headers: {
        'Authorization': 'Bearer ' + env.X_BEARER_TOKEN,
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
