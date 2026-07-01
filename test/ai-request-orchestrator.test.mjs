import assert from "node:assert/strict";
import { orchestrateRequest } from "../functions/_lib/ai-request-orchestrator.js";
import { applyNaturalRequestOrchestration } from "../functions/api/ai/generate.js";

let passed = 0;
function ok(label) {
  passed += 1;
  console.log("  ✓ " + label);
}

async function testWeeklyFivePosts() {
  const result = await orchestrateRequest({
    userRequest: "今週のThreads投稿を5本作って。商品はSNS MNM-PROで、個人事業主向けに親しみやすく。"
  });

  assert.equal(result.postCount, 5);
  assert.equal(result.featureKey, "bulk-generate");
  assert.equal(result.channel, "Threads");
  assert.equal(result.product, "SNS MNM-PRO");
  assert.match(result.target, /個人事業主/);
  assert.equal(result.tone, "親しみやすい");
  assert.equal(result.nextLayer, "generation");
  assert.ok(result.inputUnderstanding);
  ok("natural request routes to bulk-generate with 5 posts");
}

async function testAmbiguousTargetIsHonest() {
  const result = await orchestrateRequest({
    userRequest: "今週の投稿を3本作って。やわらかい案内型で。"
  });

  assert.equal(result.postCount, 3);
  assert.equal(result.tone, "やわらかい案内型");
  assert.ok(result.ambiguities.includes("target_not_explicit"));
  assert.equal(result.target, "SNS発信を続けたい人");
  ok("missing target is reported instead of pretending it was measured");
}

async function testSpecificFeatureRouting() {
  const day = await orchestrateRequest({ userRequest: "AIに頼んでもなんか違う、というテーマで1日分を作って" });
  const cta = await orchestrateRequest({ userRequest: "この投稿に自然な会話導線の問いを足して" });
  const thread = await orchestrateRequest({ userRequest: "長い投稿を投稿分割設計で3本に分けて" });

  assert.equal(day.featureKey, "day-generate");
  assert.equal(cta.featureKey, "cta");
  assert.equal(thread.featureKey, "thread");
  ok("feature-specific natural language routes to the expected feature keys");
}

async function testProfileFallback() {
  const result = await orchestrateRequest({
    userRequest: "反応が少ない投稿について2本作って",
    profile: {
      product: "紅茶ラボ",
      target: "講師・コンサル",
      tone: "論理的",
      postType: "教育型"
    }
  });

  assert.equal(result.postCount, 2);
  assert.equal(result.product, "紅茶ラボ");
  assert.equal(result.target, "講師・コンサル");
  assert.equal(result.tone, "論理的");
  assert.equal(result.postType, "教育型");
  ok("profile reference fills missing fields without overriding the request");
}

async function testEmptyRequestFallsBackSafely() {
  const result = await orchestrateRequest({ userRequest: "" });

  assert.equal(result.postCount, 3);
  assert.ok(result.ambiguities.includes("target_not_explicit"));
  assert.ok(result.ambiguities.includes("tone_not_explicit"));
  assert.ok(result.ambiguities.includes("post_type_not_explicit"));
  assert.equal(result.nextLayer, "generation");
  assert.equal(result.featureKey, "bulk-generate");
  ok("empty request returns a safe default generation plan");
}

async function testNaturalRequestModeCallsOrchestrator() {
  let called = 0;
  const input = { requestMode: "natural", userRequest: "今週のThreads投稿を5本作って", tone: "論理的" };
  await applyNaturalRequestOrchestration(input, async ({ userRequest }) => {
    called += 1;
    assert.equal(userRequest, "今週のThreads投稿を5本作って");
    return {
      postCount: 5,
      tone: "親しみやすい",
      postType: "共感型",
      featureKey: "bulk-generate",
      ambiguities: ["target_not_explicit"]
    };
  });

  assert.equal(called, 1);
  assert.equal(input.postCount, 5);
  assert.equal(input.tone, "親しみやすい");
  assert.equal(input.postType, "共感型");
  assert.equal(input.featureKey, "bulk-generate");
  assert.deepEqual(input.orchestratorAmbiguities, ["target_not_explicit"]);
  ok("natural request mode calls orchestrator and merges allowed fields");
}

async function testStructuredRequestDoesNotCallOrchestrator() {
  let called = 0;
  const input = { topic: "投稿ネタ切れ", tone: "論理的" };
  await applyNaturalRequestOrchestration(input, async () => {
    called += 1;
    throw new Error("orchestrator should not be called");
  });

  assert.equal(called, 0);
  assert.equal(input.tone, "論理的");
  assert.equal(input.postCount, undefined);
  ok("structured request skips orchestrator");
}

async function main() {
  console.log("ai-request-orchestrator tests");
  await testWeeklyFivePosts();
  await testAmbiguousTargetIsHonest();
  await testSpecificFeatureRouting();
  await testProfileFallback();
  await testEmptyRequestFallsBackSafely();
  await testNaturalRequestModeCallsOrchestrator();
  await testStructuredRequestDoesNotCallOrchestrator();
  console.log(`\nAll ${passed} checks passed.`);
}

main().catch((err) => {
  console.error("\nTEST FAILED:\n", err);
  process.exit(1);
});
