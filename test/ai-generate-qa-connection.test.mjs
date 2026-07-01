import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildQaResultForGeneratedPosts } from "../functions/api/ai/generate.js";

const source = readFileSync(new URL("../functions/api/ai/generate.js", import.meta.url), "utf8");

let passed = 0;
function ok(label) {
  passed += 1;
  console.log("  ✓ " + label);
}

function testBuildQaResultRunsPerPostWithOutput() {
  const calls = [];
  const result = buildQaResultForGeneratedPosts("ai-post", {
    tone: "friendly",
    postType: "empathy"
  }, [
    { content: "post one", cta: "soft question" },
    { content: "post two", cta: "" }
  ], {
    posts: [
      { body: "post one", cta: "soft question", self_check: { total: 42 } },
      { body: "post two", cta: "", self_check: { total: 39 } }
    ]
  }, (payload) => {
    calls.push(payload);
    return { overallVerdict: "pass", results: [], total: payload.output.posts[0].self_check.total };
  });

  assert.equal(calls.length, 2);
  assert.equal(result.length, 2);
  assert.equal(result[0].index, 0);
  assert.equal(result[1].index, 1);
  assert.equal(calls[0].output.posts.length, 1);
  assert.equal(calls[0].output.posts[0].self_check.total, 42);
  assert.equal(calls[1].output.posts[0].self_check.total, 39);
  assert.equal(calls[0].postText, "post one\nsoft question");
  assert.equal(calls[0].expectedTone, "friendly");
  assert.equal(calls[0].expectedPostType, "empathy");
  assert.equal(calls[0].hasCTA, false);
  ok("buildQaResultForGeneratedPosts runs QA per post and passes output");
}

function testCrossPostDangerousCtaDoesNotBleedAcrossPosts() {
  const result = buildQaResultForGeneratedPosts("ai-post", {}, [
    { content: "action phrase stays in post one", cta: "" },
    { content: "reward phrase stays in post two", cta: "" }
  ], {
    posts: [
      { body: "action phrase stays in post one", cta: "", self_check: { total: 40 } },
      { body: "reward phrase stays in post two", cta: "", self_check: { total: 40 } }
    ]
  }, (payload) => {
    assert.ok(!payload.postText.includes("action phrase stays in post one\n\nreward phrase stays in post two"));
    const hasBothPosts = payload.postText.includes("action phrase") && payload.postText.includes("reward phrase");
    assert.equal(hasBothPosts, false);
    return { overallVerdict: "pass", results: [{ item: "危険CTA", verdict: "pass" }] };
  });

  assert.equal(result.length, 2);
  assert.notEqual(result[0].qaResult.results.find((item) => item.item === "危険CTA")?.verdict, "fail");
  assert.notEqual(result[1].qaResult.results.find((item) => item.item === "危険CTA")?.verdict, "fail");
  ok("cross-post CTA/reward words do not create a dangerous CTA fail");
}

function testRewriteFallsBackToSingleQaArray() {
  const result = buildQaResultForGeneratedPosts("rewrite", {
    tone: "logical",
    postType: "brushup"
  }, [], {
    rewritten_post: "Rewritten post body",
    self_check: { total: 41 }
  }, (payload) => {
    assert.equal(payload.feature, "rewrite");
    assert.equal(payload.output.rewritten_post, "Rewritten post body");
    return { overallVerdict: "pass", results: [] };
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].index, 0);
  assert.equal(result[0].qaResult.overallVerdict, "pass");
  ok("rewrite returns a single qaResults array item");
}

function testQaResultBuiltAfterGenerationBeforeInsert() {
  const runIndex = source.indexOf("let { output, quality, attempts } = await runGeneration");
  const qaIndex = source.indexOf("const qaResults = buildQaResultForGeneratedPosts");
  const insertIndex = source.indexOf("INSERT INTO generated_posts");
  assert.ok(runIndex > 0, "runGeneration call exists");
  assert.ok(qaIndex > runIndex, "qaResults is built after runGeneration");
  assert.ok(insertIndex > qaIndex, "generated_posts INSERT happens after qaResults");
  ok("qaResults is built after generation and before generated_posts insert");
}

function testResponseIncludesQaResults() {
  assert.ok(source.includes("qaResults"));
  assert.ok(source.indexOf("qaResults") < source.lastIndexOf("Response.json"));
  assert.ok(/output\s*,\s*qaResults/.test(source));
  ok("Response.json includes qaResults");
}

function main() {
  console.log("ai generate QA connection tests");
  testBuildQaResultRunsPerPostWithOutput();
  testCrossPostDangerousCtaDoesNotBleedAcrossPosts();
  testRewriteFallsBackToSingleQaArray();
  testQaResultBuiltAfterGenerationBeforeInsert();
  testResponseIncludesQaResults();
  console.log(`\nAll ${passed} checks passed.`);
}

try {
  main();
} catch (err) {
  console.error("\nTEST FAILED:\n", err);
  process.exit(1);
}
