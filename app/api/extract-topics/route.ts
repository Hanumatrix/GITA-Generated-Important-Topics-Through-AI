import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

const topicSchema = z.object({
  title: z.string().describe("Topic title"),
  description: z.string().describe("Detailed description of the topic"),
  importance_score: z.number().min(0).max(1).describe("Importance score 0-1"),
  marks_value: z
    .number()
    .min(0)
    .max(50)
    .describe("Estimated marks for this topic (0-50)"),
  has_diagrams: z.boolean().describe("Whether this topic involves diagrams"),
  key_points: z
    .array(z.string())
    .min(3)
    .describe("3+ concise key learning points"),
});

const topicsSchema = z.object({
  topics: z
    .array(topicSchema)
    .min(1)
    .max(200)
    .describe("Extract at least 1 topic, up to 200"),
  connections: z
    .array(
      z.object({
        topic_a_idx: z.number(),
        topic_b_idx: z.number(),
        relationship: z.string(),
        strength: z.number().min(0).max(1),
      })
    )
    .default([])
    .optional(),
});

export async function POST(req: Request) {
  try {
    const { content } = await req.json();

    if (!content) {
      return Response.json({ error: "Missing content" }, { status: 400 });
    }

    // Extract title from the beginning of the content (first line or heading)
    const titleMatch = content.match(/^(#{1,6}\s+)?(.+?)(?:\n|$)/);
    const title = titleMatch ? titleMatch[2].trim() : "Syllabus Analysis";

    // Generate topics using AI with detailed Q&A content.
    // We use a schema with `generateObject`, but the model may sometimes return
    // valid JSON that doesn't fully satisfy the schema (e.g. fewer Q&As). To
    // avoid throwing a 500 on minor mismatches we add a fallback: if
    // `generateObject` errors, attempt to parse the raw `text` from the AI
    // response and continue.
    let object: any = null;
    try {
      const result = await generateObject({
        model: google("gemini-2.0-flash"),
        schema: topicsSchema,
        messages: [
          {
            role: "user",
            content: `You are an expert educational analyst. Analyze the syllabus content and extract 20-25 important topics as JSON objects (do NOT include questions/answers at this stage).\n\nSyllabus Title: ${title}\n\nSyllabus Content:\n${content}\n\nFor each topic return:\n- title (string)\n- description (2-3 sentences)\n- importance_score (0-1)\n- marks_value (0-50)\n- has_diagrams (boolean)\n- key_points (array of 3-8 concise learning points)\n\nReturn only valid JSON matching this shape. Generate roughly 20-25 topics when possible.`,
          },
        ],
      });

      // `generateObject` returns { object } when schema validation passes.
      object = (result as any).object;
    } catch (aiError: any) {
      console.warn(
        "AI generation error (schema validation). Attempting fallback parse.",
        aiError?.message || aiError
      );

      // Try to parse raw text from the AI error object if available.
      const rawText = aiError?.text || aiError?.response?.text;
      if (rawText && typeof rawText === "string") {
        try {
          object = JSON.parse(rawText);
          console.warn(
            "Parsed AI text fallback into object (may not satisfy schema)."
          );
        } catch (parseErr) {
          // Attempt to salvage by taking substring between first '{' and last '}'
          try {
            const first = rawText.indexOf("{");
            const last = rawText.lastIndexOf("}");
            if (first !== -1 && last !== -1 && last > first) {
              const candidate = rawText.substring(first, last + 1);
              object = JSON.parse(candidate);
              console.warn("Parsed JSON from substring fallback.");
            }
          } catch (innerErr) {
            console.error("Fallback parse failed:", innerErr);
            throw aiError; // rethrow original AI error
          }
        }
      } else {
        throw aiError; // nothing to parse, propagate
      }
    }

    const topics = (object?.topics || []).map((topic: any, index: number) => ({
      id: `topic-${index}-${Date.now()}`,
      title: topic.title,
      description: topic.description,
      importance_score: topic.importance_score,
      marks_value: topic.marks_value,
      has_diagrams: topic.has_diagrams,
      key_points: Array.isArray(topic.key_points) ? topic.key_points : [],
      content: Array.isArray(topic.key_points)
        ? topic.key_points.join("\n")
        : topic.description || "",
    }));

    const relationships = (object.connections || [])
      .map((conn: any) => ({
        topic_a_id: topics[conn.topic_a_idx]?.id,
        topic_b_id: topics[conn.topic_b_idx]?.id,
        relationship_type: conn.relationship,
        relationship_strength: conn.strength,
      }))
      .filter((rel: any) => rel.topic_a_id && rel.topic_b_id);

    return Response.json({
      success: true,
      title: title,
      topicsCount: topics.length,
      topics,
      relationships,
    });
  } catch (error) {
    console.error("Error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
