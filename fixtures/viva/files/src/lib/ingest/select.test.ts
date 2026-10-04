import { describe, expect, it } from "vitest";
import { FIXTURE_NAMES, loadFixture } from "./fixture";
import { parseGitHubUrl } from "./github";
import { BRIEF_BUDGET_CHARS, PER_FILE_CAP_CHARS, isIgnored, loadContents, scoreFile, selectFiles } from "./select";

describe("isIgnored", () => {
  it("skips lockfiles, binaries, build output and vendored code", () => {
    for (const path of ["package-lock.json", "bun.lockb", "public/logo.png", "node_modules/a/index.js", "dist/app.js", "app.min.js"]) {
      expect(isIgnored({ path, size: 100 }), path).toBe(true);
    }
  });

  it("skips empty and very large files", () => {
    expect(isIgnored({ path: "src/a.ts", size: 0 })).toBe(true);
    expect(isIgnored({ path: "src/data.ts", size: 500_000 })).toBe(true);
  });

  it("keeps ordinary source files", () => {
    expect(isIgnored({ path: "src/app.ts", size: 1200 })).toBe(false);
  });
});

describe("scoreFile", () => {
  it("ranks README, then manifest, then entry point, then source, then tests", () => {
    const score = (path: string) => scoreFile({ path, size: 3000 }).score;
    expect(score("README.md")).toBeGreaterThan(score("package.json"));
    expect(score("package.json")).toBeGreaterThan(score("src/main.tsx"));
    expect(score("src/main.tsx")).toBeGreaterThan(score("src/lib/utils.ts"));
    expect(score("src/lib/utils.ts")).toBeGreaterThan(score("backend/tests/test_app.py"));
  });
});

describe("selectFiles on fixtures", () => {
  for (const name of FIXTURE_NAMES) {
    it(`${name}: picks the README and a manifest, stays in budget, and every file is readable`, async () => {
      const source = loadFixture(name);
      const selected = selectFiles(source.files);
      const paths = selected.map((file) => file.path);

      expect(paths[0]).toBe("README.md");
      expect(paths.some((path) => /(package\.json|requirements\.txt)$/.test(path))).toBe(true);
      expect(paths.some((path) => /\.(png|webp|jpg|pdf|lockb)$/.test(path))).toBe(false);

      const used = selected.reduce((sum, file) => sum + Math.min(file.size, PER_FILE_CAP_CHARS), 0);
      expect(used).toBeLessThanOrEqual(BRIEF_BUDGET_CHARS);

      const contents = await loadContents(source, selected);
      expect(contents.length).toBe(selected.length);
      expect(contents.every((file) => file.content.length <= PER_FILE_CAP_CHARS)).toBe(true);
    });
  }

  it("refuses to read a path that is not in the repo", async () => {
    const source = loadFixture("portfolio-new");
    await expect(source.readFile("src/secret/invented.ts")).rejects.toThrow();
  });
});

describe("parseGitHubUrl", () => {
  it("accepts the common URL shapes", () => {
    const expected = { owner: "AbdulWasih05", repo: "Viva" };
    expect(parseGitHubUrl("https://github.com/AbdulWasih05/Viva")).toEqual(expected);
    expect(parseGitHubUrl("https://github.com/AbdulWasih05/Viva.git")).toEqual(expected);
    expect(parseGitHubUrl("https://github.com/AbdulWasih05/Viva/tree/main/src")).toEqual(expected);
    expect(parseGitHubUrl("AbdulWasih05/Viva")).toEqual(expected);
  });

  it("rejects things that are not GitHub repos", () => {
    expect(parseGitHubUrl("https://gitlab.com/a/b")).toBeNull();
    expect(parseGitHubUrl("not a url")).toBeNull();
  });
});
