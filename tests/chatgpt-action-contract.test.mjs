import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps representative ChatGPT prompts mapped to published operations", async () => {
  const evaluations = JSON.parse(await readFile(new URL("./chatgpt-action-evals.json", import.meta.url), "utf8"));
  const source = await readFile(new URL("../worker/openapi.ts", import.meta.url), "utf8");
  assert.ok(evaluations.length >= 10);
  for (const evaluation of evaluations) {
    assert.equal(typeof evaluation.prompt, "string");
    assert.match(source, new RegExp(`operationId: "${evaluation.operationId}"`));
    if (evaluation.period) assert.match(source, new RegExp(`"${evaluation.period}"`));
  }
});
