"use client";
import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sun, Moon } from "lucide-react";
import { FaGithub, FaTwitter } from "react-icons/fa";
import type { Topic, Relationship } from "@/types";
import { extractTextFromFile } from "@/lib/extract-text-from-file";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useToast } from "@/hooks/use-toast";

export default function Page() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const saveSyllabusMutation = useMutation(api.syllabi.saveSyllabus);
  const [file, setFile] = useState<File | null>(null);
  const [extractedTitle, setExtractedTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setDarkMode(theme === "dark");
  }, [theme]);

  const [progress, setProgress] = useState(0);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [codingTopics, setCodingTopics] = useState<Topic[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [originalContent, setOriginalContent] = useState<string>("");
  const [showUpload, setShowUpload] = useState(true);
  const [selectedRegularTopic, setSelectedRegularTopic] =
    useState<Topic | null>(null);
  const [selectedCodingTopic, setSelectedCodingTopic] = useState<Topic | null>(
    null
  );
  const [generatingTopicIndex, setGeneratingTopicIndex] = useState<
    number | null
  >(null);
  const [openCodingIndex, setOpenCodingIndex] = useState<number | null>(null);
  // Add loading states for coding topic generation
  const [loadingCodingTopics, setLoadingCodingTopics] = useState(false);
  const [loadingProblemsForTopic, setLoadingProblemsForTopic] = useState<
    number | null
  >(null);
  const [topicImages, setTopicImages] = useState<{ [topicId: string]: string }>(
    {}
  );
  const [loadingImages, setLoadingImages] = useState<{
    [topicId: string]: boolean;
  }>({});
  const [topicTab, setTopicTab] = useState<"regular" | "coding">("regular");
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);
  // Helper to get current selected topic based on active tab
  const selectedTopic =
    topicTab === "regular" ? selectedRegularTopic : selectedCodingTopic;

  // Cached indicators per topic index (server cache)
  const [cachedTopics, setCachedTopics] = useState<{
    [index: number]: boolean;
  }>({});
  const { toast } = useToast();

  // Helper to set selected topic for a specific tab or the active tab.
  // If `tab` is provided, it sets the selection for that tab regardless
  // of the current `topicTab`. If omitted, it sets for the currently active tab.
  const setSelectedTopic = (
    topic: Topic | null,
    tab?: "regular" | "coding"
  ) => {
    const target = tab ?? topicTab;
    if (target === "regular") {
      setSelectedRegularTopic(topic);
    } else {
      setSelectedCodingTopic(topic);
    }
  };

  // Images for individual questions: key format `${topicId}::q::${qaIdx}` -> imageUrl
  const [topicQuestionImages, setTopicQuestionImages] = useState<{
    [key: string]: string;
  }>({});
  const [topicQuestionImageLoading, setTopicQuestionImageLoading] = useState<{
    [key: string]: boolean;
  }>({});

  // Modal state for image preview
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [selectedImageQuestion, setSelectedImageQuestion] =
    useState<string>("");

  // Sanitize AI-generated text: remove markdown bold markers, backticks, and
  // stray heading markers so the UI shows clean plain text.
  const sanitizeAIText = (text: string) => {
    if (!text) return text;
    try {
      let t = text;
      // Replace bold markdown **text** with text
      t = t.replace(/\*\*(.*?)\*\*/g, "$1");
      // Remove inline code/backticks
      t = t.replace(/`([^`]*)`/g, "$1");
      // Remove markdown headings like ## Heading
      t = t.replace(/^#{1,6}\s*/gm, "");
      // Remove any remaining stray asterisks used for emphasis
      t = t.replace(/\*(.*?)\*/g, "$1");
      // Trim each line and collapse multiple blank lines to two
      t = t
        .split("\n")
        .map((l) => l.trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n");
      return t.trim();
    } catch (e) {
      return text;
    }
  };

  // Convert a coding problem into a Topic object for the Coding Topics list
  const codingProblemToTopic = (cp: any, index: number): Topic => {
    return {
      id: `coding-topic-${index}-${Date.now()}`,
      _id: `coding-topic-${index}-${Date.now()}`,
      title: cp.problem_title || cp.title || `Coding Problem ${index + 1}`,
      description: cp.problem_statement || cp.explanation || "",
      importance_score:
        cp.difficulty === "Hard" ? 0.9 : cp.difficulty === "Medium" ? 0.7 : 0.5,
      marks_value:
        cp.difficulty === "Hard" ? 10 : cp.difficulty === "Medium" ? 7 : 5,
      has_diagrams: !!cp.needs_diagram,
      key_points: Array.isArray(cp.key_points) ? cp.key_points : [],
      content: cp.explanation || cp.problem_statement || "",
      questions_answers: [],
      coding_problems: [
        {
          problem_title: cp.problem_title || cp.title || `Problem ${index + 1}`,
          problem_statement: cp.problem_statement || cp.explanation || "",
          difficulty: (cp.difficulty as any) || "Medium",
          algorithm_type: cp.algorithm_type || "",
          time_complexity: cp.time_complexity || "",
          space_complexity: cp.space_complexity || "",
          needs_diagram: !!cp.needs_diagram,
          code_solution: cp.code_solution || "",
          explanation: cp.explanation || "",
        },
      ],
    };
  };

  // Fetch topic image from Google Images (via Unsplash/Pexels)
  const fetchTopicImage = async (topic: Topic) => {
    if (!topic.id || !topic.has_diagrams) return;
    if (topicImages[topic.id]) return; // Already loaded

    setLoadingImages((prev) => ({ ...prev, [topic.id]: true }));

    try {
      // Build a richer query for image sources: include title, description and
      // a few key points so search engines or generators get better context.
      const keyPointsText = Array.isArray(topic.key_points)
        ? topic.key_points.slice(0, 3).join("; ")
        : "";
      const promptParts = [topic.title, topic.description, keyPointsText]
        .filter(Boolean)
        .join(" - ");
      const query = `${promptParts} diagram educational illustration`;

      const res = await fetch("/api/fetch-topic-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: query }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.imageUrl) {
          setTopicImages((prev) => ({ ...prev, [topic.id]: data.imageUrl }));
        }
      }
    } catch (err) {
      console.error("Error fetching topic image:", err);
    } finally {
      setLoadingImages((prev) => ({ ...prev, [topic.id]: false }));
    }
  };

  // Lazily generate coding problems for a single coding-topic (clicked by user)
  const generateCodingProblemsForCodingTopic = async (
    codingTopic: Topic,
    index: number
  ) => {
    if (!codingTopic) return;

    // If already has problems, just display them
    if (codingTopic.coding_problems && codingTopic.coding_problems.length > 0) {
      setSelectedTopic(codingTopic, "coding");
      return;
    }

    setLoadingProblemsForTopic(index);
    setError(null);

    try {
      // Step 2: Generate actual coding problems for this specific topic
      const res = await fetch("/api/generate-coding-problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: codingTopic }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err?.error || "Failed to generate coding problems");
      }

      const data = await res.json();
      const coding = data.coding_problems || [];

      const sanitizedCoding = coding.map((cp: any) => ({
        problem_title: sanitizeAIText(cp.problem_title || ""),
        problem_statement: sanitizeAIText(cp.problem_statement || ""),
        code_solution: cp.code_solution || "",
        explanation: cp.explanation || "",
        algorithm_type: cp.algorithm_type || "Unknown",
        difficulty: cp.difficulty || "Medium",
        time_complexity: cp.time_complexity || "N/A",
        space_complexity: cp.space_complexity || "N/A",
        needs_diagram: cp.needs_diagram || false,
      }));

      // Update the coding topics array with the generated problems
      const updated = codingTopics.map((ct, i) =>
        i === index ? { ...ct, coding_problems: sanitizedCoding } : ct
      );

      setCodingTopics(updated);
      setSelectedTopic(
        { ...codingTopic, coding_problems: sanitizedCoding },
        "coding"
      );
      localStorage.setItem("coding_topics", JSON.stringify(updated));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoadingProblemsForTopic(null);
    }
  };

  // Format AI-generated answers for readability:
  // - Preserve existing lists (lines starting with -, *, •, or digits+.)
  // - Turn common subheadings like 'Definition:', 'Explanation:' into separate
  //   lines with whitespace so they look like small sub-headings
  // - If the answer is a single long paragraph, split into bullet points by
  //   sentence boundaries (grouping 2 sentences per bullet) to make it easier
  //   to scan.
  const formatAIAnswer = (text: string) => {
    const cleaned = sanitizeAIText(text || "");

    if (!cleaned) return cleaned;

    // If text already contains explicit list items or multiple paragraphs,
    // keep those structures but ensure headings have spacing.
    const lines = cleaned.split("\n").map((l) => l.trim());

    // Detect if any line starts as a list item
    const hasListItem = lines.some((l) => /^([-*•]|\d+\.)\s+/.test(l));
    const hasMultipleParagraphs =
      lines.filter((l) => l.length > 0).length > 3 || cleaned.includes("\n\n");

    // Convert common subheading patterns like 'Definition:', 'Explanation:'
    const headingPattern =
      /^\s*(Definition|Explanation|Overview|Key Points|Steps|Causes|Effects|Summary|Conclusion)\s*:\s*/i;

    if (hasListItem || hasMultipleParagraphs) {
      // Normalize headings by adding an extra blank line before them
      const normalized = lines
        .map((l) => (headingPattern.test(l) ? `\n${l}` : l))
        .join("\n")
        // collapse triple newlines
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      return normalized;
    }

    // Otherwise split into sentences and make bullets (2 sentences per bullet)
    // Basic sentence split: look for [.?!] followed by space and capital letter or number
    const sentenceSplit = cleaned
      .replace(/\s+/g, " ")
      .split(/(?<=[.?!])\s+(?=[A-Z0-9"'"'])/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (sentenceSplit.length === 1) {
      // Short single sentence, just return cleaned text
      return cleaned;
    }

    const bullets: string[] = [];
    for (let i = 0; i < sentenceSplit.length; i += 2) {
      const group = sentenceSplit.slice(i, i + 2).join(" ");
      bullets.push("• " + group);
    }

    // If the first sentence looks like a heading (ends with ':'), promote it
    if (/^\w[\w\s]{0,60}:$/.test(sentenceSplit[0])) {
      const heading = sentenceSplit.shift() as string;
      const bodyBullets: string[] = [];
      for (let i = 0; i < sentenceSplit.length; i += 2) {
        bodyBullets.push("• " + sentenceSplit.slice(i, i + 2).join(" "));
      }
      return `${heading}\n\n${bodyBullets.join("\n\n")}`.trim();
    }

    return bullets.join("\n\n").trim();
  };

  // Render formatted answer with headings and bullet points
  const renderFormattedAnswer = (answer: string) => {
    const cleaned = sanitizeAIText(answer || "");
    if (!cleaned) return null;

    // Split by lines to detect sections with headers
    const lines = cleaned
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l);
    const sections: Array<{ heading?: string; bullets: string[] }> = [];
    let currentSection: { heading?: string; bullets: string[] } = {
      bullets: [],
    };

    const headingPattern =
      /^(Definition|Explanation|Overview|Key Points|Steps|Causes|Effects|Summary|Conclusion|Introduction|Importance|Applications|Examples|Characteristics|Features|Components|Types|Methods|Procedure|Process|Algorithm|Formula|Syntax|Note|Important)\s*:?$/i;

    lines.forEach((line) => {
      // Check if line is a heading (ends with : or matches common heading patterns)
      if (
        headingPattern.test(line) ||
        /.*:\s*$/.test(line) ||
        /^[A-Z][A-Za-z\s]{3,50}$/.test(line)
      ) {
        // This is a heading, save current section and start new one
        if (currentSection.bullets.length > 0 || currentSection.heading) {
          sections.push(currentSection);
        }
        currentSection = { heading: line.replace(/:\s*$/, ""), bullets: [] };
      } else if (/^([-*•]|\d+\.)\s+/.test(line)) {
        // Already a bullet point
        currentSection.bullets.push(line.replace(/^([-*•]|\d+\.)\s+/, ""));
      } else {
        // Regular text - add as bullet
        currentSection.bullets.push(line);
      }
    });

    // Don't forget the last section
    if (currentSection.bullets.length > 0 || currentSection.heading) {
      sections.push(currentSection);
    }

    // If no sections were created, just create one with all bullets
    if (sections.length === 0) {
      sections.push({
        bullets: lines,
      });
    }

    return (
      <div className="space-y-5">
        {sections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-2">
            {section.heading && (
              <h5
                className="font-semibold text-sm uppercase tracking-wide"
                style={{ color: "#eb9e75" }}
              >
                {section.heading}
              </h5>
            )}
            <div className="space-y-2 ml-2">
              {section.bullets.map((bullet, bIdx) => (
                <div key={bIdx} className="flex gap-3 leading-relaxed text-sm">
                  <span
                    style={{
                      color: "#eb9e75",
                      fontWeight: 700,
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    •
                  </span>
                  <p
                    className="flex-1"
                    style={
                      darkMode ? { color: "#FFFFFF" } : { color: "#000000" }
                    }
                  >
                    {bullet}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render code with editor-like syntax highlighting
  const renderCodeBlock = (code: string) => {
    const lines = code.split("\n");

    // Tokenize a line into colored segments
    const tokenizeLine = (
      line: string
    ): Array<{ type: string; text: string }> => {
      const tokens: Array<{ type: string; text: string }> = [];
      let remaining = line;

      while (remaining.length > 0) {
        // Check for comment
        let match = remaining.match(/^(\/\/.*|\/\*[\s\S]*?\*\/)/);
        if (match) {
          tokens.push({ type: "comment", text: match[0] });
          remaining = remaining.slice(match[0].length);
          continue;
        }

        // Check for string
        match = remaining.match(/^("([^"\\]|\\.)*"|'([^'\\]|\\.)*')/);
        if (match) {
          tokens.push({ type: "string", text: match[0] });
          remaining = remaining.slice(match[0].length);
          continue;
        }

        // Check for keyword
        match = remaining.match(
          /^(int|void|double|char|float|struct|return|if|else|for|while|break|include|sizeof|typedef|const|static|printf|scanf|malloc|free|qsort)\b/
        );
        if (match) {
          tokens.push({ type: "keyword", text: match[0] });
          remaining = remaining.slice(match[0].length);
          continue;
        }

        // Regular character
        tokens.push({ type: "text", text: remaining[0] });
        remaining = remaining.slice(1);
      }

      return tokens;
    };

    const getTokenColor = (type: string) => {
      switch (type) {
        case "keyword":
          return "#569cd6"; // Bright blue
        case "comment":
          return "#6a9955"; // Bright green
        case "string":
          return "#ce9178"; // Bright orange
        default:
          return "#d4d4d4"; // Always bright gray for dark background
      }
    };

    const getTokenStyle = (type: string) => {
      const style: any = { color: getTokenColor(type) };
      if (type === "keyword") style.fontWeight = "bold";
      if (type === "comment") style.fontStyle = "italic";
      return style;
    };

    return (
      <div
        className="rounded-lg border overflow-x-auto"
        style={{
          backgroundColor: "#1E1E1E",
          borderColor: "#2A2A2A",
        }}
      >
        <pre
          className="p-0 m-0"
          style={{ fontFamily: "'Courier New', monospace" }}
        >
          {lines.map((line, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                borderBottom: "#2A2A2A",
              }}
            >
              <span
                style={{
                  minWidth: "50px",
                  paddingRight: "1rem",
                  paddingLeft: "0.5rem",
                  textAlign: "right",
                  color: "#858585",
                  userSelect: "none",
                  borderRight: "1px solid #2A2A2A",
                  lineHeight: "1.5",
                }}
              >
                {idx + 1}
              </span>
              <span
                style={{
                  flex: 1,
                  padding: "0 1rem",
                  color: "#d4d4d4",
                  lineHeight: "1.5",
                  whiteSpace: "pre-wrap",
                  wordWrap: "break-word",
                }}
              >
                {tokenizeLine(line).map((token, tIdx) => (
                  <span key={tIdx} style={getTokenStyle(token.type)}>
                    {token.text}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </pre>
      </div>
    );
  };

  // Render detailed explanation with proper formatting and structure
  const renderDetailedExplanation = (explanation: string) => {
    if (!explanation) return null;

    // Remove asterisks, backticks, and clean up formatting
    let cleanedExplanation = explanation
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .replace(/\*/g, "");

    // Limit to approximately 150 words
    const words = cleanedExplanation.split(/\s+/);
    if (words.length > 150) {
      cleanedExplanation = words.slice(0, 150).join(" ") + "...";
    }

    // Function name pattern - highlight function calls like isSafe(), board[], etc.
    const highlightFunctionNames = (text: string) => {
      // Match function names with parentheses or array brackets
      const functionPattern = /([a-zA-Z_]\w*(?:\[\]|\([^)]*\))?)/g;
      const parts: Array<{ type: string; text: string }> = [];
      let lastIndex = 0;

      let match;
      const regex = new RegExp(functionPattern);
      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          parts.push({
            type: "text",
            text: text.substring(lastIndex, match.index),
          });
        }
        // Check if it looks like a function/variable (has () or [])
        if (match[0].includes("(") || match[0].includes("[")) {
          parts.push({ type: "function", text: match[0] });
        } else {
          parts.push({ type: "text", text: match[0] });
        }
        lastIndex = regex.lastIndex;
      }

      if (lastIndex < text.length) {
        parts.push({ type: "text", text: text.substring(lastIndex) });
      }

      return parts;
    };

    // Split into sections and format as systematic reading material
    const sections = cleanedExplanation
      .split(/(?:\n\n|^)/m)
      .filter((s) => s.trim());

    return (
      <div className="space-y-4">
        {sections.map((section, sIdx) => {
          // Convert to bullet points for better readability
          const sentences = section
            .split(/(?<=[.!?])\s+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

          return (
            <ul
              key={sIdx}
              className="space-y-3 ml-4"
              style={{
                listStyleType: "disc",
              }}
            >
              {sentences.map((sentence, sentIdx) => (
                <li
                  key={sentIdx}
                  style={{
                    color: darkMode ? "#E0E0E0" : "#475569",
                    lineHeight: "1.6",
                  }}
                >
                  {highlightFunctionNames(sentence).map((part, pIdx) =>
                    part.type === "function" ? (
                      <span
                        key={pIdx}
                        style={{
                          color: "#eb9e75",
                          fontWeight: "bold",
                          fontFamily: "'Courier New', monospace",
                        }}
                      >
                        {part.text}
                      </span>
                    ) : (
                      <span key={pIdx}>{part.text}</span>
                    )
                  )}
                </li>
              ))}
            </ul>
          );
        })}
      </div>
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };
  // Fetch an image for a specific question
  const fetchImageForQuestion = async (
    topicId: string,
    questionText: string,
    qaIdx: number
  ) => {
    const key = `${topicId}::q::${qaIdx}`;
    setTopicQuestionImageLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const response = await fetch("/api/fetch-topic-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: questionText }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.imageUrl) {
          setTopicQuestionImages((prev) => ({
            ...prev,
            [key]: data.imageUrl,
          }));
        }
      }
    } catch (err) {
      console.error("Error fetching question image:", err);
    } finally {
      setTopicQuestionImageLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Check if a Q&A needs a diagram based on keywords
  const questionNeedsDiagram = (qa: any) => {
    const text = `${qa.question} ${qa.answer}`.toLowerCase();
    const keywords = [
      "diagram",
      "draw",
      "illustrate",
      "figure",
      "plot",
      "graph",
      "visual",
      "map",
      "flowchart",
      "sequence",
    ];
    return keywords.some((keyword) => text.includes(keyword));
  };

  const handleTopicClick = async (topic: Topic, index: number) => {
    // Select immediately so the UI updates
    setSelectedTopic(topic, "regular");

    // If topic already has both Q&As and coding problems, nothing to do.
    // If either is missing (for example Q&As exist but coding problems do not),
    // fetch again so both sections are populated.
    if (
      topic.questions_answers &&
      topic.questions_answers.length > 0 &&
      topic.coding_problems &&
      topic.coding_problems.length > 0
    ) {
      // Clear any lingering loading state from previous operations
      setGeneratingTopicIndex(null);
      return;
    }

    if (!originalContent) {
      setError("Original syllabus content is missing");
      setGeneratingTopicIndex(null);
      return;
    }

    try {
      setError(null);

      // Build a cache key from syllabus content + topic title so cached Q&As
      // are content-sensitive and won't be reused across different syllabi.
      const buildCacheKey = (content: string, topicTitle: string) => {
        try {
          // Use base64 encoding of the combined string as a simple cache key
          return `qas::${btoa(unescape(encodeURIComponent(content + "::" + topicTitle)))}`;
        } catch (e) {
          // Fallback: simple JSON string
          return `qas::${JSON.stringify({ t: topicTitle, c: content }).slice(0, 200)}`;
        }
      };

      const cacheKey = buildCacheKey(originalContent || "", topic.title || "");

      // Try localStorage cache first to avoid repeated AI calls and hitting quota
      try {
        const cached =
          typeof window !== "undefined" ? localStorage.getItem(cacheKey) : null;
        if (cached) {
          const parsed = JSON.parse(cached);
          const qas = parsed.questions_answers || [];
          const coding = parsed.coding_problems || [];

          // Sanitize cached content as if it was freshly generated
          const sanitizedQAs = (qas || []).map((qa: any) => ({
            question: sanitizeAIText(
              typeof qa.question === "string"
                ? qa.question
                : String(qa.question || "")
            ),
            answer: formatAIAnswer(
              typeof qa.answer === "string"
                ? qa.answer
                : String(qa.answer || "")
            ),
          }));

          const sanitizedCoding = (coding || []).map((cp: any) => ({
            title: sanitizeAIText(
              typeof cp.title === "string" ? cp.title : String(cp.title || "")
            ),
            code: typeof cp.code === "string" ? cp.code : String(cp.code || ""),
            explanation: sanitizeAIText(
              typeof cp.explanation === "string"
                ? cp.explanation
                : String(cp.explanation || "")
            ),
          }));

          const newTopics = (topics || []).map((t, i) =>
            i === index
              ? {
                  ...t,
                  questions_answers: sanitizedQAs,
                  coding_problems: sanitizedCoding,
                }
              : t
          );

          setTopics(newTopics);
          setOpenCodingIndex(null);
          const updatedTopic = {
            ...topic,
            questions_answers: sanitizedQAs,
            coding_problems: sanitizedCoding,
          };
          setSelectedTopic(updatedTopic, "regular");

          // Fetch images for diagram Q&As (as before)
          sanitizedQAs.forEach((qa: any, qaIdx: number) => {
            if (questionNeedsDiagram(qa)) {
              fetchImageForQuestion(
                topic.id || topic._id || topic.title,
                qa.question,
                qaIdx
              );
            }
          });

          // Mark as cached for UI
          setCachedTopics((prev) => ({ ...prev, [index]: true }));
          // Clear loading state since we're using cached data
          setGeneratingTopicIndex(null);
          return;
        }
      } catch (cacheErr) {
        console.warn("Q&A cache read failed:", cacheErr);
      }

      // Only now set the loading state since cache miss — actually calling AI
      setGeneratingTopicIndex(index);

      // If cache miss, call AI route to generate Q&As
      const res = await fetch("/api/generate-topic-answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: originalContent,
          topic,
          topicIndex: index,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        // Surface 429 to user with retry info using toast
        if (res.status === 429) {
          const retry = err?.retryAfterSeconds;
          const message =
            err?.error || "AI quota exceeded. Please retry later.";
          toast({
            title: "Rate limit",
            description: retry
              ? `${message} Try again in ${retry} seconds.`
              : message,
          });
        }
        throw new Error(err.error || "Failed to generate answers");
      }

      const data = await res.json();
      const qas = data.questions_answers || [];
      const coding = data.coding_problems || [];

      // If server returned cached data, clear loading state immediately
      if ((data as any)?.cached) {
        setGeneratingTopicIndex(null);
      }

      // Sanitize Q&As (exclude unit_reference as it's not in Convex schema)
      const sanitizedQAs = (qas || []).map((qa: any) => ({
        question: sanitizeAIText(
          typeof qa.question === "string"
            ? qa.question
            : String(qa.question || "")
        ),
        answer: formatAIAnswer(
          typeof qa.answer === "string" ? qa.answer : String(qa.answer || "")
        ),
      }));

      // Sanitize coding problems: keep code as-is but sanitize titles/explanations
      const sanitizedCoding = (coding || []).map((cp: any) => ({
        title: sanitizeAIText(
          typeof cp.title === "string" ? cp.title : String(cp.title || "")
        ),
        code: typeof cp.code === "string" ? cp.code : String(cp.code || ""),
        explanation: sanitizeAIText(
          typeof cp.explanation === "string"
            ? cp.explanation
            : String(cp.explanation || "")
        ),
      }));

      // Prepare new topics array with sanitized Q&As and coding problems
      const newTopics = (topics || []).map((t, i) =>
        i === index
          ? {
              ...t,
              questions_answers: sanitizedQAs,
              coding_problems: sanitizedCoding,
            }
          : t
      );

      // Update topics locally
      setTopics(newTopics);

      // Reset coding toggle when generating a new topic
      setOpenCodingIndex(null);

      // Update selected topic with Q&As and coding problems
      const updatedTopic = {
        ...topic,
        questions_answers: sanitizedQAs,
        coding_problems: sanitizedCoding,
      };
      setSelectedTopic(updatedTopic, "regular");

      // If server indicated a cached response, mark it for UI
      if ((data as any)?.cached) {
        setCachedTopics((prev) => ({ ...prev, [index]: true }));
        toast({
          title: "Cached result",
          description: "Using cached Q&A for this topic.",
        });
      } else {
        // Clear cached flag for this index if present
        setCachedTopics((prev) => {
          const copy = { ...prev };
          delete copy[index];
          return copy;
        });
      }

      // For each generated QA, fetch an illustrative image if heuristic matches
      sanitizedQAs.forEach((qa: any, qaIdx: number) => {
        if (questionNeedsDiagram(qa)) {
          // Use question + short answer context as prompt
          const promptText = `${qa.question} ${qa.answer}`.slice(0, 800);
          fetchImageForQuestion(topic.id, promptText, qaIdx).catch((e) =>
            console.error(e)
          );
        }
      });

      // Fetch image for topic if it has diagrams
      if (updatedTopic.has_diagrams) {
        fetchTopicImage(updatedTopic);
      }

      // Persist updated syllabus to Convex
      try {
        await saveSyllabusMutation({
          title: extractedTitle || "Syllabus Analysis",
          fileSize: file?.size || 0,
          fileName: file?.name || "",
          topics: newTopics.map((t) => ({
            title: t.title,
            description: t.description,
            importance_score: t.importance_score,
            marks_value: t.marks_value,
            has_diagrams: t.has_diagrams ?? false,
            key_points: t.key_points ?? [],
            questions_answers: (t as any).questions_answers || [],
            coding_problems: (t as any).coding_problems || [],
          })) as any,
          relationships: (relationships || []).map((r) => ({
            topic_a_id: r.topic_a_id,
            topic_b_id: r.topic_b_id,
            relationship_type: r.relationship_type ?? "related",
            relationship_strength: r.relationship_strength ?? 0,
          })) as any,
        });
      } catch (convexErr) {
        console.error("Convex save error after generating QAs:", convexErr);
      }

      // Update localStorage
      localStorage.setItem(
        "syllabus_data",
        JSON.stringify({
          title: extractedTitle || "Syllabus Analysis",
          topics: newTopics,
          relationships,
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGeneratingTopicIndex(null);
    }
  };

  // Explicitly generate coding problems for a topic (user-triggered)
  // Generate coding topics from the document
  const generateCodingTopics = async () => {
    if (!originalContent) {
      setError("Original syllabus content is missing");
      return;
    }

    setLoadingCodingTopics(true);
    setError(null);

    try {
      const res = await fetch("/api/generate-coding-topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: originalContent,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate coding topics");
      }

      const data = await res.json();
      const topics_list = data.topics || []; // API returns 'topics', not 'coding_topics'

      const newCodingTopics = topics_list.map((ct: any, i: number) => ({
        id: ct.id || `coding-topic-${i}-${Date.now()}`,
        title: ct.title || `Coding Topic ${i + 1}`,
        description: ct.description || "",
        importance_score:
          ct.difficulty === "Hard"
            ? 0.9
            : ct.difficulty === "Medium"
              ? 0.7
              : 0.5,
        marks_value: ct.estimated_problems || 5,
        has_diagrams: false,
        key_points: Array.isArray(ct.key_points) ? ct.key_points : [],
        questions_answers: [],
        coding_problems: [],
        content: ct.description || "",
      }));

      setCodingTopics(newCodingTopics);
      setTopicTab("coding"); // Switch to coding tab to show topics
      // Clear selected topic for coding tab (explicit to avoid race with setTopicTab)
      setSelectedTopic(null, "coding");
      localStorage.setItem("coding_topics", JSON.stringify(newCodingTopics));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoadingCodingTopics(false);
    }
  };

  // Generate coding problems for a selected coding topic
  const generateCodingProblems = async (codingTopic: Topic, index: number) => {
    if (!codingTopic) return;
    if (!originalContent) {
      setError("Original syllabus content is missing");
      return;
    }

    setLoadingProblemsForTopic(index);
    setError(null);

    try {
      const res = await fetch("/api/generate-coding-problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: codingTopic,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate coding problems");
      }

      const data = await res.json();
      const problems = data.coding_problems || [];

      const sanitizedProblems = problems.map((cp: any) => ({
        problem_title: sanitizeAIText(cp.problem_title || cp.title || ""),
        problem_statement: sanitizeAIText(cp.problem_statement || ""),
        code_solution: cp.code_solution || "",
        explanation: cp.explanation || "",
        algorithm_type: cp.algorithm_type || "",
        difficulty: cp.difficulty || "Medium",
        time_complexity: cp.time_complexity || "",
        space_complexity: cp.space_complexity || "",
        needs_diagram: cp.needs_diagram || false,
      }));

      // Update coding topics with the generated problems
      const updatedCodingTopics = codingTopics.map((ct, i) =>
        i === index ? { ...ct, coding_problems: sanitizedProblems } : ct
      );

      setCodingTopics(updatedCodingTopics);
      setSelectedTopic(updatedCodingTopics[index], "coding");
      localStorage.setItem(
        "coding_topics",
        JSON.stringify(updatedCodingTopics)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoadingProblemsForTopic(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      setError("Please provide a file");
      return;
    }

    setIsLoading(true);
    setError(null);
    setProgress(10);

    try {
      setProgress(20);

      // Extract text from file
      let textContent: string;
      try {
        textContent = await extractTextFromFile(file);
      } catch (extractError) {
        throw new Error(
          extractError instanceof Error
            ? extractError.message
            : "Failed to extract text from file"
        );
      }

      if (!textContent || textContent.length < 50) {
        throw new Error("File appears to be empty or too small");
      }

      setProgress(40);

      // Call API to extract topics (Google AI only)
      const extractResponse = await fetch("/api/extract-topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: textContent,
        }),
      });

      if (!extractResponse.ok) {
        const errorData = await extractResponse.json();
        throw new Error(errorData.error || "Failed to extract topics");
      }

      setProgress(80);

      const extractData = await extractResponse.json();

      // Ensure every topic has a questions_answers array (may be empty)
      const normalizedTopics = (extractData.topics || [])
        .map((t: any, i: number) => ({
          id: t.id || `topic-${i}-${Date.now()}`,
          title: t.title,
          description: t.description,
          importance_score: t.importance_score,
          marks_value: t.marks_value,
          has_diagrams: t.has_diagrams,
          key_points: Array.isArray(t.key_points) ? t.key_points : [],
          questions_answers: Array.isArray(t.questions_answers)
            ? t.questions_answers
            : [],
          coding_problems: Array.isArray(t.coding_problems)
            ? t.coding_problems
            : [],
          content: Array.isArray(t.key_points)
            ? t.key_points.join("\n")
            : t.description || "",
        }))
        // Sort by importance_score descending so most important appears first
        .sort(
          (a: any, b: any) =>
            (b.importance_score || 0) - (a.importance_score || 0)
        );

      setTopics(normalizedTopics);
      setCodingTopics([]); // Reset coding topics when new syllabus uploaded
      setTopicTab("regular"); // Switch back to regular tab
      // Clear selected topic for regular tab explicitly
      setSelectedTopic(null, "regular");
      setRelationships(extractData.relationships || []);
      setExtractedTitle(extractData.title || "Syllabus Analysis");
      setOriginalContent(textContent);

      // Clean topics data before sending to Convex
      const cleanedTopics = (normalizedTopics || []).map((topic: any) => ({
        title: topic.title,
        description: topic.description,
        importance_score: topic.importance_score,
        marks_value: topic.marks_value,
        has_diagrams: topic.has_diagrams,
        key_points: topic.key_points,
        questions_answers: Array.isArray(topic.questions_answers)
          ? topic.questions_answers
          : [],
        coding_problems: Array.isArray(topic.coding_problems)
          ? topic.coding_problems
          : [],
      }));

      // Save to Convex database
      try {
        await saveSyllabusMutation({
          title: extractData.title || "Syllabus Analysis",
          fileSize: file.size,
          fileName: file.name,
          topics: cleanedTopics,
          relationships: extractData.relationships || [],
        });
      } catch (convexError) {
        console.error("Convex save error:", convexError);
        setError("Failed to save to database, but data is displayed");
      }

      // Store in localStorage for persistence
      localStorage.setItem(
        "syllabus_data",
        JSON.stringify({
          title: extractData.title || "Syllabus Analysis",
          topics: cleanedTopics,
          relationships: extractData.relationships || [],
        })
      );
      setProgress(100);
      setShowUpload(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setIsLoading(false);
      setProgress(0);
    }
  };

  if (showUpload) {
    return (
      <div
        className="flex min-h-svh flex-col m-0 p-0"
        style={
          darkMode
            ? {
                backgroundColor: "#131313",
                color: "#E0E0E0",
                margin: 0,
                padding: 0,
              }
            : {
                background:
                  "linear-gradient(to bottom right, #f8fafc, #f1f5f9, #f8fafc)",
                color: "#0f172a",
                margin: 0,
                padding: 0,
              }
        }
      >
        {/* Navigation */}
        <nav
          className="flex items-center justify-between px-6 py-4 md:px-12 md:py-6 border-b backdrop-blur-sm"
          style={
            darkMode
              ? { borderColor: "#2A2A2A", backgroundColor: "#1F1F1F" }
              : {
                  borderColor: "#e2e8f0",
                  backgroundColor: "rgba(255,255,255,0.5)",
                }
          }
        >
          <h1
            className="text-sm sm:text-base md:text-lg lg:text-2xl font-bold bg-gradient-to-r bg-clip-text text-transparent"
            style={
              darkMode
                ? {
                    backgroundImage:
                      "linear-gradient(to right, #d36c05ff, #d36c05ff)",
                  }
                : {
                    backgroundImage:
                      "linear-gradient(to right, #222222ff, #302f2eff)",
                  }
            }
          >
            <span className="hidden md:inline">
              Generated Important Topics Through AI (GITA)
            </span>
            <span className="md:hidden">
              Generated Important Topics Through AI (GITA)
            </span>
          </h1>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle dark mode"
            onClick={() => setTheme(darkMode ? "light" : "dark")}
            className="rounded-lg"
            style={{
              borderWidth: "2px",
              borderColor: darkMode ? "#2A2A2A" : "#e2e8f0",
              backgroundColor: darkMode ? "rgba(255,255,255,0.02)" : "#ffffff",
              padding: "8px",
              transition: "border-color 0.2s ease, background-color 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = darkMode
                ? "#cccccc"
                : "#333333";
              const icon = e.currentTarget.querySelector("svg");
              if (icon) {
                icon.style.stroke = darkMode ? "#cccccc" : "#333333";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = darkMode
                ? "#2A2A2A"
                : "#e2e8f0";
              const icon = e.currentTarget.querySelector("svg");
              if (icon) {
                icon.style.stroke = darkMode ? "#ffffff" : "#000000";
              }
            }}
          >
            {darkMode ? (
              <Sun className="w-5 h-5" style={{ stroke: "#ffffff" }} />
            ) : (
              <Moon className="w-5 h-5" style={{ stroke: "#000000" }} />
            )}
          </Button>
        </nav>

        {/* Hero Section with Upload */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 md:px-12">
          <div className="max-w-2xl w-full space-y-8">
            <div className="text-center space-y-4">
              <p
                className="text-xl text-balance"
                style={darkMode ? { color: "#A8A8A8" } : { color: "#475569" }}
              >
                Upload your syllabus in any format. My AI extracts key topics,
                concepts, and generates comprehensive answers organized with
                images and coding problems.
              </p>

              {/* GIF */}
              <div className="flex justify-center mt-6">
                <img
                  src="tenor.gif"
                  alt="study animation"
                  className="w-72 h-40 md:w-150 md:h-80 rounded-lg "
                />
              </div>
            </div>

            {/* Upload Form */}
            <form
              onSubmit={handleSubmit}
              className="space-y-6 border rounded-lg p-8 shadow-lg"
              style={
                darkMode
                  ? { backgroundColor: "#1E1E1E", borderColor: "#2A2A2A" }
                  : { backgroundColor: "#ffffff", borderColor: "#e2e8f0" }
              }
            >
              <div>
                <Label
                  htmlFor="file"
                  className="text-base font-medium"
                  style={darkMode ? { color: "#E0E0E0" } : { color: "#0f172a" }}
                >
                  Upload Document
                </Label>
                <div
                  className="mt-2 flex items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors"
                  style={
                    darkMode
                      ? { borderColor: "#2A2A2A" }
                      : { borderColor: "#cbd5e1" }
                  }
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.borderColor = "#4EA8FF")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.borderColor = darkMode
                      ? "#2A2A2A"
                      : "#cbd5e1")
                  }
                >
                  <label
                    htmlFor="file"
                    className="w-full text-center cursor-pointer"
                  >
                    {file ? (
                      <div className="space-y-2">
                        <p
                          className="font-medium"
                          style={
                            darkMode
                              ? { color: "#E0E0E0" }
                              : { color: "#0f172a" }
                          }
                        >
                          {file.name}
                        </p>
                        <p
                          className="text-sm"
                          style={
                            darkMode
                              ? { color: "#A8A8A8" }
                              : { color: "#64748b" }
                          }
                        >
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p
                          className="text-lg font-medium"
                          style={
                            darkMode
                              ? { color: "#E0E0E0" }
                              : { color: "#0f172a" }
                          }
                        >
                          Drop your file here
                        </p>
                        <p
                          className="text-sm"
                          style={
                            darkMode
                              ? { color: "#A8A8A8" }
                              : { color: "#64748b" }
                          }
                        >
                          or click to select
                        </p>
                        <p className="text-xs" style={{ color: "#64748b" }}>
                          Supports PDF, Word, PowerPoint, Text
                        </p>
                      </div>
                    )}
                    <Input
                      id="file"
                      type="file"
                      onChange={handleFileChange}
                      accept=".pdf,.doc,.docx,.ppt,.pptx,.txt"
                      className="hidden"
                      disabled={isLoading}
                    />
                  </label>
                </div>
              </div>

              {/* Progress Bar */}
              {isLoading && progress > 0 && (
                <div className="space-y-2">
                  <div
                    className="w-full rounded-full h-2 overflow-hidden"
                    style={
                      darkMode
                        ? { backgroundColor: "#2A2A2A" }
                        : { backgroundColor: "#e2e8f0" }
                    }
                  >
                    <div
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${progress}%`,
                        backgroundColor: "#4EA8FF",
                      }}
                    />
                  </div>
                  <p
                    className="text-sm"
                    style={
                      darkMode ? { color: "#A8A8A8" } : { color: "#64748b" }
                    }
                  >
                    {progress < 40 && "Extracting text..."}
                    {progress >= 40 &&
                      progress < 80 &&
                      "Analyzing topics with AI..."}
                    {progress >= 80 && "Generating visualization..."}
                  </p>
                </div>
              )}

              {error && (
                <p className="text-sm" style={{ color: "#ef4444" }}>
                  {error}
                </p>
              )}

              <Button type="submit" disabled={isLoading} className="w-full">
                {isLoading ? "Processing..." : "Upload & Analyze"}
              </Button>
            </form>

            {/* Features Grid */}
            <div className="grid md:grid-cols-2 gap-6 mt-12">
              <div
                className="p-4 rounded-lg border"
                style={
                  darkMode
                    ? { backgroundColor: "#1E1E1E", borderColor: "#2A2A2A" }
                    : { backgroundColor: "#ffffff", borderColor: "#e2e8f0" }
                }
              >
                <div className="text-2xl mb-3">📄</div>
                <h3
                  className="text-lg font-semibold mb-2"
                  style={darkMode ? { color: "#E0E0E0" } : { color: "#0f172a" }}
                >
                  Multi-Format
                </h3>
                <p
                  className="text-sm"
                  style={darkMode ? { color: "#A8A8A8" } : { color: "#64748b" }}
                >
                  PDF, Word, PowerPoint & more
                </p>
              </div>
              <div
                className="p-4 rounded-lg border"
                style={
                  darkMode
                    ? { backgroundColor: "#1E1E1E", borderColor: "#2A2A2A" }
                    : { backgroundColor: "#ffffff", borderColor: "#e2e8f0" }
                }
              >
                <div className="text-2xl mb-3">✨</div>
                <h3
                  className="text-lg font-semibold mb-2"
                  style={darkMode ? { color: "#E0E0E0" } : { color: "#0f172a" }}
                >
                  AI Analysis
                </h3>
                <p
                  className="text-sm"
                  style={darkMode ? { color: "#A8A8A8" } : { color: "#64748b" }}
                >
                  Analyse the syllabus and transform into Exam Questions
                </p>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer
          className="border-t px-6 py-4 text-center"
          style={
            darkMode ? { borderColor: "#2A2A2A" } : { borderColor: "#e2e8f0" }
          }
        >
          <p
            className="text-sm"
            style={darkMode ? { color: "#A8A8A8" } : { color: "#64748b" }}
          >
            © 2025 Made and created by{" "}
            <span
              className="font-semibold"
              style={darkMode ? { color: "#E0E0E0" } : { color: "#475569" }}
            >
              Hanumatrix
            </span>
            . All rights reserved.
          </p>
          <div className="flex gap-3 justify-center items-center mt-3">
            <span
              className="text-sm"
              style={darkMode ? { color: "#A8A8A8" } : { color: "#64748b" }}
            >
              Connect with me:
            </span>
            <a
              href="https://github.com/Hanumatrix"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Visit Hanumatrix GitHub profile"
              className="inline-flex items-center justify-center w-8 h-8 rounded-full hover:opacity-75 transition-opacity"
              style={
                darkMode
                  ? { backgroundColor: "#374151", color: "#d1d5db" }
                  : { backgroundColor: "#e5e7eb", color: "#4b5563" }
              }
            >
              <FaGithub size={18} />
            </a>
            <a
              href="https://x.com/hanumatrix"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Visit Hanumatrix X (Twitter) profile"
              className="inline-flex items-center justify-center w-8 h-8 rounded-full hover:opacity-75 transition-opacity"
              style={
                darkMode
                  ? { backgroundColor: "#374151", color: "#d1d5db" }
                  : { backgroundColor: "#e5e7eb", color: "#4b5563" }
              }
            >
              <FaTwitter size={18} />
            </a>
            <span
              className="text-sm"
              style={darkMode ? { color: "#A8A8A8" } : { color: "#64748b" }}
            >
              · @hanumatrix
            </span>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-svh flex-col"
      style={
        darkMode
          ? { backgroundColor: "#131313", color: "#E0E0E0" }
          : {
              background:
                "linear-gradient(to bottom right, #f8fafc, #f1f5f9, #f8fafc)",
              color: "#0f172a",
            }
      }
    >
      <nav
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 py-3 md:px-6 md:py-4 lg:px-12 lg:py-6 border-b gap-3 sm:gap-4"
        style={
          darkMode
            ? { borderColor: "#2A2A2A", backgroundColor: "#1F1F1F" }
            : { borderColor: "#e2e8f0", backgroundColor: "#ffffff" }
        }
      >
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1
              className="text-lg md:text-2xl font-bold bg-gradient-to-r bg-clip-text text-transparent"
              style={{
                backgroundImage: darkMode
                  ? "linear-gradient(to right, #d36c05ff, #d36c05ff)"
                  : "linear-gradient(to right, #d36c05ff, #d36c05ff)",
              }}
            >
              GITA
            </h1>
          </div>

          <h2
            className="hidden sm:block text-sm md:text-base lg:text-lg truncate max-w-[200px] md:max-w-[300px] lg:max-w-none text-center flex-1 mx-4"
            style={darkMode ? { color: "#A8A8A8" } : { color: "#475569" }}
          >
            {extractedTitle}
          </h2>

          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowUpload(true);
                setTopics([]);
                setRelationships([]);
                setCodingTopics([]);
                // Clear selections for both tabs
                setSelectedRegularTopic(null);
                setSelectedCodingTopic(null);
                setExtractedTitle("");
                setFile(null);
                setError(null);
                setProgress(0);
                setIsLoading(false);
                setTopicTab("regular");
              }}
            >
              <span className="hidden sm:inline">Upload New Syllabus</span>
              <span className="sm:hidden">Upload New</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Toggle dark mode"
              onClick={() => setTheme(darkMode ? "light" : "dark")}
              className="rounded-lg"
              style={{
                borderWidth: "2px",
                borderColor: darkMode ? "#2A2A2A" : "#e2e8f0",
                backgroundColor: darkMode
                  ? "rgba(255,255,255,0.02)"
                  : "#ffffff",
                padding: "8px",
                transition:
                  "border-color 0.2s ease, background-color 0.2s ease",
              }}
              onMouseEnter={(e) => {
                const svgs = e.currentTarget.querySelectorAll("svg path");
                svgs.forEach((svg) => {
                  const currentStroke = (svg as SVGElement).getAttribute(
                    "stroke"
                  );
                  if (currentStroke === "#ffffff") {
                    (svg as SVGElement).setAttribute("stroke", "#cccccc");
                  } else if (currentStroke === "#000000") {
                    (svg as SVGElement).setAttribute("stroke", "#333333");
                  }
                });
                e.currentTarget.style.borderColor = darkMode
                  ? "#cccccc"
                  : "#333333";
              }}
              onMouseLeave={(e) => {
                const svgs = e.currentTarget.querySelectorAll("svg path");
                svgs.forEach((svg) => {
                  (svg as SVGElement).setAttribute(
                    "stroke",
                    darkMode ? "#ffffff" : "#000000"
                  );
                });
                e.currentTarget.style.borderColor = darkMode
                  ? "#2A2A2A"
                  : "#e2e8f0";
              }}
            >
              {darkMode ? (
                <Sun className="w-5 h-5" style={{ stroke: "#ffffff" }} />
              ) : (
                <Moon className="w-5 h-5" style={{ stroke: "#000000" }} />
              )}
            </Button>
          </div>
        </div>
      </nav>
      <main className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Topics List */}
        <div
          className="w-full md:w-80 border-r overflow-y-auto"
          style={
            darkMode
              ? { backgroundColor: "#1F1F1F", borderColor: "#2A2A2A" }
              : { backgroundColor: "#f8fafc", borderColor: "#e2e8f0" }
          }
        >
          <div
            className="p-6 border-b sticky top-0 backdrop-blur-sm"
            style={
              darkMode
                ? {
                    borderColor: "#2A2A2A",
                    backgroundColor: "rgba(31, 31, 31, 0.9)",
                  }
                : {
                    borderColor: "#e2e8f0",
                    backgroundColor: "rgba(248, 250, 252, 0.9)",
                  }
            }
          >
            <h3
              className="text-lg font-semibold mb-3"
              style={darkMode ? { color: "#ffffff" } : { color: "#0f172a" }}
            >
              Topics
            </h3>

            <div className="flex gap-2 mb-3">
              <Button
                size="sm"
                variant={topicTab === "regular" ? "default" : "outline"}
                onClick={() => setTopicTab("regular")}
                className="flex-1"
              >
                Questions
              </Button>

              <Button
                size="sm"
                variant={topicTab === "coding" ? "default" : "outline"}
                onClick={() => setTopicTab("coding")}
                className="flex-1"
              >
                Coding ({codingTopics.length})
              </Button>
            </div>

            {topicTab === "regular" && (
              <div>
                <p
                  className="text-sm mb-3"
                  style={darkMode ? { color: "#A8A8A8" } : { color: "#64748b" }}
                >
                  {topics.length} topics found
                </p>
                <Button
                  size="sm"
                  onClick={() => generateCodingTopics()}
                  disabled={loadingCodingTopics}
                  className="w-full"
                >
                  {loadingCodingTopics
                    ? "Generating Topics..."
                    : "Generate Coding Questions"}
                </Button>
              </div>
            )}
          </div>

          {/* Topic List */}
          <div
            className="divide-y"
            style={
              darkMode ? { borderColor: "#2A2A2A" } : { borderColor: "#e2e8f0" }
            }
          >
            {(topicTab === "regular" ? topics : codingTopics).map(
              (topic, idx) => (
                <div key={topic.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      // mobile: accordion toggle
                      if (
                        typeof window !== "undefined" &&
                        window.innerWidth < 768
                      ) {
                        const willExpand = expandedTopicId !== topic.id;
                        setExpandedTopicId(willExpand ? topic.id : null);
                        if (willExpand) {
                          setSelectedTopic(topic);
                          if (topicTab === "regular") {
                            handleTopicClick(topic, idx);
                          } else if (topicTab === "coding") {
                            generateCodingProblemsForCodingTopic(topic, idx);
                          }
                        }
                      } else {
                        // desktop: open in right panel
                        setSelectedTopic(topic);
                        if (topicTab === "regular") {
                          handleTopicClick(topic, idx);
                        } else if (topicTab === "coding") {
                          generateCodingProblemsForCodingTopic(topic, idx);
                        }
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (
                          typeof window !== "undefined" &&
                          window.innerWidth < 768
                        ) {
                          const willExpand = expandedTopicId !== topic.id;
                          setExpandedTopicId(willExpand ? topic.id : null);
                          if (willExpand) {
                            setSelectedTopic(topic);
                            if (topicTab === "regular") {
                              handleTopicClick(topic, idx);
                            } else if (topicTab === "coding") {
                              generateCodingProblemsForCodingTopic(topic, idx);
                            }
                          }
                        } else {
                          setSelectedTopic(topic);
                          if (topicTab === "regular") {
                            handleTopicClick(topic, idx);
                          } else if (topicTab === "coding") {
                            generateCodingProblemsForCodingTopic(topic, idx);
                          }
                        }
                      }
                    }}
                    className="w-full text-left px-6 py-4 transition-colors cursor-pointer"
                    style={
                      selectedTopic?.id === topic.id
                        ? topicTab === "coding"
                          ? darkMode
                            ? {
                                backgroundColor: "rgba(16, 185, 129, 0.15)",
                                borderLeft: "4px solid #2c2924ff",
                              }
                            : {
                                backgroundColor: "rgba(16, 185, 129, 0.1)",
                                borderLeft: "4px solid #2c2924ff",
                              }
                          : darkMode
                            ? {
                                backgroundColor: "#2A2A2A",
                                borderLeft: "4px solid #00E1A8",
                              }
                            : {
                                backgroundColor: "rgba(0,225,168,0.06)",
                                borderLeft: "4px solid #00E1A8",
                              }
                        : darkMode
                          ? { backgroundColor: "transparent" }
                          : { backgroundColor: "transparent" }
                    }
                    onMouseEnter={(e) => {
                      if (selectedTopic?.id !== topic.id) {
                        e.currentTarget.style.backgroundColor = darkMode
                          ? "#2A2A2A"
                          : "#f1f5f9";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedTopic?.id !== topic.id) {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4
                            className="font-medium mb-2 truncate"
                            style={
                              darkMode
                                ? { color: "#E0E0E0" }
                                : { color: "#0f172a" }
                            }
                          >
                            {topic.title}
                          </h4>
                          {cachedTopics[idx] && (
                            <span
                              className="text-xs px-2 py-0.5 rounded"
                              style={
                                darkMode
                                  ? {
                                      backgroundColor: "#263238",
                                      color: "#A8E6C9",
                                      fontWeight: 700,
                                    }
                                  : {
                                      backgroundColor: "#eefbf4",
                                      color: "#065f46",
                                      fontWeight: 700,
                                    }
                              }
                            >
                              Cached
                            </span>
                          )}
                        </div>
                        <div
                          className="text-xs space-y-1"
                          style={
                            darkMode
                              ? { color: "#A8A8A8" }
                              : { color: "#64748b" }
                          }
                        >
                          {topicTab === "coding" && (
                            <>
                              <p>
                                Difficulty:{" "}
                                <span style={{ color: "#10b981" }}>
                                  {(topic.key_points?.[0] || "Medium").split(
                                    ": "
                                  )[1] || "Medium"}
                                </span>
                              </p>
                            </>
                          )}
                          {topicTab === "regular" && (
                            <>
                              <p>
                                Importance:{" "}
                                <span
                                  style={
                                    darkMode
                                      ? { color: "#E0E0E0" }
                                      : { color: "#475569" }
                                  }
                                >
                                  {(topic.importance_score * 100).toFixed(0)}%
                                </span>
                              </p>
                              <p>
                                Marks:{" "}
                                <span
                                  style={
                                    darkMode
                                      ? { color: "#E0E0E0" }
                                      : { color: "#475569" }
                                  }
                                >
                                  {topic.marks_value}
                                </span>
                              </p>
                            </>
                          )}
                          {topic.questions_answers &&
                            topic.questions_answers.length > 0 &&
                            topicTab === "regular" && (
                              <p>
                                Q&As:{" "}
                                <span
                                  style={
                                    darkMode
                                      ? { color: "#E0E0E0" }
                                      : { color: "#475569" }
                                  }
                                >
                                  {topic.questions_answers.length}
                                </span>
                              </p>
                            )}
                          {generatingTopicIndex === idx &&
                            topicTab === "regular" &&
                            !(
                              topic.questions_answers &&
                              topic.questions_answers.length > 0
                            ) && (
                              <p style={{ color: "#10b981" }}>
                                Generating answers...
                              </p>
                            )}
                          {loadingProblemsForTopic === idx &&
                            topicTab === "coding" && (
                              <p
                                className="text-xs mt-1"
                                style={{ color: "#10b981" }}
                              >
                                Generating problems...
                              </p>
                            )}
                        </div>
                      </div>

                      {/* Arrow icon for mobile */}
                      <span className="md:hidden ml-2">
                        {expandedTopicId === topic.id ? "▼" : "▶"}
                      </span>
                    </div>
                  </div>

                  {/* Accordion Content - Shows Q&As on mobile */}
                  {expandedTopicId === topic.id &&
                    typeof window !== "undefined" &&
                    window.innerWidth < 768 && (
                      <div
                        className="px-4 py-4 border-t"
                        style={
                          darkMode
                            ? {
                                backgroundColor: "#0F0F0F",
                                borderColor: "#2A2A2A",
                              }
                            : {
                                backgroundColor: "#f8fafc",
                                borderColor: "#e2e8f0",
                              }
                        }
                      >
                        <div className="space-y-4">
                          {/* Metadata block - show key info in teal on mobile */}
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div
                              className="rounded-lg p-3 border"
                              style={
                                darkMode
                                  ? {
                                      backgroundColor: "#1E1E1E",
                                      borderColor: "#2A2A2A",
                                    }
                                  : {
                                      backgroundColor: "#f8fafc",
                                      borderColor: "#e2e8f0",
                                    }
                              }
                            >
                              <p
                                className="text-xs"
                                style={
                                  darkMode
                                    ? { color: "#A8A8A8" }
                                    : { color: "#64748b" }
                                }
                              >
                                Importance Score
                              </p>
                              <p
                                className="text-lg font-bold"
                                style={{ color: "#00E1A8" }}
                              >
                                {(topic.importance_score * 100).toFixed(0)}%
                              </p>
                            </div>
                            <div
                              className="rounded-lg p-3 border"
                              style={
                                darkMode
                                  ? {
                                      backgroundColor: "#1E1E1E",
                                      borderColor: "#2A2A2A",
                                    }
                                  : {
                                      backgroundColor: "#f8fafc",
                                      borderColor: "#e2e8f0",
                                    }
                              }
                            >
                              <p
                                className="text-xs"
                                style={
                                  darkMode
                                    ? { color: "#A8A8A8" }
                                    : { color: "#64748b" }
                                }
                              >
                                Estimated Marks
                              </p>
                              <p
                                className="text-lg font-bold"
                                style={{ color: "#00E1A8" }}
                              >
                                {topic.marks_value}
                              </p>
                            </div>
                            <div
                              className="rounded-lg p-3 border"
                              style={
                                darkMode
                                  ? {
                                      backgroundColor: "#1E1E1E",
                                      borderColor: "#2A2A2A",
                                    }
                                  : {
                                      backgroundColor: "#f8fafc",
                                      borderColor: "#e2e8f0",
                                    }
                              }
                            >
                              <p
                                className="text-xs"
                                style={
                                  darkMode
                                    ? { color: "#A8A8A8" }
                                    : { color: "#64748b" }
                                }
                              >
                                Diagrams
                              </p>
                              <p
                                className="text-lg font-bold"
                                style={{ color: "#10b981" }}
                              >
                                {topic.has_diagrams ? "Yes" : "No"}
                              </p>
                            </div>
                            <div
                              className="rounded-lg p-3 border"
                              style={
                                darkMode
                                  ? {
                                      backgroundColor: "#1E1E1E",
                                      borderColor: "#2A2A2A",
                                    }
                                  : {
                                      backgroundColor: "#f8fafc",
                                      borderColor: "#e2e8f0",
                                    }
                              }
                            >
                              <p
                                className="text-xs"
                                style={
                                  darkMode
                                    ? { color: "#A8A8A8" }
                                    : { color: "#64748b" }
                                }
                              >
                                Key Points
                              </p>
                              <ul className="text-sm list-disc pl-4 text-[#00E1A8] md:text-[#475569]">
                                {(topic.key_points || [])
                                  .slice(0, 4)
                                  .map((kp: any, i: number) => (
                                    <li key={i}>{kp}</li>
                                  ))}
                              </ul>
                            </div>
                          </div>

                          {/* Show content based on topic type (regular or coding) */}
                          {topicTab === "regular" ? (
                            <>
                              {/* Q&As for Regular Topics */}
                              {topic.questions_answers &&
                              topic.questions_answers.length > 0 ? (
                                <div className="space-y-4">
                                  {topic.questions_answers.map(
                                    (qa: any, qaIdx: number) => (
                                      <div key={qaIdx} className="space-y-2">
                                        <h5
                                          className="font-semibold text-sm"
                                          style={{ color: "#eb9e75" }}
                                        >
                                          Q{qaIdx + 1}. {qa.question}
                                        </h5>
                                        <div
                                          className="text-xs"
                                          style={
                                            darkMode
                                              ? { color: "#A8A8A8" }
                                              : { color: "#475569" }
                                          }
                                        >
                                          {renderFormattedAnswer(qa.answer)}
                                        </div>

                                        {/* Question-specific image (if available) */}
                                        {(() => {
                                          const key = `${topic.id}::q::${qaIdx}`;
                                          const img = topicQuestionImages[key];
                                          const loading =
                                            topicQuestionImageLoading[key];
                                          if (img) {
                                            return (
                                              <div className="pt-2">
                                                <img
                                                  src={img}
                                                  alt={`Diagram for Q${qaIdx + 1}`}
                                                  onClick={() => {
                                                    setSelectedImageUrl(img);
                                                    setSelectedImageQuestion(
                                                      qa.question
                                                    );
                                                  }}
                                                  className="h-40 w-40 object-contain rounded-md border cursor-pointer hover:opacity-80 transition-opacity"
                                                />
                                              </div>
                                            );
                                          }
                                          if (loading) {
                                            return (
                                              <div className="text-sm text-gray-500">
                                                Generating image...
                                              </div>
                                            );
                                          }
                                          return null;
                                        })()}
                                      </div>
                                    )
                                  )}
                                </div>
                              ) : (
                                <p
                                  className="text-sm"
                                  style={
                                    darkMode
                                      ? { color: "#A8A8A8" }
                                      : { color: "#64748b" }
                                  }
                                >
                                  {generatingTopicIndex === idx
                                    ? "Generating answers..."
                                    : "Click to generate Q&As"}
                                </p>
                              )}
                            </>
                          ) : (
                            <>
                              {/* Coding Problems for Coding Topics */}
                              {topic.coding_problems &&
                              topic.coding_problems.length > 0 ? (
                                <div className="space-y-4">
                                  {topic.coding_problems.map(
                                    (cp: any, cpIdx: number) => (
                                      <div
                                        key={cpIdx}
                                        className="border rounded-lg overflow-hidden"
                                        style={
                                          darkMode
                                            ? { borderColor: "#2A2A2A" }
                                            : { borderColor: "#e2e8f0" }
                                        }
                                      >
                                        <div
                                          className="px-4 py-3 border-b"
                                          style={
                                            darkMode
                                              ? {
                                                  backgroundColor: "#1E1E1E",
                                                  borderColor: "#2A2A2A",
                                                }
                                              : {
                                                  backgroundColor: "#f8fafc",
                                                  borderColor: "#e2e8f0",
                                                }
                                          }
                                        >
                                          <h5
                                            className="font-semibold text-sm"
                                            style={{ color: "#10b981" }}
                                          >
                                            {cp.problem_title || cp.title}
                                          </h5>
                                          {cp.algorithm_type && (
                                            <p
                                              className="text-xs mt-1"
                                              style={
                                                darkMode
                                                  ? { color: "#A8A8A8" }
                                                  : { color: "#64748b" }
                                              }
                                            >
                                              Algorithm:{" "}
                                              <span
                                                style={{ color: "#10b981" }}
                                              >
                                                {cp.algorithm_type}
                                              </span>
                                            </p>
                                          )}
                                        </div>
                                        <div
                                          className="px-4 py-3 space-y-3"
                                          style={
                                            darkMode
                                              ? { backgroundColor: "#0F0F0F" }
                                              : { backgroundColor: "#ffffff" }
                                          }
                                        >
                                          {/* Code Block */}
                                          {(cp.code_solution || cp.code) &&
                                            renderCodeBlock(
                                              cp.code_solution || cp.code
                                            )}

                                          {/* Explanation */}
                                          {cp.explanation && (
                                            <div className="space-y-2">
                                              <p
                                                className="text-xs font-semibold"
                                                style={
                                                  darkMode
                                                    ? { color: "#A8A8A8" }
                                                    : { color: "#64748b" }
                                                }
                                              >
                                                Explanation:
                                              </p>
                                              <div
                                                style={
                                                  darkMode
                                                    ? { color: "#E0E0E0" }
                                                    : { color: "#475569" }
                                                }
                                              >
                                                {renderDetailedExplanation(
                                                  cp.explanation
                                                )}
                                              </div>
                                            </div>
                                          )}

                                          {/* Complexity */}
                                          {(cp.time_complexity ||
                                            cp.space_complexity) && (
                                            <div
                                              className="text-xs rounded p-2 mt-2"
                                              style={
                                                darkMode
                                                  ? {
                                                      backgroundColor:
                                                        "#1E1E1E",
                                                      color: "#A8A8A8",
                                                    }
                                                  : {
                                                      backgroundColor:
                                                        "#f8fafc",
                                                      color: "#64748b",
                                                    }
                                              }
                                            >
                                              {cp.time_complexity && (
                                                <p>
                                                  Time: {cp.time_complexity}
                                                </p>
                                              )}
                                              {cp.space_complexity && (
                                                <p>
                                                  Space: {cp.space_complexity}
                                                </p>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  )}
                                </div>
                              ) : (
                                <p
                                  className="text-sm"
                                  style={
                                    darkMode
                                      ? { color: "#A8A8A8" }
                                      : { color: "#64748b" }
                                  }
                                >
                                  {loadingProblemsForTopic === idx
                                    ? "Generating coding problems..."
                                    : "Click to generate coding problems"}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                </div>
              )
            )}
          </div>
        </div>

        {/* Right Panel - Topic Details */}
        <div
          className="hidden md:block flex-1 overflow-y-auto"
          style={
            darkMode
              ? { backgroundColor: "#0F0F0F" }
              : { backgroundColor: "#ffffff" }
          }
        >
          {selectedTopic ? (
            <div className="max-w-4xl mx-auto p-8 space-y-8">
              {/* Topic Header */}
              <div className="space-y-4">
                <h2
                  className="text-4xl font-bold bg-gradient-to-r bg-clip-text text-transparent"
                  style={{
                    backgroundImage: darkMode
                      ? "linear-gradient(to right, #00E1A8, #14B8A6)"
                      : "linear-gradient(to right, #00E1A8, #14B8A6)",
                  }}
                >
                  {selectedTopic.title}
                </h2>
                <p
                  className="text-lg"
                  style={darkMode ? { color: "#A8A8A8" } : { color: "#475569" }}
                >
                  {selectedTopic.description}
                </p>

                {/* Show metadata only for regular topics */}
                {topicTab === "regular" && (
                  <>
                    <div className="grid grid-cols-3 gap-4 pt-4">
                      <div
                        className="rounded-lg p-4 border"
                        style={
                          darkMode
                            ? {
                                backgroundColor: "#1E1E1E",
                                borderColor: "#2A2A2A",
                              }
                            : {
                                backgroundColor: "#f8fafc",
                                borderColor: "#e2e8f0",
                              }
                        }
                      >
                        <p
                          className="text-sm"
                          style={
                            darkMode
                              ? { color: "#A8A8A8" }
                              : { color: "#64748b" }
                          }
                        >
                          Importance Score
                        </p>
                        <p
                          className="text-2xl font-bold"
                          style={{ color: "#00E1A8" }}
                        >
                          {(selectedTopic.importance_score * 100).toFixed(0)}%
                        </p>
                      </div>
                      <div
                        className="rounded-lg p-4 border"
                        style={
                          darkMode
                            ? {
                                backgroundColor: "#1E1E1E",
                                borderColor: "#2A2A2A",
                              }
                            : {
                                backgroundColor: "#f8fafc",
                                borderColor: "#e2e8f0",
                              }
                        }
                      >
                        <p
                          className="text-sm"
                          style={
                            darkMode
                              ? { color: "#A8A8A8" }
                              : { color: "#64748b" }
                          }
                        >
                          Estimated Marks
                        </p>
                        <p
                          className="text-2xl font-bold"
                          style={{ color: "#00E1A8" }}
                        >
                          {selectedTopic.marks_value}
                        </p>
                      </div>
                      <div
                        className="rounded-lg p-4 border"
                        style={
                          darkMode
                            ? {
                                backgroundColor: "#1E1E1E",
                                borderColor: "#2A2A2A",
                              }
                            : {
                                backgroundColor: "#f8fafc",
                                borderColor: "#e2e8f0",
                              }
                        }
                      >
                        <p
                          className="text-sm"
                          style={
                            darkMode
                              ? { color: "#A8A8A8" }
                              : { color: "#64748b" }
                          }
                        >
                          Diagrams
                        </p>
                        <p
                          className="text-2xl font-bold"
                          style={{ color: "#10b981" }}
                        >
                          {selectedTopic.has_diagrams ? "Yes" : "No"}
                        </p>
                      </div>
                    </div>

                    {/* Topic Image - Show only if has_diagrams is true and image is loaded */}
                    {selectedTopic.has_diagrams && (
                      <div className="pt-4">
                        {loadingImages[selectedTopic.id] ? (
                          <div
                            className="rounded-lg p-8 border flex items-center justify-center"
                            style={
                              darkMode
                                ? {
                                    backgroundColor: "#1E1E1E",
                                    borderColor: "#2A2A2A",
                                  }
                                : {
                                    backgroundColor: "#f8fafc",
                                    borderColor: "#e2e8f0",
                                  }
                            }
                          >
                            <p
                              style={
                                darkMode
                                  ? { color: "#A8A8A8" }
                                  : { color: "#64748b" }
                              }
                            >
                              Loading diagram...
                            </p>
                          </div>
                        ) : topicImages[selectedTopic.id] ? (
                          <div
                            className="rounded-lg overflow-hidden border"
                            style={
                              darkMode
                                ? { borderColor: "#2A2A2A" }
                                : { borderColor: "#e2e8f0" }
                            }
                          >
                            <img
                              src={topicImages[selectedTopic.id]}
                              alt={selectedTopic.title}
                              className="w-full h-auto object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Show content based on tab */}
              {topicTab === "coding" ? (
                <>
                  {/* Coding Problems View */}
                  {selectedTopic.coding_problems &&
                  selectedTopic.coding_problems.length > 0 ? (
                    <div className="space-y-6">
                      <h3
                        className="text-2xl font-semibold"
                        style={{ color: "#10b981" }}
                      >
                        Coding Problem
                      </h3>
                      <div className="space-y-4">
                        {selectedTopic.coding_problems.map(
                          (cp: any, idx: number) => (
                            <div
                              key={idx}
                              className="border rounded-lg overflow-hidden transition-colors"
                              style={
                                darkMode
                                  ? { borderColor: "#2A2A2A" }
                                  : { borderColor: "#e2e8f0" }
                              }
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.borderColor = "#00E1A8")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.borderColor = darkMode
                                  ? "#2A2A2A"
                                  : "#e2e8f0")
                              }
                            >
                              <div
                                className="px-6 py-4 border-b"
                                style={
                                  darkMode
                                    ? {
                                        backgroundColor: "#1E1E1E",
                                        borderColor: "#2A2A2A",
                                      }
                                    : {
                                        backgroundColor: "#f8fafc",
                                        borderColor: "#e2e8f0",
                                      }
                                }
                              >
                                <h4
                                  className="font-semibold text-lg"
                                  style={{ color: "#10b981" }}
                                >
                                  {cp.problem_title || cp.title}
                                </h4>
                                {cp.algorithm_type && (
                                  <p
                                    className="text-sm mt-2"
                                    style={
                                      darkMode
                                        ? { color: "#A8A8A8" }
                                        : { color: "#64748b" }
                                    }
                                  >
                                    Algorithm:{" "}
                                    <span style={{ color: "#10b981" }}>
                                      {cp.algorithm_type}
                                    </span>
                                  </p>
                                )}
                              </div>
                              <div className="px-6 py-4 space-y-4">
                                {/* Code Block with Syntax Highlighting */}
                                {(cp.code_solution || cp.code) &&
                                  renderCodeBlock(cp.code_solution || cp.code)}
                                <div
                                  className="rounded p-4 border"
                                  style={
                                    darkMode
                                      ? {
                                          backgroundColor: "#1E1E1E",
                                          borderColor: "#2A2A2A",
                                        }
                                      : {
                                          backgroundColor: "#f8fafc",
                                          borderColor: "#e2e8f0",
                                        }
                                  }
                                >
                                  <p
                                    className="text-sm mb-2"
                                    style={
                                      darkMode
                                        ? { color: "#A8A8A8" }
                                        : { color: "#64748b" }
                                    }
                                  >
                                    Explanation:
                                  </p>
                                  <div
                                    style={
                                      darkMode
                                        ? { color: "#E0E0E0" }
                                        : { color: "#475569" }
                                    }
                                  >
                                    {renderDetailedExplanation(cp.explanation)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-slate-400 py-8">
                      <p>Generating Coding questions....</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Regular Topics View */}
                  {/* Key Points */}
                  {selectedTopic.key_points &&
                    selectedTopic.key_points.length > 0 && (
                      <div className="space-y-4">
                        <h3
                          className="text-2xl font-semibold"
                          style={
                            darkMode
                              ? { color: "#E0E0E0" }
                              : { color: "#0f172a" }
                          }
                        >
                          Key Learning Points
                        </h3>
                        <div className="space-y-3">
                          {selectedTopic.key_points.map((point, idx) => (
                            <div
                              key={idx}
                              className="flex gap-4 p-4 rounded-lg border"
                              style={
                                darkMode
                                  ? {
                                      backgroundColor: "#1E1E1E",
                                      borderColor: "#2A2A2A",
                                    }
                                  : {
                                      backgroundColor: "#f8fafc",
                                      borderColor: "#e2e8f0",
                                    }
                              }
                            >
                              <div
                                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold"
                                style={
                                  darkMode
                                    ? {
                                        backgroundColor: "rgba(0,225,168,0.15)",
                                        color: "#00E1A8",
                                      }
                                    : {
                                        backgroundColor:
                                          "rgba(20,184,166,0.08)",
                                        color: "#14B8A6",
                                      }
                                }
                              >
                                {idx + 1}
                              </div>
                              <p
                                className="flex-1"
                                style={
                                  darkMode
                                    ? { color: "#A8A8A8" }
                                    : { color: "#475569" }
                                }
                              >
                                {point}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Questions and Answers */}
                  {selectedTopic.questions_answers &&
                    selectedTopic.questions_answers.length > 0 && (
                      <div className="space-y-6">
                        <h3
                          className="text-2xl font-semibold"
                          style={
                            darkMode
                              ? { color: "#E0E0E0" }
                              : { color: "#0f172a" }
                          }
                        >
                          Important Questions & Answers (
                          {selectedTopic.questions_answers.length})
                        </h3>
                        <div className="space-y-6">
                          {selectedTopic.questions_answers.map((qa, idx) => (
                            <div
                              key={idx}
                              className="border rounded-lg overflow-hidden transition-colors"
                              style={
                                darkMode
                                  ? { borderColor: "#2A2A2A" }
                                  : { borderColor: "#e2e8f0" }
                              }
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.borderColor = "#00E1A8")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.borderColor = darkMode
                                  ? "#2A2A2A"
                                  : "#e2e8f0")
                              }
                            >
                              <div
                                className="px-6 py-4 border-b"
                                style={
                                  darkMode
                                    ? {
                                        backgroundColor: "#1E1E1E",
                                        borderColor: "#2A2A2A",
                                      }
                                    : {
                                        backgroundColor: "#f8fafc",
                                        borderColor: "#e2e8f0",
                                      }
                                }
                              >
                                <h4
                                  className="font-semibold text-lg"
                                  style={
                                    darkMode
                                      ? { color: "#FFFFFF" }
                                      : { color: "#000000" }
                                  }
                                >
                                  Q{idx + 1}. {qa.question}
                                </h4>
                              </div>
                              <div
                                className="px-6 py-4 space-y-4"
                                style={
                                  darkMode
                                    ? { backgroundColor: "#0F0F0F" }
                                    : { backgroundColor: "#ffffff" }
                                }
                              >
                                {qa.answer && renderFormattedAnswer(qa.answer)}

                                {/* Question-specific image (if available) */}
                                {(() => {
                                  const key = `${selectedTopic.id}::q::${idx}`;
                                  const img = topicQuestionImages[key];
                                  const loading =
                                    topicQuestionImageLoading[key];
                                  if (img) {
                                    return (
                                      <div className="pt-2">
                                        <img
                                          src={img}
                                          alt={`Diagram for Q${idx + 1}`}
                                          onClick={() => {
                                            setSelectedImageUrl(img);
                                            setSelectedImageQuestion(
                                              qa.question
                                            );
                                          }}
                                          className="h-48 w-48 object-contain rounded-md border cursor-pointer hover:opacity-80 transition-opacity"
                                        />
                                      </div>
                                    );
                                  }
                                  if (loading) {
                                    return (
                                      <div className="text-sm text-gray-500">
                                        Generating image...
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </>
              )}
            </div>
          ) : (
            <div
              className="flex items-center justify-center h-full"
              style={darkMode ? { color: "#A8A8A8" } : { color: "#64748b" }}
            >
              <div className="text-center">
                <p className="text-xl mb-2">Select a topic to view details</p>
                <p className="text-sm">
                  {topics.length > 0
                    ? "Choose a topic from the left sidebar to see comprehensive explanations and Q&As"
                    : "No topics extracted yet"}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Image Preview Modal */}
        {selectedImageUrl && (
          <div
            className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
            onClick={() => {
              setSelectedImageUrl(null);
              setSelectedImageQuestion("");
            }}
          >
            <div
              className="relative bg-white rounded-lg p-4 max-w-2xl max-h-[90vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
              style={darkMode ? { backgroundColor: "#1E1E1E" } : {}}
            >
              {/* Close Button */}
              <button
                onClick={() => {
                  setSelectedImageUrl(null);
                  setSelectedImageQuestion("");
                }}
                className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-2xl font-bold"
                style={darkMode ? { color: "#A8A8A8" } : {}}
              >
                ×
              </button>

              {/* Question Title */}
              {selectedImageQuestion && (
                <h3
                  className="text-lg font-semibold mb-4 pr-8"
                  style={darkMode ? { color: "#E0E0E0" } : {}}
                >
                  {selectedImageQuestion}
                </h3>
              )}

              {/* Full-size Image */}
              <img
                src={selectedImageUrl}
                alt="Full-size diagram"
                className="w-full max-h-[70vh] object-contain rounded-md"
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
