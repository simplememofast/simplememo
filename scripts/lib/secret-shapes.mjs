/**
 * 資格情報の「形」をした値を探す（2026-11-10 監査）。
 *
 * data/publication-policy.json と data/operating-memory.json は「実値の混入を
 * 検査で止め続ける」と書いているが、値を見る検査はこれまで1つも無かった（名前と
 * 台帳を見る check-credentials.mjs だけ）。公開リポジトリなので、ここで止めても
 * 露出そのものは防げない（PR を開いた時点で見える）。止められるのは本番配信と
 * 自動マージで、公開の前に効くのは autopilot-publish の verifyHandoff に置いた分。
 *
 * **値も値の断片も返さない。**返すのは行番号と種類だけ（ログに写さないため）。
 * パターンは締めてある: テスト用の合成値（`ghp_TEST_SENTINEL_TOKEN_never_on_disk`
 * のように `_` を含むもの）や URL のスラッグに当たらないように。
 */
export const SECRET_SHAPES = [
  ['github_token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['github_fine_grained_pat', /\bgithub_pat_[A-Za-z0-9_]{22,}/],
  ['anthropic_key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['openai_key', /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}|\bsk-[A-Za-z0-9]{48}\b/],
  ['resend_key', /\bre_[A-Za-z0-9]{6,}_[A-Za-z0-9]{16,}/],
  ['google_api_key', /\bAIza[0-9A-Za-z_-]{35}/],
  ['aws_access_key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['slack_token', /\bxox[baprs]-[0-9A-Za-z-]{10,}/],
  ['slack_webhook', /hooks\.slack\.com\/services\/T[0-9A-Z]+\/B[0-9A-Z]+\/[0-9A-Za-z]{20,}/],
  ['google_oauth_token', /\bya29\.[0-9A-Za-z_-]{20,}/],
  ['google_oauth_secret', /\bGOCSPX-[0-9A-Za-z_-]{20,}/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['private_key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['gcp_service_account', /"private_key_id"\s*:\s*"[0-9a-f]{20,}"/],
  // パスにトークンを埋めた API の URL（設定ファイルへ貼った接続先の URL で起きる形）。
  // api.github.com と api.indexnow.org は除く: 前者のパスにはコミットや blob の SHA（40/64桁の16進）が
  // 普通に入り（GitHub のトークンは gh*_ の形で上が拾う）、後者の key は公開が前提（<key>.txt で配信する）。
  // 桁数（40/64）では除かない: 接続先の URL に埋めるトークンには、SHA-256 と同じ 64 桁の16進のものがある。
  ['token_in_api_url', /https:\/\/(?:api\.(?!github\.com\/|indexnow\.org\/)|mcp\.)[a-z0-9.-]+\/[^\s"')<>]*[0-9a-f]{32,}/],
];

/**
 * JSON と JS の文字列は改行やタブを `\n` `\t` の2文字で持つ。値がその直後に来ると、手前が語の文字（n, t）に
 * なって先頭の `\b` が効かない（JSON.stringify が書く複数行のメモが、まさにこの形になる）。各行をもう一度、
 * エスケープを空白に（`\/` は `/` に）戻して読む。空白を足すだけなので、元の行で当たらなかったものが
 * 語境界の分だけ当たるようになるほかは変わらない。
 */
const ESCAPES = /\\(?:[nrtbfv0]|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2})/g;

/** text の中の該当を `{ line, kind }` で返す。値は返さない。 */
export function scanText(text) {
  const hits = [];
  String(text ?? '').split('\n').forEach((line, i) => {
    const unescaped = line.replace(/\\\//g, '/').replace(ESCAPES, ' ');
    for (const [kind, re] of SECRET_SHAPES) {
      if (re.test(line) || (unescaped !== line && re.test(unescaped))) hits.push({ line: i + 1, kind });
    }
  });
  return hits;
}

/** 自己テストの検体。値はどれも合成（実在しない）。 */
export const SHAPE_SAMPLES = {
  positive: [
    ['github_token', 'token: ghp_' + 'a1B2c3D4e5'.repeat(4)],
    ['github_fine_grained_pat', 'github_pat_' + '11ABCDEFG0' + '_abcdefghijklmnop'],
    ['anthropic_key', 'ANTHROPIC_API_KEY=sk-ant-' + 'api03-' + 'x'.repeat(30)],
    ['openai_key', 'OPENAI_API_KEY=sk-proj-' + 'Y'.repeat(30)],
    ['resend_key', 'RESEND_API_KEY=re_' + 'AbCdEf12' + '_' + 'z'.repeat(20)],
    ['google_api_key', 'key=AIza' + 'S'.repeat(35)],
    ['aws_access_key', 'AKIA' + 'Q'.repeat(16)],
    ['slack_token', 'xoxb-' + '1234567890-abcdef'],
    ['slack_webhook', 'https://hooks.slack.com/services/' + 'T0000AAAA/' + 'B0000BBBB/' + 'c'.repeat(24)],
    ['google_oauth_token', 'Authorization: Bearer ya29.' + 'g'.repeat(24)],
    ['google_oauth_secret', 'client_secret=GOCSPX-' + 'q'.repeat(28)],
    ['jwt', 'eyJ' + 'h'.repeat(12) + '.eyJ' + 'p'.repeat(12) + '.' + 's'.repeat(12)],
    ['private_key', '-----BEGIN ' + 'EC PRIVATE KEY-----'],
    ['gcp_service_account', '"private_key_id": "' + 'a'.repeat(40) + '"'],
    ['token_in_api_url', 'https://api.example.com/mcp/' + 'f'.repeat(64)],
    // JSON / JS のエスケープの直後（JSON.stringify が複数行のメモをこう書く）。
    ['github_token', JSON.stringify({ note: 'line1\n' + 'ghp_' + 'a1B2c3D4e5'.repeat(4) })],
    ['aws_access_key', JSON.stringify({ note: 'a\t' + 'AKIA' + 'Q'.repeat(16) })],
    ['anthropic_key', '"line1\\r\\nsk-ant-' + 'api03-' + 'x'.repeat(30) + '"'],
    ['token_in_api_url', '{"url":"https:\\/\\/mcp.example.com\\/sse\\/' + 'e'.repeat(40) + '"}'],
    // 同じホスト名で始まる別のホストは除外しない。
    ['token_in_api_url', 'https://api.github.com.example.net/x/' + 'f'.repeat(40)],
  ],
  negative: [
    'ghp_TEST_SENTINEL_TOKEN_never_on_disk',
    'https://simplememofast.com/blog/sk-memo-app-guide',
    'OPENAI_API_KEY=sk-proj-your-key-here',
    'const re = /\\bsk-ant-/;',
    'https://example.org/assets/' + 'a'.repeat(10) + '.png',
    'AKIA0000',
    // コミット・blob の SHA と IndexNow の公開鍵は資格情報ではない。
    'https://api.github.com/repos/o/r/commits/' + '0123456789abcdef'.repeat(3).slice(0, 40) + '/check-runs',
    'https://api.github.com/repos/o/r/git/blobs/' + 'd'.repeat(40),
    'https://api.github.com/repos/o/r/compare/main...' + 'a'.repeat(40),
    'https://api.github.com/repos/o/r/actions/runs?head_sha=' + 'b'.repeat(40),
    'https://api.indexnow.org/indexnow?url=https://simplememofast.com/&key=' + 'c'.repeat(32),
    // エスケープを空白に戻しても、正規表現の本文や語の途中は当たらない。
    'const re = /\\bAKIA[0-9A-Z]{16}\\b/;',
    '{"note":"line1\\nsee docs"}',
  ],
};
