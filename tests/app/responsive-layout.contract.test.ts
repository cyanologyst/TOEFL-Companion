import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("native desktop responsive contract", () => {
  it("keeps one content scroller below the fixed title bar and beside the sidebar", () => {
    expect(stylesheet).toMatch(/\*\s*\{\s*box-sizing:\s*border-box;/u);
    expect(stylesheet).toMatch(
      /\.native-titlebar\s*\{[^}]*position:\s*fixed;[^}]*grid-template-columns:\s*auto\s+1fr\s+auto\s+auto;/su,
    );
    expect(stylesheet).toMatch(
      /\.app-content\s*\{[^}]*position:\s*fixed;[^}]*left:\s*var\(--sidebar-width\);[^}]*overflow:\s*auto;/su,
    );
    expect(stylesheet).toMatch(/body\s*\{[^}]*min-width:\s*960px;[^}]*min-height:\s*650px;/su);
  });

  it("collapses navigation and reflows dense study workspaces at the minimum window width", () => {
    expect(stylesheet).toMatch(/@media \(max-width:\s*1080px\)[\s\S]*?--sidebar-width:\s*82px;/u);
    expect(stylesheet).toMatch(
      /@media \(max-width:\s*980px\)[\s\S]*?\.dashboard-layout\s*\{[^}]*grid-template-columns:\s*1fr;/u,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width:\s*980px\)[\s\S]*?\.vocabulary-library-layout\s*\{[^}]*grid-template-columns:\s*1fr;/u,
    );
    expect(stylesheet).toMatch(
      /@media \(max-width:\s*980px\)[\s\S]*?\.review-layout\s*\{[^}]*grid-template-columns:\s*1fr;/u,
    );
  });
});
