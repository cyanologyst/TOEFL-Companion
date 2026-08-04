import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const sourcePath =
  process.argv[2] ??
  "C:\\Users\\Mohammad\\Downloads\\Compressed\\toefl-speaking-editorial-refactor_2\\index.html";
const outputPath = process.argv[3] ?? path.resolve(process.cwd(), "src", "data", "toefl-data.json");

const html = await readFile(sourcePath, "utf8");
const marker = "window.TOEFL_DATA =";
const markerIndex = html.indexOf(marker);

if (markerIndex < 0) {
  throw new Error(`Could not find ${marker} in ${sourcePath}`);
}

const arrayStart = html.indexOf("[", markerIndex + marker.length);

if (arrayStart < 0) {
  throw new Error("Could not find the opening data array.");
}

let inString = false;
let escaped = false;
let depth = 0;
let arrayEnd = -1;

for (let index = arrayStart; index < html.length; index += 1) {
  const character = html[index];

  if (inString) {
    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === '"') {
      inString = false;
    }
    continue;
  }

  if (character === '"') {
    inString = true;
  } else if (character === "[") {
    depth += 1;
  } else if (character === "]") {
    depth -= 1;
    if (depth === 0) {
      arrayEnd = index + 1;
      break;
    }
  }
}

if (arrayEnd < 0) {
  throw new Error("Could not find the closing data array.");
}

const topics = JSON.parse(html.slice(arrayStart, arrayEnd));
const expectedFields = ["prompt", "plan", "ideas", "collocations", "answer", "answer2"];
const questionCount = topics.reduce((total, topic) => total + topic.questions.length, 0);

if (topics.length !== 30 || questionCount !== 120) {
  throw new Error(`Unexpected data size: ${topics.length} topics and ${questionCount} questions.`);
}

topics.forEach((topic, topicIndex) => {
  if (topic.id !== topicIndex + 1 || topic.questions.length !== 4) {
    throw new Error(`Invalid topic structure at index ${topicIndex}.`);
  }

  topic.questions.forEach((question, questionIndex) => {
    const actualFields = Object.keys(question).sort();
    const requiredFields = [...expectedFields].sort();

    if (JSON.stringify(actualFields) !== JSON.stringify(requiredFields)) {
      throw new Error(`Unexpected fields in topic ${topic.id}, question ${questionIndex + 1}.`);
    }

    if (
      !question.prompt ||
      !question.plan ||
      !question.answer ||
      !question.answer2 ||
      !Array.isArray(question.ideas) ||
      !Array.isArray(question.collocations)
    ) {
      throw new Error(
        `Empty or malformed data in topic ${topic.id}, question ${questionIndex + 1}.`,
      );
    }
  });
});

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(topics, null, 2)}\n`, "utf8");

console.log(`Extracted ${topics.length} topics and ${questionCount} questions to ${outputPath}`);
