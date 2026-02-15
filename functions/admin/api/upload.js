/**
 * POST /admin/api/upload
 * Proxies image upload to Postiz API.
 * Expects multipart/form-data with a "file" field.
 * Requires POSTIZ_API_KEY env var in Cloudflare Pages.
 */
export async function onRequestPost(context) {
  const apiKey = context.env.POSTIZ_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "POSTIZ_API_KEY not configured" }, { status: 500 });
  }

  const formData = await context.request.formData();
  const file = formData.get("file");
  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.append("file", file, file.name);

  const res = await fetch("https://api.postiz.com/public/v1/upload", {
    method: "POST",
    headers: { Authorization: apiKey },
    body: upstream,
  });

  const data = await res.json();
  return Response.json(data, { status: res.status });
}
