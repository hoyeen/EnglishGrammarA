import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

describe("ESLint configuration", () => {
  it("ignores generated files inside local git worktrees", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const generatedFile = path.join(
      process.cwd(),
      ".worktrees",
      "example",
      ".next",
      "types",
      "validator.ts",
    );

    await expect(eslint.isPathIgnored(generatedFile)).resolves.toBe(true);
  });
});
