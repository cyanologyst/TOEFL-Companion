import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve(process.argv[2] ?? "work/writing-ocr.json");
const outputPath = path.resolve(process.argv[3] ?? "src/data/academic-discussions.json");

const titles = [
  "Nature, nurture, and human development",
  "Technology in education",
  "Corporate transparency",
  "Digital communication and relationships",
  "Ethical concerns in artificial intelligence",
  "Emotional intelligence at work",
  "What shapes history?",
  "Digital communication in daily life",
  "Advertising and consumer behavior",
  "Advertising: information or manipulation?",
  "Active participation or lectures?",
  "Cultural globalization and local traditions",
  "Can art create social change?",
  "Career priorities and long-term satisfaction",
  "Social media and public opinion",
  "Corporate transparency and confidentiality",
  "Nature versus nurture",
  "Do social norms help or restrict?",
  "Global expansion or local roots?",
  "Multitasking in the workplace",
  "Social media influencers in marketing",
  "Surveillance technology and freedom",
  "Advertising that changes behavior",
  "Customer feedback and innovation",
  "Durable products or efficient upgrades?",
  "Should literature inspire or entertain?",
  "Storytelling in communication",
  "Nature versus nurture",
  "Technology's effect on education",
  "What determines educational outcomes?",
];

const courseFallbacks = [
  "Psychology",
  "Technology in Education",
  "Business Ethics",
  "Communication Studies",
  "Ethics",
  "Psychology",
  "History",
  "Communication Studies",
  "Marketing Studies",
  "Marketing Studies",
  "Education",
  "Anthropology",
  "Sociology",
  "Business Management",
  "Sociology",
  "Business Ethics",
  "Psychology",
  "Sociology",
  "Business Ethics",
  "Business Management",
  "Marketing",
  "Technology",
  "Media Studies",
  "Marketing",
  "Environmental Science",
  "Literature",
  "Communications",
  "Psychology",
  "Education",
  "Education",
];

const excludedNames = new Set([
  "Cut",
  "Paste",
  "Undo",
  "Redo",
  "Review",
  "Sample",
  "Exit",
  "Note",
  "Setting",
  "Highlight",
  "Report",
  "Volume",
  "Total",
  "Next",
  "Claire",
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/u, ""));
}

function joinLines(lines) {
  return lines
    .sort((left, right) => left.y - right.y || left.x - right.x)
    .map((line) => line.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/(\w)-\s+(\w)/gu, "$1$2")
    .replace(/\s+([,.;?!])/gu, "$1")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

function cleanText(value) {
  return value
    .replace(/\bAl\b/gu, "AI")
    .replace(/\bTo day\b/gu, "Today")
    .replace(/\bSO\b/gu, "so")
    .replace(/\bcompanys\b/giu, "company's")
    .replace(/\beconomical\b/giu, "economic")
    .replace(/\bproblemsolving\b/giu, "problem-solving")
    .replace(/\btodays\b/giu, "today's")
    .replace(/\bjob security\. are\b/giu, "job security, are")
    .replace(/\bagree with\. Why\?/giu, "agree with? Why?")
    .replace(/\bwayms\b/giu, "ways")
    .replace(/\bImportant\b/gu, "important")
    .replace(/\bproduce better\b/giu, "produces better")
    .replace(/\bsocial situation\b/giu, "social situations")
    .replace(/\s+([,.;?!])/gu, "$1")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

function parseCourse(lines, fallback) {
  const intro = joinLines(lines.filter((line) => line.x < 780 && line.y >= 45 && line.y <= 180));
  const match = intro.match(/Your professor is teaching a class on (.+?)\.\s+Write a post/iu);
  if (!match) {
    return fallback;
  }
  return match[1]
    .split(" ")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function parseStudentNames(lines) {
  const candidates = lines
    .filter(
      (line) =>
        line.x >= 780 &&
        line.x <= 910 &&
        line.y >= 120 &&
        line.y <= 410 &&
        /^[A-Z][a-z]{2,12}$/u.test(line.text.trim()) &&
        !excludedNames.has(line.text.trim()),
    )
    .sort((left, right) => left.y - right.y);

  // Claire is a valid student name in almost every source image; it is only
  // excluded above to avoid a duplicated OCR artifact in the instruction
  // column. Re-add it when it is correctly positioned in the response rail.
  const claire = lines.find(
    (line) =>
      line.text.trim() === "Claire" &&
      line.x >= 780 &&
      line.x <= 910 &&
      line.y >= 120 &&
      line.y <= 410,
  );
  if (claire) {
    candidates.push(claire);
    candidates.sort((left, right) => left.y - right.y);
  }

  return candidates.slice(0, 2);
}

function parseResponses(lines, studentNameLines) {
  const responseLines = lines.filter(
    (line) =>
      line.x >= 900 &&
      line.x < 1800 &&
      line.y >= 55 &&
      line.y <= 390 &&
      !/^(?:Total|Hide Timer|Paste|Undo|Redo|Hide Word Count)/iu.test(line.text.trim()),
  );

  return studentNameLines.map((nameLine, index) => {
    const previousNameY =
      index === 0 ? Number.NEGATIVE_INFINITY : studentNameLines[index - 1].y + 8;
    return cleanText(
      joinLines(responseLines.filter((line) => line.y > previousNameY && line.y <= nameLine.y + 8)),
    );
  });
}

function parseRecord(record, index) {
  const sequence = index + 1;
  const weekMatch = record.source.match(/Week\s+(\d+)/iu);
  const teacherLine = record.lines.find(
    (line) => line.x < 780 && /^Dr\.\s+[A-Z]/u.test(line.text.trim()),
  );
  if (!teacherLine) {
    throw new Error(`Professor name was not found in ${record.source}`);
  }

  const question = cleanText(
    joinLines(record.lines.filter((line) => line.x < 780 && line.y > teacherLine.y + 10)),
  );
  const studentNameLines = parseStudentNames(record.lines);
  const responses = parseResponses(record.lines, studentNameLines);

  if (!question || studentNameLines.length !== 2 || responses.some((value) => !value)) {
    throw new Error(`Incomplete OCR parsing for ${record.source}`);
  }

  return {
    id: `academic-discussion-${String(sequence).padStart(2, "0")}`,
    sequence,
    week: Number(weekMatch?.[1] ?? Math.ceil(sequence / 5)),
    title: titles[index],
    course: parseCourse(record.lines, courseFallbacks[index]),
    professor: teacherLine.text.trim(),
    prompt: question,
    students: studentNameLines.map((line, studentIndex) => ({
      name: line.text.trim(),
      response: responses[studentIndex],
    })),
    recommendedWords: 100,
    timeLimitSeconds: 600,
    sourceImage: record.source,
  };
}

const source = readJson(sourcePath);
const discussions = source.map(parseRecord);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      source: "User-provided Writing.zip; extracted with Windows OCR and normalized locally",
      taskType: "TOEFL Academic Discussion",
      discussions,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`Wrote ${discussions.length} discussions to ${outputPath}`);
