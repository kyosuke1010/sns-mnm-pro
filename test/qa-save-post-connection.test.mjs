import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf('const saveButton = event.target.closest("[data-save-post]");');
const end = html.indexOf('const saveTextButton = event.target.closest("[data-save-text]");');
const handler = html.slice(start, end);

let passed = 0;
function ok(label) {
  passed += 1;
  console.log("  ✓ " + label);
}

function testCritiqueBeforeAddPost() {
  assert.ok(start > 0, "save-post handler exists");
  assert.ok(handler.indexOf("critiqueGeneration(") > 0, "critiqueGeneration is called");
  assert.ok(handler.indexOf("critiqueGeneration(") < handler.lastIndexOf("addPost("), "critique runs before addPost");
  ok("critiqueGeneration is called before addPost");
}

function testQaResultAttachedToRecord() {
  assert.ok(handler.includes("record.qaResult = critiqueResult"));
  assert.ok(handler.includes("record.qaVerdict = critiqueResult.overallVerdict"));
  ok("qaResult and qaVerdict are attached to the record");
}

function testPassKeepsExistingFlow() {
  assert.ok(handler.includes('critiqueResult.overallVerdict === "warn" || critiqueResult.overallVerdict === "fail"'));
  assert.ok(handler.includes('overallVerdict: "pass"'));
  ok("pass verdict does not enter the warn/fail confirmation branch");
}

function testWarnFailSummaryAndHumanOverride() {
  assert.ok(handler.includes('critiqueResult.overallVerdict === "fail" ? "QA: 要確認" : "QA: 注意"'));
  assert.ok(handler.includes("critiqueResult.fixSuggestion"));
  assert.ok(handler.includes('saveButton.dataset.qaConfirmed !== "1"'));
  assert.ok(handler.includes("もう一度"));
  ok("warn/fail display a summary and allow a second-click save");
}

function main() {
  console.log("qa save-post connection tests");
  testCritiqueBeforeAddPost();
  testQaResultAttachedToRecord();
  testPassKeepsExistingFlow();
  testWarnFailSummaryAndHumanOverride();
  console.log(`\nAll ${passed} checks passed.`);
}

try {
  main();
} catch (err) {
  console.error("\nTEST FAILED:\n", err);
  process.exit(1);
}
