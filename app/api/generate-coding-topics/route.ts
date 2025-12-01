import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { getNextAPIKey, markAPIKeyExhausted } from "@/lib/api-key-rotator";

const topicSchema = z.object({
  id: z.string().describe("Unique identifier for the topic"),
  title: z.string().describe("Topic title"),
  description: z
    .string()
    .describe("Brief description of the topic (2-3 sentences)"),
  key_points: z.array(z.string()).describe("3-5 key learning points"),
  difficulty: z.enum(["Easy", "Medium", "Hard"]).describe("Difficulty level"),
  estimated_problems: z
    .number()
    .min(0)
    .max(5)
    .describe("Estimated number of coding problems for this topic"),
});

const topicsSchema = z.object({
  topics: z
    .array(topicSchema)
    .min(3)
    .max(10)
    .describe("3-10 programming topics extracted from the syllabus content"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { content } = body || {};

    if (!content) {
      return new Response(
        JSON.stringify({
          error: "Missing required field: content",
        }),
        { status: 400 }
      );
    }

    const prompt = `You are an expert computer science educator. Analyze the following syllabus content and extract 3-10 distinct programming topics that would benefit from coding practice problems.

Syllabus Content:
${content}

Requirements:
- Extract topics that are practical and can be tested with C programming problems
- Each topic should be distinct and focused
- Provide clear descriptions and key learning points
- Assign appropriate difficulty levels
- Estimate how many coding problems (0-5) would be suitable for each topic
- Focus on topics like: data structures, algorithms, control flow, pointers, file handling, etc.

Generate a comprehensive list of topics that cover the syllabus content.`;

    let result: any = null;
    let lastError: any = null;
    let attempts = 0;
    const maxAttempts = 3;
    const usedKeys: string[] = [];

    while (attempts < maxAttempts) {
      try {
        const apiKey = getNextAPIKey();
        usedKeys.push(apiKey);
        result = await generateObject({
          model: google("gemini-2.0-flash"),
          schema: topicsSchema,
          prompt,
          temperature: 0.7,
        });
        break;
      } catch (error: any) {
        lastError = error;
        attempts++;

        // Only mark key as exhausted on FINAL attempt failure
        if (attempts === maxAttempts) {
          const lastKey = usedKeys[usedKeys.length - 1];
          if (
            error?.status === 429 ||
            error?.message?.includes("429") ||
            error?.message?.includes("quota") ||
            error?.message?.includes("rate")
          ) {
            markAPIKeyExhausted(lastKey);
            console.warn(
              `[Rate Limit] API key exhausted after ${maxAttempts} attempts`
            );
          }
        }

        if (attempts < maxAttempts) {
          console.warn(
            `[Retry] Attempt ${attempts}/${maxAttempts} failed, trying next key...`
          );
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }

        throw error;
      }
    }

    if (!result) {
      throw (
        lastError ||
        new Error("Failed to generate coding topics after multiple attempts")
      );
    }

    return Response.json(result.object);
  } catch (error) {
    console.error("Error generating topics:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Generation failed",
      }),
      { status: 500 }
    );
  }
}
