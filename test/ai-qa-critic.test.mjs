import assert from "node:assert/strict";
import { critiqueGeneration } from "../functions/_lib/ai-qa-critic.js";

let passed = 0;
function ok(label) {
  passed += 1;
  console.log("  ✓ " + label);
}

function testCleanPostPassesMeasuredChecks() {
  const result = critiqueGeneration({
    postText: [
      "夜になると、つい間食したくなる日があります。",
      "我慢が弱いというより、日中の食べ方で夜の空腹が強くなっていることも多いです。",
      "まずは夕方に小さく整えるだけでも、夜の選択は変わります。",
      "あなたは夜の間食が増える日、昼の食べ方に心当たりはありますか？"
    ].join("\n"),
    expectedTone: "親しみやすい",
    expectedPostType: "共感型"
  });

  assert.equal(result.overallVerdict, "pass");
  assert.equal(result.autoFixable, false);
  assert.equal(result.unmeasuredItems, 2);
  assert.equal(result.results.find((item) => item.item === "投稿タイプ一致").verdict, "unmeasured");
  assert.equal(result.results.find((item) => item.item === "口調一致").verdict, "unmeasured");
  ok("clean post passes measured checks and reports tone/type as unmeasured");
}

function testDangerousCtaFails() {
  const result = critiqueGeneration({
    postText: "詳しく知りたい人はコメント欄に「資料」と返信してください。無料特典をDMで送ります。"
  });

  assert.equal(result.overallVerdict, "fail");
  assert.equal(result.autoFixable, true);
  assert.equal(result.results.find((item) => item.item === "危険CTA").verdict, "fail");
  assert.match(result.fixSuggestion, /自然な問い/);
  ok("dangerous CTA is measured and fails");
}

function testNaturalWantPhraseDoesNotFail() {
  const result = critiqueGeneration({
    postText: [
      "この整理で助かる人もいると思うので、必要な人がいたら教えてください。",
      "今の状況に合わせて、どこから整えると楽か一緒に考えます。"
    ].join("\n")
  });

  assert.equal(result.results.find((item) => item.item === "危険CTA").verdict, "pass");
  assert.notEqual(result.overallVerdict, "fail");
  ok("natural want/need phrase does not fail without nearby reward bait");
}

function testSalesPressureWarns() {
  const result = critiqueGeneration({
    postText: "今すぐ登録してください。限定の案内なので、購入したい人は今日中に申し込みましょう。"
  });

  assert.equal(result.overallVerdict, "warn");
  assert.equal(result.autoFixable, false);
  assert.equal(result.results.find((item) => item.item === "売り込み感").verdict, "warn");
  ok("small sales-pressure check warns instead of pretending full semantic coverage");
}

function testEmptyBodyFailsViaExistingAggregate() {
  const result = critiqueGeneration({ postText: "" });

  assert.equal(result.overallVerdict, "fail");
  assert.equal(result.results.find((item) => item.item === "テンプレ感").verdict, "fail");
  assert.match(result.fixSuggestion, /既存品質集約/);
  ok("existing aggregate is converted into an overall fail verdict");
}

function main() {
  console.log("ai-qa-critic tests");
  testCleanPostPassesMeasuredChecks();
  testDangerousCtaFails();
  testNaturalWantPhraseDoesNotFail();
  testSalesPressureWarns();
  testEmptyBodyFailsViaExistingAggregate();
  console.log(`\nAll ${passed} checks passed.`);
}

try {
  main();
} catch (err) {
  console.error("\nTEST FAILED:\n", err);
  process.exit(1);
}
