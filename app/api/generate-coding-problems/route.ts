import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { getNextAPIKey, markAPIKeyExhausted } from "@/lib/api-key-rotator";

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
      "1-5 coding problems tailored to the topic. Each includes title, statement, code solution, and detailed explanation."
    ),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { topic, language, single_problem } = body || {};

    // Allow caller to request a programming language; default to C for backward compatibility
    const codeLanguage = (language || "C").toString();

    // If client requested generation for a single problem (translation/regenerate), build a focused prompt
    let prompt: string;

    if (single_problem) {
      const title = single_problem.problem_title || "";
      const statement = single_problem.problem_statement || "";
      const alg = single_problem.algorithm_type || "";

      prompt = `You are an expert computer science educator. For the following single problem, provide a complete, runnable ${codeLanguage} code solution (with comments), a concise explanation focused on the important functions, and complexity analysis. Return the result matching the coding problem schema.

Problem Title: ${title}
Problem Statement: ${statement}
Algorithm type: ${alg}

Requirements:
- Provide complete, runnable ${codeLanguage} code with comments
- Give a concise explanation that names the important functions and explains their roles
- Provide time and space complexity
- Do not include unrelated extra problems; return only this problem in the format requested.`;
    } else {
      if (!topic) {
        return new Response(
          JSON.stringify({
            error: "Missing required field: topic",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          }
        );
      }

      prompt = `You are an expert computer science educator. Generate practical coding problems in ${codeLanguage} language for the following topic:

Topic: ${topic.title}
Description: ${topic.description}
Key Points: ${(topic.key_points || []).join(", ")}
Difficulty Level: ${topic.difficulty || "Medium"}

  Requirements:
- Generate ${topic.estimated_problems || 3} coding problems directly related to this topic
- Each problem should test understanding of the key points
  - Provide complete, runnable ${codeLanguage} code solutions with proper comments
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
    }

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
          schema: codingProblemsSchema,
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
        new Error("Failed to generate coding problems after multiple attempts")
      );
    }

    return new Response(JSON.stringify(result.object), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (error) {
    console.error("Error generating coding problems:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Generation failed",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  }
}
