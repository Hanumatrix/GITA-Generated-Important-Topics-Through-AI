import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

const codingProblemSchema = z.object({
  problem_title: z
    .string()
    .describe("Short, descriptive title for the coding problem"),
  problem_statement: z
    .string()
    .describe("Brief problem statement (1-2 sentences)"),
  code_solution: z.string().describe("Complete C language code solution"),
  explanation: z
    .string()
    .describe(
      "Detailed explanation of the approach, algorithm, key concepts, and how the code works. Include step-by-step breakdown for student understanding."
    ),
  algorithm_type: z
    .string()
    .optional()
    .describe("Type of algorithm (e.g., 'sorting', 'dynamic programming')"),
  difficulty: z
    .enum(["Easy", "Medium", "Hard"])
    .optional()
    .describe("Difficulty level of the problem"),
  time_complexity: z
    .string()
    .optional()
    .describe("Big-O time complexity (e.g., 'O(n log n)')"),
  space_complexity: z
    .string()
    .optional()
    .describe("Big-O space complexity (e.g., 'O(1)')"),
  needs_diagram: z
    .boolean()
    .optional()
    .describe("Whether a diagram would help explain this problem"),
});

const codingProblemsSchema = z.object({
  coding_problems: z
    .array(codingProblemSchema)
    .min(1)
    .max(5)
    .describe(
      "1-5 coding problems tailored to the topic. Each includes title, statement, C code solution, and detailed explanation."
    ),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { topic } = body || {};

    if (!topic) {
      return new Response(
        JSON.stringify({
          error: "Missing required field: topic",
        }),
        { status: 400 }
      );
    }

    const prompt = `You are an expert computer science educator. Generate practical coding problems in C language for the following topic:

Topic: ${topic.title}
Description: ${topic.description}
Key Points: ${(topic.key_points || []).join(", ")}
Difficulty Level: ${topic.difficulty || "Medium"}

Requirements:
- Generate ${topic.estimated_problems || 3} coding problems directly related to this topic
- Each problem should test understanding of the key points
- Provide complete, runnable C code solutions with proper comments
- Include complexity analysis (time and space)
- Mark difficulty level appropriately (Easy/Medium/Hard)
- EXPLANATION FOCUS: In the explanation, focus ONLY on the important functions and how they are used
  * Name each important function (e.g., isSafe(), buildBoard(), etc.)
  * Explain what each important function does
  * Explain how and why each function is called
  * Do NOT explain variables, loops, or basic logic - only the important functions
  * Keep explanations concise and function-focused
- Identify the algorithm type (e.g., sorting, tree traversal, dynamic programming)
- Problems should be practical, educational, and progressively challenging

Generate coding problems that help students master this specific topic.`;

    const result = await generateObject({
      model: google("gemini-2.0-flash"),
      schema: codingProblemsSchema,
      prompt,
      temperature: 0.7,
    });

    return Response.json(result.object);
  } catch (error) {
    console.error("Error generating coding problems:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Generation failed",
      }),
      { status: 500 }
    );
  }
}
