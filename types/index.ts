export interface QuestionAnswer {
  question: string;
  answer: string;
}

export interface CodingProblem {
  problem_title: string;
  problem_statement: string;
  difficulty: "Easy" | "Medium" | "Hard";
  algorithm_type: string;
  time_complexity: string;
  space_complexity: string;
  needs_diagram: boolean;
  code_solution: string;
  explanation: string;
}

export interface Topic {
  _id: string;
  id: string;
  title: string;
  description: string;
  importance_score: number;
  marks_value: number;
  has_diagrams?: boolean;
  key_points?: string[];
  content?: string;
  questions_answers?: QuestionAnswer[];
  coding_problems?: CodingProblem[];
}

export interface Relationship {
  topic_a_id: string;
  topic_b_id: string;
  relationship_strength: number;
  relationship_type?: string;
}

export interface NodePosition {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
}
