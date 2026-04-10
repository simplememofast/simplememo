// X API 接続確認用エンドポイント
// 認証は /functions/admin/_middleware.js の Basic 認証で担保されているため、
// この関数自体では認証チェックをしない（middleware 通過後にのみ到達する）。
//
// 使い方:
//   GET /admin/api/x-verify?action=env
//     → Cloudflare 環境変数が設定されているかを true/false で返す（値は返さない）
//   GET /admin/api/x-verify?action=search&q=<query>
//     → X API v2 の GET /2/tweets/search/recent に Bearer Token で問い合わせる
//   GET /admin/api/x-verify?action=me
//     → X API v2 の GET /2/users/me に User Access Token で問い合わせる

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'env';

  // 環境変数の存在フラグ（値は絶対に返さない）
  const envStatus = {
    X_BEARER_TOKEN: Boolean(env.X_BEARER_TOKEN),
    X_API_KEY: Boolean(env.X_API_KEY),
    X_API_SECRET: Boolean(env.X_API_SECRET),
    X_ACCESS_TOKEN: Boolean(env.X_ACCESS_TOKEN),
    X_ACCESS_TOKEN_SECRET: Boolean(env.X_ACCESS_TOKEN_SECRET),
    X_USER_ACCESS_TOKEN: Boolean(env.X_USER_ACCESS_TOKEN),
  };

  if (action === 'env') {
    return json({ env: envStatus });
  }

  if (action === 'search') {
    if (!env.X_BEARER_TOKEN) {
      return json({
        status: 0,
        body: { error: 'X_BEARER_TOKEN が Cloudflare 環境変数に設定されていません。「セットアップ手順」タブを参照してください。' },
      }, 400);
    }
    const q = url.searchParams.get('q') || 'from:simplememofast';
    const apiUrl = 'https://api.x.com/2/tweets/search/recent'
      + '?max_results=10'
      + '&tweet.fields=created_at,public_metrics,lang'
      + '&query=' + encodeURIComponent(q);
    try {
      const res = await fetch(apiUrl, {
        headers: {
          'Authorization': 'Bearer ' + env.X_BEARER_TOKEN,
          'User-Agent': 'SimpleMemoAdmin/1.0',
        },
      });
      const body = await safeJson(res);
      return json({
        status: res.status,
        body: body,
        rateLimit: {
          limit: res.headers.get('x-rate-limit-limit'),
          remaining: res.headers.get('x-rate-limit-remaining'),
          reset: res.headers.get('x-rate-limit-reset'),
        },
      });
    } catch (e) {
      return json({ status: 0, body: { error: e.message } }, 500);
    }
  }

  if (action === 'me') {
    const token = env.X_USER_ACCESS_TOKEN || env.X_BEARER_TOKEN;
    if (!token) {
      return json({
        status: 0,
        body: { error: 'X_USER_ACCESS_TOKEN または X_BEARER_TOKEN を登録してください。' },
      }, 400);
    }
    try {
      const res = await fetch('https://api.x.com/2/users/me', {
        headers: {
          'Authorization': 'Bearer ' + token,
          'User-Agent': 'SimpleMemoAdmin/1.0',
        },
      });
      const body = await safeJson(res);
      return json({ status: res.status, body: body });
    } catch (e) {
      return json({ status: 0, body: { error: e.message } }, 500);
    }
  }

  return json({ error: '未知の action: ' + action }, 400);
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
