const CREDENTIALS = { user: "simplememo", pass: "tiktok2026" };

export async function onRequest(context) {
  const auth = context.request.headers.get("Authorization");

  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = atob(encoded);
      const [user, pass] = decoded.split(":");
      if (user === CREDENTIALS.user && pass === CREDENTIALS.pass) {
        return context.next();
      }
    }
  }

  return new Response("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Admin"' },
  });
}
