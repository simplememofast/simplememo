// Retired by the owner on 2026-10-20. Never run downstream SNS handlers.
// Keep this terminal middleware even after removing credentials: historical
// deployments retain their own code and secrets and must remain Access-blocked.
export async function onRequest() {
  return new Response("This administration feature has been retired.\n", {
    status: 410,
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
