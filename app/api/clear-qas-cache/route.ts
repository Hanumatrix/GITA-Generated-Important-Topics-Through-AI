import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    // Optional secret header to avoid accidental deletes
    const secretHeader = req.headers.get("x-cache-clear-key");
    const expected = process.env.CACHE_CLEAR_KEY || null;
    if (expected && expected !== secretHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const cacheDir = path.join(process.cwd(), ".cache", "qas");
    if (!fs.existsSync(cacheDir)) {
      return new Response(JSON.stringify({ success: true, removed: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const files = fs.readdirSync(cacheDir).filter((f) => f.endsWith(".json"));
    let removed = 0;
    for (const f of files) {
      try {
        fs.unlinkSync(path.join(cacheDir, f));
        removed++;
      } catch (e) {
        console.warn("Failed to remove cache file", f, e);
      }
    }

    return new Response(JSON.stringify({ success: true, removed }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error clearing Q&A cache:", e);
    return new Response(JSON.stringify({ error: "Failed to clear cache" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
