// X API 接続確認用エンドポイント。
// 認証は /functions/admin/_middleware.js (Cloudflare Access) で担保されている
// ため、この関数自体では認証チェックをしない。
//
// 使い方:
//   GET /admin/api/x-verify?action=env
//     → Cloudflare 環境変数の存在フラグを返す（値は返さない）
//   GET /admin/api/x-verify?action=search&q=<query>
//     → X API v2 GET /2/tweets/search/recent を Bearer Token で叩く
//   GET /admin/api/x-verify?action=me[&account=ja|en]
//     → X API v2 GET /2/users/me を OAuth 1.0a User Context で叩く
//        account=ja (既定): X_API_KEY/SECRET + X_ACCESS_TOKEN/SECRET
//        account=en       : X_EN_API_KEY/SECRET + X_EN_ACCESS_TOKEN/SECRET
//        Bearer (App-only) では /2/users/me が拒否されるため OAuth1 を使う。

import { buildOAuth1Header, safeJson, json } from './_shared.js';

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'env';

  // 環境変数の存在フラグ（値は絶対に返さない）。
  // 投稿で実際に使う 9 キーのみ。X_USER_ACCESS_TOKEN は廃止。
  const envStatus = {
    X_BEARER_TOKEN: Boolean(env.X_BEARER_TOKEN),
    X_API_KEY: Boolean(env.X_API_KEY),
    X_API_SECRET: Boolean(env.X_API_SECRET),
    X_ACCESS_TOKEN: Boolean(env.X_ACCESS_TOKEN),
    X_ACCESS_TOKEN_SECRET: Boolean(env.X_ACCESS_TOKEN_SECRET),
    X_EN_API_KEY: Boolean(env.X_EN_API_KEY),
    X_EN_API_SECRET: Boolean(env.X_EN_API_SECRET),
    X_EN_ACCESS_TOKEN: Boolean(env.X_EN_ACCESS_TOKEN),
    X_EN_ACCESS_TOKEN_SECRET: Boolean(env.X_EN_ACCESS_TOKEN_SECRET),
  };

  if (action === 'env') {
    return json({ env: envStatus });
  }

  if (action === 'search') {
    if (!env.X_BEARER_TOKEN) {
      return json({
        status: 0,
        body: { error: 'X_BEARER_TOKEN が Cloudflare 環境変数に設定されていません。' },
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
    const account = url.searchParams.get('account') === 'en' ? 'en' : 'ja';
    const prefix = account === 'en' ? 'X_EN_' : 'X_';
    const credKeys = {
      consumerKey: prefix + 'API_KEY',
      consumerSecret: prefix + 'API_SECRET',
      token: prefix + 'ACCESS_TOKEN',
      tokenSecret: prefix + 'ACCESS_TOKEN_SECRET',
    };
    for (const k of Object.values(credKeys)) {
      if (!env[k]) {
        return json({
          status: 0,
          body: { error: k + ' が Cloudflare 環境変数に未設定です' },
        }, 400);
      }
    }
    const apiUrl = 'https://api.x.com/2/users/me';
    try {
      const authHeader = await buildOAuth1Header({
        method: 'GET',
        url: apiUrl,
        consumerKey: env[credKeys.consumerKey],
        consumerSecret: env[credKeys.consumerSecret],
        token: env[credKeys.token],
        tokenSecret: env[credKeys.tokenSecret],
      });
      const res = await fetch(apiUrl, {
        headers: {
          'Authorization': authHeader,
          'User-Agent': 'SimpleMemoAdmin/1.0',
        },
      });
      const body = await safeJson(res);
      return json({ status: res.status, account: account, body: body });
    } catch (e) {
      return json({ status: 0, body: { error: e.message } }, 500);
    }
  }

  return json({ error: '未知の action: ' + action }, 400);
}
