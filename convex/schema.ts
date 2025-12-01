import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  syllabi: defineTable({
    title: v.string(),
    extractedAt: v.number(),
    fileSize: v.number(),
    fileName: v.string(),
  })
    .index("by_extractedAt", ["extractedAt"])
    .searchIndex("search_title", {
      searchField: "title",
    }),

  topics: defineTable({
    syllabiId: v.id("syllabi"),
    title: v.string(),
    description: v.string(),
    importance_score: v.number(),
    marks_value: v.number(),
    has_diagrams: v.boolean(),
    key_points: v.array(v.string()),
  }).index("by_syllabiId", ["syllabiId"]),

  questionsAnswers: defineTable({
    topicId: v.id("topics"),
    question: v.string(),
    answer: v.string(),
  }).index("by_topicId", ["topicId"]),

  codingProblems: defineTable({
    topicId: v.id("topics"),
    problem_title: v.string(),
    problem_statement: v.string(),
    difficulty: v.string(),
    algorithm_type: v.string(),
    time_complexity: v.string(),
    space_complexity: v.string(),
    needs_diagram: v.boolean(),
    code_solution: v.string(),
    explanation: v.string(),
  }).index("by_topicId", ["topicId"]),

  relationships: defineTable({
    syllabiId: v.id("syllabi"),
    topic_a_id: v.string(),
    topic_b_id: v.string(),
    relationship_type: v.string(),
    relationship_strength: v.number(),
  }).index("by_syllabiId", ["syllabiId"]),
});
