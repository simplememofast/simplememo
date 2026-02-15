const CREDENTIALS = { user: "simplememo", pass: "tiktok2026" };
const COOKIE_NAME = "admin_auth";
const COOKIE_VALUE = "ok_29f8a3c1";

function isAuthenticated(request) {
  // Check cookie
  const cookie = request.headers.get("Cookie") || "";
  if (cookie.includes(COOKIE_NAME + "=" + COOKIE_VALUE)) return true;
  // Check Basic Auth header (for curl/API)
  const auth = request.headers.get("Authorization");
  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = atob(encoded);
      const [user, pass] = decoded.split(":");
      if (user === CREDENTIALS.user && pass === CREDENTIALS.pass) return true;
    }
  }
  return false;
}

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Login — Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#000;color:#fff;min-height:100dvh;display:flex;align-items:center;justify-content:center}
.card{background:#0d1117;border:1px solid rgba(100,160,220,.12);border-radius:12px;padding:32px;width:320px}
h1{font-size:.9rem;color:rgba(255,255,255,.7);margin-bottom:20px;text-align:center}
h1 b{color:#6ab4ff}
input{width:100%;font-family:inherit;font-size:.85rem;padding:10px 12px;border-radius:6px;border:1px solid rgba(100,160,220,.12);background:#000;color:#fff;margin-bottom:12px}
input:focus{outline:none;border-color:#6ab4ff}
button{width:100%;font-family:inherit;font-size:.85rem;font-weight:700;padding:10px;border-radius:6px;border:none;background:#6ab4ff;color:#000;cursor:pointer}
button:hover{background:#4fc3f7}
.err{color:#f85149;font-size:.75rem;text-align:center;margin-top:10px;display:none}
</style>
</head>
<body>
<div class="card">
<h1><b>TikTok</b> Slide Builder</h1>
<form id="f">
<input name="user" placeholder="Username" autocomplete="username" required>
<input name="pass" type="password" placeholder="Password" autocomplete="current-password" required>
<button type="submit">Login</button>
</form>
<div class="err" id="err">Invalid credentials</div>
</div>
<script>
document.getElementById('f').addEventListener('submit',function(e){
  e.preventDefault();
  var user=this.user.value,pass=this.pass.value;
  fetch(location.href,{headers:{'Authorization':'Basic '+btoa(user+':'+pass)}})
  .then(function(r){
    if(r.ok){location.reload();}
    else{document.getElementById('err').style.display='block';}
  });
});
</script>
</body>
</html>`;

export async function onRequest(context) {
  const { request } = context;

  // Handle login POST via fetch with Basic Auth → set cookie
  if (request.headers.get("Authorization") && !isAuthenticated(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (isAuthenticated(request)) {
    const response = await context.next();
    // If auth came from header (not cookie), set the cookie
    const cookie = request.headers.get("Cookie") || "";
    if (!cookie.includes(COOKIE_NAME + "=" + COOKIE_VALUE)) {
      const newResponse = new Response(response.body, response);
      newResponse.headers.append(
        "Set-Cookie",
        COOKIE_NAME + "=" + COOKIE_VALUE + "; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=86400"
      );
      return newResponse;
    }
    return response;
  }

  // Show login page
  return new Response(LOGIN_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html;charset=UTF-8" },
  });
}
