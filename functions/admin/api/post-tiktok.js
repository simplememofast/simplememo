/**
 * POST /admin/api/post-tiktok
 * Creates a TikTok post via Postiz API, scheduled 1 min from now.
 *
 * Body JSON: { images: [{id, path}], caption: string }
 * Requires POSTIZ_API_KEY and POSTIZ_TIKTOK_ID env vars in Cloudflare Pages.
 */
export async function onRequestPost(context) {
  const apiKey = context.env.POSTIZ_API_KEY;
  const integrationId = context.env.POSTIZ_TIKTOK_ID;
  if (!apiKey || !integrationId) {
    return Response.json({ error: "POSTIZ_API_KEY or POSTIZ_TIKTOK_ID not configured" }, { status: 500 });
  }

  const { images, caption } = await context.request.json();
  if (!images || images.length === 0) {
    return Response.json({ error: "No images provided" }, { status: 400 });
  }

  const scheduleDate = new Date(Date.now() + 60_000).toISOString();

  const payload = {
    type: "schedule",
    date: scheduleDate,
    shortLink: false,
    tags: [],
    posts: [{
      integration: { id: integrationId },
      value: [{
        content: caption || "",
        image: images.map(img => ({ id: img.id, path: img.path })),
      }],
      settings: {
        __type: "tiktok",
        privacy_level: "SELF_ONLY",
        duet: false,
        stitch: false,
        comment: true,
        autoAddMusic: "no",
        brand_content_toggle: false,
        brand_organic_toggle: false,
        content_posting_method: "UPLOAD",
      },
    }],
  };

  const res = await fetch("https://api.postiz.com/public/v1/posts", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  return Response.json({ ok: res.ok, scheduleDate, data }, { status: res.status });
}
