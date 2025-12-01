import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

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

    const result = await generateObject({
      model: google("gemini-2.0-flash"),
      schema: topicsSchema,
      prompt,
      temperature: 0.7,
    });

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
