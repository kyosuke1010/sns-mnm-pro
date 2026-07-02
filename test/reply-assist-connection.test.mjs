import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PHASE1_FEATURE_LABELS } from "../functions/_lib/ai-prompts.js";

const source = readFileSync(new URL("../functions/api/ai/generate.js", import.meta.url), "utf8");

let passed = 0;
function ok(label) {
  passed += 1;
  console.log("  ✓ " + label);
}

function testFeatureLabelRegistered() {
  assert.ok(PHASE1_FEATURE_LABELS["reply-assist"], "reply-assist が PHASE1_FEATURE_LABELS に登録されている");
  ok("reply-assist feature is registered so it passes the top-level feature check");
}

function testAdminCheckRunsBeforeHandler() {
  const featureBranchIndex = source.indexOf('feature === "reply-assist"');
  const requireAdminIndex = source.indexOf("await requireAdminUser(env, request)");
  const handlerCallIndex = source.indexOf("await handleReplyAssist(");
  assert.ok(featureBranchIndex > 0, "reply-assist の分岐が存在する");
  assert.ok(requireAdminIndex > featureBranchIndex, "分岐の中で requireAdminUser を呼んでいる");
  assert.ok(handlerCallIndex > requireAdminIndex, "管理者チェックの後に handleReplyAssist を呼んでいる(先に落ちれば403で止まる)");
  ok("admin check runs before the reply-assist handler executes (server-side enforced)");
}

function testAdminCheckIsBeforeStandardPipeline() {
  const replyBranchIndex = source.indexOf('feature === "reply-assist"');
  const orchestrationIndex = source.indexOf("await applyNaturalRequestOrchestration(input)");
  assert.ok(replyBranchIndex > 0 && orchestrationIndex > replyBranchIndex,
    "reply-assist は通常の生成パイプライン(orchestration等)より前で分岐・return するため混線しない");
  ok("reply-assist branch returns before the standard pipeline runs");
}

function testHandlerUsesQaCriticPerReply() {
  const handlerStart = source.indexOf("async function handleReplyAssist(");
  const handlerBody = source.slice(handlerStart, handlerStart + 2000);
  assert.match(handlerBody, /critiqueGeneration\(/, "各返信案に critiqueGeneration を実行している");
  assert.match(handlerBody, /candidates\.map/, "候補ごとにマッピングしている(複数案対応)");
  ok("handleReplyAssist runs critiqueGeneration per reply candidate");
}

function testExistingFeaturesUnaffected() {
  // 既存の分岐(診断機能・標準パイプライン)がそのまま残っていることを確認(後方互換)。
  assert.ok(source.includes("DIAGNOSIS_FEATURES.has(feature)"), "診断feature分岐は温存されている");
  assert.ok(source.includes("const firstPrompt = buildGenerationPrompt("), "標準生成パイプラインは温存されている");
  ok("existing diagnosis/standard generation branches are untouched");
}

function main() {
  console.log("reply-assist connection tests");
  testFeatureLabelRegistered();
  testAdminCheckRunsBeforeHandler();
  testAdminCheckIsBeforeStandardPipeline();
  testHandlerUsesQaCriticPerReply();
  testExistingFeaturesUnaffected();
  console.log(`\nAll ${passed} checks passed.`);
}

try {
  main();
} catch (err) {
  console.error("\nTEST FAILED:\n", err);
  process.exit(1);
}
