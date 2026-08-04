import type { Question } from "../types/toefl";

export function getQuestionKey(topicId: number, questionIndex: number): string {
  return `${topicId}-${questionIndex + 1}`;
}

export function parsePhrase(value: string): {
  phrase: string;
  meaning: string;
} {
  const [phrase, ...meaningParts] = value.split("—");
  return {
    phrase: phrase.trim(),
    meaning: meaningParts.join("—").trim(),
  };
}

export interface AnswerPlanStep {
  title: string;
  description: string;
}

const descriptionRules: Array<[RegExp, string]> = [
  [/answer directly|state your position/i, "Give your answer in the first sentence."],
  [/usual situation|describe/i, "Add where, when, how, or what usually happens."],
  [/benefit|effect|result/i, "Explain why this detail matters to you."],
  [/example|detail/i, "Use one specific personal example."],
  [/compare/i, "Make the contrast clear and easy to follow."],
  [/reason/i, "Connect the reason directly to your answer."],
];

function sentenceCase(value: string): string {
  const trimmed = value.trim().replace(/[.]+$/, "");
  return trimmed
    ? `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`
    : "Develop your response";
}

export function getAnswerPlanSteps(question: Question): AnswerPlanStep[] {
  if (question.prompt.startsWith("Do you have any specific routines or practices")) {
    return [
      {
        title: "Describe your routine",
        description: "Explain what you do and how often.",
      },
      {
        title: "Usual situation",
        description: "Describe where, when, or how you usually do it.",
      },
      {
        title: "One clear benefit",
        description: "Explain one benefit it brings to your well-being.",
      },
    ];
  }

  const normalized = question.plan.replace(/[.]+$/, "");
  const clauses = normalized
    .split(/,\s*(?:and\s+)?|\s+and\s+(?=[a-z])/i)
    .map((clause) => clause.trim())
    .filter(Boolean)
    .slice(0, 3);

  while (clauses.length < 3) {
    clauses.push(clauses.length === 1 ? "Add one concrete detail" : "Close with the result");
  }

  return clauses.map((clause) => ({
    title: sentenceCase(clause),
    description:
      descriptionRules.find(([pattern]) => pattern.test(clause))?.[1] ??
      "Keep this step specific and easy to say.",
  }));
}

export function countWords(transcript: string): number {
  return transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
}
