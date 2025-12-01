import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const questionAnswerSchema = z.object({
  question: z.string().describe("Important exam-style question"),
  answer: z
    .string()
    .describe(
      "Concise, well-structured answer (aim for 350-450 words). Use short sub-headings and bullet points rather than long paragraphs."
    ),
  unit_reference: z
    .string()
    .optional()
    .describe(
      "Optional: which unit within the syllabus this question is based on"
    ),
});

const answersSchema = z.object({
  questions_answers: z
    .array(questionAnswerSchema)
    .min(3)
    .max(6)
    .describe(
      "3-6 exam-style questions with concise answers. Answers should favor short headings and bullets for readability."
    ),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { content, topic } = body || {};

    if (!content || !topic) {
      return Response.json(
        { error: "Missing content or topic" },
        { status: 400 }
      );
    }

    // Simple server-side cache: compute a deterministic cache key using SHA256 hash
    // to avoid Windows 260-char path limit issues
    const buildCacheKey = (content: string, topicTitle: string) => {
      const combined = content + "::" + topicTitle;
      return crypto.createHash("sha256").update(combined).digest("hex");
    };

    const cacheKey = buildCacheKey(content, topic.title || "");
    const cacheDir = path.join(process.cwd(), ".cache", "qas");
    const cachePath = path.join(cacheDir, `${cacheKey}.json`);

    // Server-side TTL (seconds). Default to 7 days.
    const ttlSeconds = Number(
      process.env.QAS_CACHE_TTL_SECONDS ?? 7 * 24 * 3600
    );

    try {
      if (fs.existsSync(cachePath)) {
        const cachedRaw = fs.readFileSync(cachePath, "utf8");
        const cached = JSON.parse(cachedRaw);
        const createdAt = cached.createdAt ? Number(cached.createdAt) : null;
        const ageSec = createdAt
          ? Math.floor((Date.now() - createdAt) / 1000)
          : null;
        if (ageSec == null || ageSec <= ttlSeconds) {
          // Return cached result with indicator to client
          const payload = { questions_answers: cached.questions_answers || [] };
          return new Response(
            JSON.stringify({ success: true, cached: true, ...payload }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        } else {
          // Expired - attempt to remove the file and continue
          try {
            fs.unlinkSync(cachePath);
          } catch (rmErr) {
            console.warn("Failed to remove expired Q&A cache:", rmErr);
          }
        }
      }
    } catch (e) {
      // Non-fatal: if cache read fails, continue to generate
      console.warn("Q&A cache read error:", e);
    }

    // Prompt to generate Q&As ONLY (coding problems are generated separately for speed)
    const result = await generateObject({
      model: google("gemini-2.0-flash"),
      schema: answersSchema,
      prompt: `You are an expert syllabus-driven educator. Based on the syllabus content and topic provided, generate 3-6 important exam-style questions with detailed answers.

Syllabus Content:
${content}

Topic:
Title: ${topic.title}
Description: ${topic.description}
Key Points: ${Array.isArray(topic.key_points) ? topic.key_points.join(", ") : ""}

Requirements:
- Generate 3-6 exam-style questions directly from the syllabus content
- Each answer should be 350-450 words
- Use short sub-headings and bullet points for readability
- Include optional unit_reference if the question relates to a specific section
- Only use information from the provided syllabus content
- Do not invent or add material outside the content

Return ONLY the JSON object with questions_answers array.`,
      temperature: 0.7,
    });

    const questions_answers = Array.isArray(result.object?.questions_answers)
      ? result.object.questions_answers
      : [];

    // Persist to server-side cache directory for subsequent requests
    try {
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      const payload = { questions_answers, createdAt: Date.now() };
      fs.writeFileSync(cachePath, JSON.stringify(payload), "utf8");
    } catch (e) {
      console.warn("Failed to write Q&A cache:", e);
    }

    return Response.json({ success: true, questions_answers });
  } catch (error) {
    console.error("generate-topic-answers error:", error);

    // Detect rate limit / quota errors coming from the AI SDK
    try {
      // Many AI errors include nested information in `lastError`, `data`,
      // or a JSON string in `responseBody`. Try to extract useful details.
      const anyErr: any = error;

      // Helper to extract retry seconds from strings like "9s" or ISO durations
      const parseRetrySeconds = (val: any) => {
        if (!val) return null;
        // If a string like "9s" -> 9
        const sMatch = String(val).match(/(\d+)s/);
        if (sMatch) return Number(sMatch[1]);
        // If number in ms or seconds
        const n = Number(val);
        if (!Number.isNaN(n)) return Math.max(0, Math.floor(n));
        return null;
      };

      // Check known places for quota info
      let statusCode: number | null = null;
      let retryAfterSeconds: number | null = null;
      if (anyErr?.lastError?.statusCode)
        statusCode = anyErr.lastError.statusCode;
      if (anyErr?.status) statusCode = anyErr.status;
      if (anyErr?.data?.error?.code) statusCode = anyErr.data.error.code;

      // Try headers first
      const headers = anyErr?.lastError?.responseHeaders;
      if (headers) {
        const ra = headers["retry-after"] || headers["Retry-After"];
        retryAfterSeconds = parseRetrySeconds(ra);
      }

      // If still not found, try parsing responseBody JSON
      if (anyErr?.lastError?.responseBody && retryAfterSeconds == null) {
        try {
          const body = JSON.parse(anyErr.lastError.responseBody);
          if (body?.error?.details && Array.isArray(body.error.details)) {
            for (const d of body.error.details) {
              if (
                d["@type"] &&
                d["@type"].includes("RetryInfo") &&
                d.retryDelay
              ) {
                retryAfterSeconds = parseRetrySeconds(d.retryDelay);
                break;
              }
              // Some errors include a 'retryDelay' directly
              if (d.retryDelay) {
                retryAfterSeconds = parseRetrySeconds(d.retryDelay);
                break;
              }
            }
          }
          // Also probe top-level error message for "retryDelay": "9s"
          if (retryAfterSeconds == null && body?.error?.message) {
            const m = String(body.error.message).match(
              /retryDelay":\s*"?(\d+)s/
            );
            if (m) retryAfterSeconds = Number(m[1]);
          }
        } catch (parseErr) {
          // ignore JSON parse errors
        }
      }

      // If it's a quota/rate limit situation, return 429 with Retry-After when possible
      const isQuota =
        String(error).toLowerCase().includes("quota") ||
        String(error).toLowerCase().includes("rate limit") ||
        statusCode === 429 ||
        anyErr?.data?.error?.status === "RESOURCE_EXHAUSTED";

      if (isQuota) {
        const payload: any = {
          error: anyErr?.message || "AI quota or rate limit exceeded",
          quotaExceeded: true,
        };
        const headersOut: Record<string, string> = {};
        if (retryAfterSeconds != null) {
          payload.retryAfterSeconds = retryAfterSeconds;
          headersOut["Retry-After"] = String(retryAfterSeconds);
        }
        return new Response(JSON.stringify(payload), {
          status: 429,
          headers: { "Content-Type": "application/json", ...headersOut },
        });
      }
    } catch (e) {
      // Fall through to generic 500 handler below
      console.error("Error while inspecting AI error details:", e);
    }

    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
