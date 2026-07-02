import assert from "node:assert/strict";
import { buildReplyPrompt, normalizeStance, REPLY_STANCES } from "../functions/_lib/reply-assist.js";

let passed = 0;
function ok(label) {
  passed += 1;
  console.log("  ✓ " + label);
}

function testEmptyTargetPostIsSafe() {
  const prompt = buildReplyPrompt({ targetPost: "" });
  assert.equal(typeof prompt, "string");
  assert.ok(prompt.length > 0, "空でもプロンプト文字列は返る(エラーを投げない)");
  ok("empty targetPost does not throw, returns a safe prompt string");
}

function testStanceChangesInstruction() {
  const empathy = buildReplyPrompt({ targetPost: "最近全然投稿伸びなくてしんどい", stance: "empathy" });
  const tsukkomi = buildReplyPrompt({ targetPost: "最近全然投稿伸びなくてしんどい", stance: "tsukkomi" });
  const insight = buildReplyPrompt({ targetPost: "最近全然投稿伸びなくてしんどい", stance: "insight" });
  assert.notEqual(empathy, tsukkomi);
  assert.notEqual(tsukkomi, insight);
  assert.match(empathy, /共感寄り/);
  assert.match(tsukkomi, /ツッコミ寄り/);
  assert.match(insight, /情報提供寄り/);
  ok("each stance produces a distinct instruction block");
}

function testNoProductNameConstraint() {
  const prompt = buildReplyPrompt({ targetPost: "投稿ネタが尽きた" });
  assert.match(prompt, /product name|プロフィールへ/);
  ok("prompt includes the no-product-name / no-guidance constraint");
}

function testStandardDialectHasNoKansai() {
  const prompt = buildReplyPrompt({
    targetPost: "投稿ネタが尽きた",
    dialect: "標準語",
    voiceProfileId: "kocha-ouji"
  });
  assert.ok(!prompt.includes("〜やねん"), "標準語には関西弁の register が入らない");
  ok("dialect=standard includes no kansai register tokens");
}

function testVoiceInjectorIsCalled() {
  const withVoice = buildReplyPrompt({ targetPost: "投稿ネタが尽きた", voiceProfileId: "kocha-ouji" });
  const withoutVoice = buildReplyPrompt({ targetPost: "投稿ネタが尽きた" });
  assert.ok(withVoice.includes("困ってる人をすっと助けたい"), "voiceProfileId 指定時は人格層が含まれる");
  assert.ok(!withoutVoice.includes("困ってる人をすっと助けたい"), "voiceProfileId 無しでは人格層が含まれない");
  ok("voice-injector persona layer is included only when voiceProfileId is set");
}

function testNormalizeStanceFallsBackToEmpathy() {
  assert.equal(normalizeStance("empathy"), "empathy");
  assert.equal(normalizeStance("tsukkomi"), "tsukkomi");
  assert.equal(normalizeStance("insight"), "insight");
  assert.equal(normalizeStance(""), "empathy");
  assert.equal(normalizeStance("unknown"), "empathy");
  ok("unknown stance falls back to empathy (safe default)");
}

function testReplyStancesExported() {
  assert.deepEqual(REPLY_STANCES, ["empathy", "tsukkomi", "insight"]);
  ok("REPLY_STANCES exports the 3 valid stances");
}

function main() {
  console.log("reply-assist tests");
  testEmptyTargetPostIsSafe();
  testStanceChangesInstruction();
  testNoProductNameConstraint();
  testStandardDialectHasNoKansai();
  testVoiceInjectorIsCalled();
  testNormalizeStanceFallsBackToEmpathy();
  testReplyStancesExported();
  console.log(`\nAll ${passed} checks passed.`);
}

main();
