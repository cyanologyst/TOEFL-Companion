// Captures the real app at 2x for the ad, from the isolated test profile.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "C:/Users/Mohammad/Documents/Codex/2026-07-28/i-want-you-to-help-me/outputs/toefl-companion-ad/public/screens";
const pages = (await (await fetch("http://127.0.0.1:9226/json")).json()).filter((t) => t.type === "page");
const target = pages.find((t) => !/reminder/i.test(t.url) && !/reminder/i.test(t.title));
if (!target) { console.log("main window not found"); process.exit(2); }
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => socket.addEventListener("open", r, { once: true }));
let nextId = 0;
const pending = new Map();
socket.addEventListener("message", (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id); });
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  const timer = setTimeout(() => reject(new Error(method + " timed out")), 30000);
  pending.set(id, (m) => { clearTimeout(timer); resolve(m); });
  socket.send(JSON.stringify({ id, method, params }));
});
const ev = async (expression) => {
  const { result } = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return result.exceptionDetails ? `THREW ${result.exceptionDetails.exception?.description}` : result.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const setTheme = (theme) => ev(`(() => {
  const key = "toefl-companion:appearance:v1";
  const next = { ...JSON.parse(localStorage.getItem(key) || "{}"), theme: ${JSON.stringify(theme)} };
  localStorage.setItem(key, JSON.stringify(next));
  document.documentElement.dataset.theme = ${JSON.stringify(theme)};
  window.dispatchEvent(new Event("toefl-companion:appearance-change"));
  return document.documentElement.dataset.theme;
})()`);

const shoot = async (name) => {
  await sleep(500);
  const png = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(png.result.data, "base64"));
  console.log("captured", name);
};

await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });
await ev(`location.hash = "#view=dashboard"`);
await sleep(1200);

for (const theme of ["indigo", "night", "teal", "sunshine", "paper"]) {
  await setTheme(theme);
  await sleep(700);
  await shoot(`dashboard-${theme}`);
}
await setTheme("indigo");
await sleep(600);

const states = [
  ["vocabulary", "#view=vocabulary&section=library", null],
  ["reading", "#view=reading", null],
  ["speaking-interview", "#view=speaking", `(() => { const b = [...document.querySelectorAll("button, [role=tab]")].find((x) => /interview practice/i.test(x.textContent)); b?.click(); return Boolean(b); })()`],
  ["speaking-repeat", "#view=speaking", `(() => { const b = [...document.querySelectorAll("button, [role=tab]")].find((x) => /listen\s*&?\s*repeat/i.test(x.textContent)); b?.click(); return Boolean(b); })()`],
  ["progress", "#view=progress", null],
];
for (const [name, hash, action] of states) {
  await ev(`location.hash = ${JSON.stringify(hash)}`);
  await sleep(1400);
  if (action) { await ev(action); await sleep(1400); }
  await shoot(name);
}

// Writing, with a draft in it so the counter and timer are alive.
await ev(`location.hash = "#view=writing"`);
await sleep(1500);
console.log("typed:", await ev(`(() => {
  const area = document.querySelector(".w-editor__field textarea");
  if (!area) return "no editor";
  const text = "I side with nurture. Twins raised apart often share traits, yet the way a child is taught to read, argue and ask questions is what shows up in school. Genes set a range; the environment decides where in that range a learner lands.";
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
  setter.call(area, text);
  area.dispatchEvent(new Event("input", { bubbles: true }));
  area.blur();
  return text.length;
})()`));
await sleep(2200);
await shoot("writing");

await send("Emulation.clearDeviceMetricsOverride");
socket.close();
process.exit(0);
