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

  try {
    const formData = await context.request.formData();
    const file = formData.get("file");
    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    // Read file content and create a fresh Blob to ensure proper
    // serialisation in Cloudflare Workers (File re-attach can lose data).
    const buf = await file.arrayBuffer();
    const upstream = new FormData();
    upstream.append(
      "file",
      new Blob([buf], { type: file.type || "image/png" }),
      file.name || "slide.png"
    );

    const res = await fetch("https://api.postiz.com/public/v1/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: "Postiz non-JSON response", body: text.slice(0, 500), status: res.status };
    }
    return Response.json(data, { status: res.status });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
