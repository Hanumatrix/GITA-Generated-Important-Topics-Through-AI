import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Save syllabus and its topics to the database
export const saveSyllabus = mutation({
  args: {
    title: v.string(),
    fileSize: v.number(),
    fileName: v.string(),
    topics: v.array(
      v.object({
        title: v.string(),
        description: v.string(),
        importance_score: v.number(),
        marks_value: v.number(),
        has_diagrams: v.boolean(),
        key_points: v.array(v.string()),
        questions_answers: v.array(
          v.object({
            question: v.string(),
            answer: v.string(),
          })
        ),
        coding_problems: v.array(
          v.object({
            problem_title: v.string(),
            problem_statement: v.string(),
            difficulty: v.string(),
            algorithm_type: v.string(),
            time_complexity: v.string(),
            space_complexity: v.string(),
            needs_diagram: v.boolean(),
            code_solution: v.string(),
            explanation: v.string(),
          })
        ),
      })
    ),
    relationships: v.array(
      v.object({
        topic_a_id: v.string(),
        topic_b_id: v.string(),
        relationship_type: v.string(),
        relationship_strength: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Save syllabus record
    const syllabiId = await ctx.db.insert("syllabi", {
      title: args.title,
      extractedAt: Date.now(),
      fileSize: args.fileSize,
      fileName: args.fileName,
    });

    // Save topics and their Q&As
    const topicIdMap: { [key: string]: string } = {};

    for (const topic of args.topics) {
      const topicId = await ctx.db.insert("topics", {
        syllabiId,
        title: topic.title,
        description: topic.description,
        importance_score: topic.importance_score,
        marks_value: topic.marks_value,
        has_diagrams: topic.has_diagrams,
        key_points: topic.key_points,
      });

      topicIdMap[topic.title] = topicId;

      // Save questions and answers
      for (const qa of topic.questions_answers) {
        await ctx.db.insert("questionsAnswers", {
          topicId,
          question: qa.question,
          answer: qa.answer,
        });
      }
      // Save coding problems if provided
      if (
        (topic as any).coding_problems &&
        (topic as any).coding_problems.length
      ) {
        for (const cp of (topic as any).coding_problems) {
          await ctx.db.insert("codingProblems", {
            topicId,
            problem_title: cp.problem_title,
            problem_statement: cp.problem_statement,
            difficulty: cp.difficulty,
            algorithm_type: cp.algorithm_type,
            time_complexity: cp.time_complexity,
            space_complexity: cp.space_complexity,
            needs_diagram: cp.needs_diagram,
            code_solution: cp.code_solution,
            explanation: cp.explanation,
          });
        }
      }
    }

    // Save relationships
    for (const rel of args.relationships) {
      await ctx.db.insert("relationships", {
        syllabiId,
        topic_a_id: rel.topic_a_id,
        topic_b_id: rel.topic_b_id,
        relationship_type: rel.relationship_type,
        relationship_strength: rel.relationship_strength,
      });
    }

    // Return the created syllabus id along with the inserted topic ids so
    // clients can reference them (useful for saving per-topic coding problems).
    const topicsInfo = Object.keys(topicIdMap).map((title) => ({
      title,
      topicId: topicIdMap[title],
    }));

    return { syllabiId, topics: topicsInfo };
  },
});

// Get all topics for a syllabus
export const getTopics = query({
  args: {
    syllabiId: v.id("syllabi"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("topics")
      .filter((q) => q.eq(q.field("syllabiId"), args.syllabiId))
      .collect();
  },
});

// Get questions and answers for a topic
export const getQuestionsAnswers = query({
  args: {
    topicId: v.id("topics"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("questionsAnswers")
      .filter((q) => q.eq(q.field("topicId"), args.topicId))
      .collect();
  },
});

// Get coding problems for a topic
export const getCodingProblems = query({
  args: {
    topicId: v.id("topics"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("codingProblems")
      .filter((q) => q.eq(q.field("topicId"), args.topicId))
      .collect();
  },
});

// Save coding problems for a topic
export const saveCodingProblems = mutation({
  args: {
    topicId: v.id("topics"),
    coding_problems: v.array(
      v.object({
        problem_title: v.string(),
        problem_statement: v.string(),
        difficulty: v.string(),
        algorithm_type: v.string(),
        time_complexity: v.string(),
        space_complexity: v.string(),
        needs_diagram: v.boolean(),
        code_solution: v.string(),
        explanation: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Delete existing coding problems for this topic
    const existing = await ctx.db
      .query("codingProblems")
      .filter((q) => q.eq(q.field("topicId"), args.topicId))
      .collect();

    for (const problem of existing) {
      await ctx.db.delete(problem._id);
    }

    // Insert new coding problems
    for (const problem of args.coding_problems) {
      await ctx.db.insert("codingProblems", {
        topicId: args.topicId,
        ...problem,
      });
    }

    return args.coding_problems.length;
  },
});

// Get full syllabus with all topics, Q&As, and coding problems
export const getSyllabusFull = query({
  args: {
    syllabiId: v.id("syllabi"),
  },
  handler: async (ctx, args) => {
    const syllabus = await ctx.db.get(args.syllabiId);
    if (!syllabus) return null;

    const topics = await ctx.db
      .query("topics")
      .filter((q) => q.eq(q.field("syllabiId"), args.syllabiId))
      .collect();

    // Fetch Q&As and coding problems for each topic
    const topicsWithQAAndCoding = await Promise.all(
      topics.map(async (topic) => {
        const qas = await ctx.db
          .query("questionsAnswers")
          .filter((q) => q.eq(q.field("topicId"), topic._id))
          .collect();

        const codingProblems = await ctx.db
          .query("codingProblems")
          .filter((q) => q.eq(q.field("topicId"), topic._id))
          .collect();

        return {
          ...topic,
          questions_answers: qas,
          coding_problems: codingProblems,
        };
      })
    );

    // Fetch relationships
    const relationships = await ctx.db
      .query("relationships")
      .filter((q) => q.eq(q.field("syllabiId"), args.syllabiId))
      .collect();

    return { ...syllabus, topics: topicsWithQAAndCoding, relationships };
  },
});

// Get all syllabi
export const getAllSyllabi = query({
  handler: async (ctx) => {
    return await ctx.db.query("syllabi").order("desc").take(50);
  },
});

// Search syllabi by title
export const searchSyllabi = query({
  args: {
    query: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("syllabi")
      .withSearchIndex("search_title", (q) => q.search("title", args.query))
      .take(20);
  },
});

// Delete syllabus and all related data
export const deleteSyllabus = mutation({
  args: {
    syllabiId: v.id("syllabi"),
  },
  handler: async (ctx, args) => {
    // Delete Q&As and coding problems for all topics
    const topics = await ctx.db
      .query("topics")
      .filter((q) => q.eq(q.field("syllabiId"), args.syllabiId))
      .collect();

    for (const topic of topics) {
      const qas = await ctx.db
        .query("questionsAnswers")
        .filter((q) => q.eq(q.field("topicId"), topic._id))
        .collect();

      for (const qa of qas) {
        await ctx.db.delete(qa._id);
      }

      const codingProblems = await ctx.db
        .query("codingProblems")
        .filter((q) => q.eq(q.field("topicId"), topic._id))
        .collect();

      for (const problem of codingProblems) {
        await ctx.db.delete(problem._id);
      }

      // Delete topic
      await ctx.db.delete(topic._id);
    }

    // Delete relationships
    const relationships = await ctx.db
      .query("relationships")
      .filter((q) => q.eq(q.field("syllabiId"), args.syllabiId))
      .collect();

    for (const rel of relationships) {
      await ctx.db.delete(rel._id);
    }

    // Delete syllabus
    await ctx.db.delete(args.syllabiId);
  },
});
