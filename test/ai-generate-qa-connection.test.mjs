import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildQaResultForGeneratedPosts } from "../functions/api/ai/generate.js";

const source = readFileSync(new URL("../functions/api/ai/generate.js", import.meta.url), "utf8");

let passed = 0;
function ok(label) {
  passed += 1;
  console.log("  ✓ " + label);
}

function testBuildQaResultPassesExpectedPayload() {
  let called = 0;
  const result = buildQaResultForGeneratedPosts({
    tone: "親しみやすい",
    postType: "共感型"
  }, [
    { content: "投稿本文1", cta: "自然な問い1" },
    { content: "投稿本文2", cta: "" }
  ], (payload) => {
    called += 1;
    assert.equal(payload.postText, "投稿本文1\n自然な問い1\n\n投稿本文2");
    assert.equal(payload.expectedTone, "親しみやすい");
    assert.equal(payload.expectedPostType, "共感型");
    assert.equal(payload.hasCTA, false);
    return { overallVerdict: "pass", results: [] };
  });

  assert.equal(called, 1);
  assert.equal(result.overallVerdict, "pass");
  ok("buildQaResultForGeneratedPosts passes generated text and expectations to critiqueGeneration");
}

function testQaResultBuiltAfterGenerationBeforeInsert() {
  const runIndex = source.indexOf("let { output, quality, attempts } = await runGeneration");
  const qaIndex = source.indexOf("const qaResult = buildQaResultForGeneratedPosts");
  const insertIndex = source.indexOf("INSERT INTO generated_posts");
  assert.ok(runIndex > 0, "runGeneration call exists");
  assert.ok(qaIndex > runIndex, "qaResult is built after runGeneration");
  assert.ok(insertIndex > qaIndex, "generated_posts INSERT happens after qaResult");
  ok("qaResult is built after generation and before generated_posts insert");
}

function testResponseIncludesQaResult() {
  assert.ok(source.includes("qaResult"));
  assert.ok(source.indexOf("qaResult") < source.lastIndexOf("Response.json"));
  assert.ok(/output\s*,\s*qaResult/.test(source));
  ok("Response.json includes qaResult");
}

function main() {
  console.log("ai generate QA connection tests");
  testBuildQaResultPassesExpectedPayload();
  testQaResultBuiltAfterGenerationBeforeInsert();
  testResponseIncludesQaResult();
  console.log(`\nAll ${passed} checks passed.`);
}

try {
  main();
} catch (err) {
  console.error("\nTEST FAILED:\n", err);
  process.exit(1);
}
