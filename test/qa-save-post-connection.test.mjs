import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const generateStart = html.indexOf("async function generateWithServer");
const generateEnd = html.indexOf("async function diagnoseWithServer");
const generateWithServer = html.slice(generateStart, generateEnd);
const flowStart = html.indexOf("const rawOutput = output.output || output;");
const flowEnd = html.indexOf("if (target)", flowStart);
const generationFlow = html.slice(flowStart, flowEnd);
const saveStart = html.indexOf('const saveButton = event.target.closest("[data-save-post]");');
const saveEnd = html.indexOf('const saveTextButton = event.target.closest("[data-save-text]");');
const saveHandler = html.slice(saveStart, saveEnd);

let passed = 0;
function ok(label) {
  passed += 1;
  console.log("  ✓ " + label);
}

function testServerQaResultsAreCarriedToOutput() {
  assert.ok(generateWithServer.includes("qaResults: data.qaResults || []"));
  assert.ok(generateWithServer.includes("qaResult: data.qaResult"));
  ok("generateWithServer carries server qaResults and legacy qaResult");
}

function testQaResultsAttachedToGeneratedRecord() {
  assert.ok(html.includes("function attachQaResultsToGeneratedRecord"));
  assert.ok(generationFlow.includes("attachQaResultsToGeneratedRecord(generatedRecord, output.qaResults, output.qaResult)"));
  assert.ok(html.includes("record.qaResults = items"));
  assert.ok(html.includes("qaResult: childQa"));
  assert.ok(html.includes("qaVerdict: childQa.overallVerdict"));
  ok("server qaResults are attached to generatedRecord and children before caching");
}

function testRepresentativeQaResultKeepsExistingSaveFlow() {
  assert.ok(html.includes("function representativeQaResult"));
  assert.ok(html.includes("record.qaResult = critiqueResult"));
  assert.ok(html.includes("record.qaVerdict = critiqueResult.overallVerdict"));
  ok("representative qaResult keeps existing save flow compatible");
}

function testWindowCritiqueGenerationRemoved() {
  assert.equal(html.includes("window.critiqueGeneration"), false);
  assert.equal(saveHandler.includes("critiqueGeneration("), false);
  ok("window.critiqueGeneration call is removed from index.html");
}

function testSaveHandlerUsesExistingQaResultBeforeAddPost() {
  assert.ok(saveHandler.indexOf("const critiqueResult = record.qaResult") > 0);
  assert.ok(saveHandler.indexOf("const critiqueResult = record.qaResult") < saveHandler.lastIndexOf("addPost("));
  assert.ok(saveHandler.includes("record.qaVerdict = critiqueResult.overallVerdict"));
  ok("save handler uses record.qaResult before addPost");
}

function testWarnFailSummaryAndHumanOverride() {
  assert.ok(saveHandler.includes('critiqueResult.overallVerdict === "warn" || critiqueResult.overallVerdict === "fail"'));
  assert.ok(saveHandler.includes("critiqueResult.fixSuggestion"));
  assert.ok(saveHandler.includes('saveButton.dataset.qaConfirmed !== "1"'));
  assert.ok(saveHandler.includes("もう一度"));
  ok("warn/fail display a summary and allow a second-click save");
}

function main() {
  console.log("qa save-post connection tests");
  testServerQaResultsAreCarriedToOutput();
  testQaResultsAttachedToGeneratedRecord();
  testRepresentativeQaResultKeepsExistingSaveFlow();
  testWindowCritiqueGenerationRemoved();
  testSaveHandlerUsesExistingQaResultBeforeAddPost();
  testWarnFailSummaryAndHumanOverride();
  console.log(`\nAll ${passed} checks passed.`);
}

try {
  main();
} catch (err) {
  console.error("\nTEST FAILED:\n", err);
  process.exit(1);
}
