export async function GET(req: Request) {
  try {
    const url = new URL(req.url).searchParams.get("url");

    if (!url) {
      return new Response(JSON.stringify({ error: "Missing url parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Basic validation: only allow HTTPS remote URLs to avoid exposing local network
    if (!/^https:\/\//i.test(url)) {
      return new Response(
        JSON.stringify({ error: "Only https:// URLs are allowed" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Fetch the remote image
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let remoteRes: Response;
    try {
      remoteRes = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (!remoteRes.ok) {
      return new Response(null, { status: 502 });
    }

    const contentType =
      remoteRes.headers.get("content-type") || "application/octet-stream";

    // Only allow image content types
    if (!contentType.startsWith("image/")) {
      return new Response(
        JSON.stringify({ error: "Remote resource is not an image" }),
        {
          status: 415,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Stream the image back to the client with same-origin URL
    const body = remoteRes.body;

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Allow caching for a short time so repeated requests are faster
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("proxy-image error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to fetch remote image" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
