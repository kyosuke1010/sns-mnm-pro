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

function testGenericQuestionEndingWarns() {
  const result = critiqueGeneration({
    postText: "AIで投稿を作る人が増えてきました。使い方を3つにまとめました。みなさんはどう思いますか？"
  });
  assert.equal(result.results.find((item) => item.item === "丸投げ質問締め").verdict, "warn");
  ok("generic reader-directed question ending warns");
}

function testSelfIsolationQuestionDoesNotWarn() {
  const result = critiqueGeneration({
    postText: "AI投稿って綺麗すぎる。売り込み感も強い。これ、僕だけ？"
  });
  assert.equal(result.results.find((item) => item.item === "丸投げ質問締め").verdict, "pass");
  ok("self-subject isolation question is not treated as generic ending");
}

function testKeigoOveruseWarnsWithProfile() {
  const result = critiqueGeneration({
    voiceProfileId: "kocha-ouji",
    postText: "本日はご案内いたします。とても便利な機能です。ぜひご覧ください。よろしくお願いいたします。"
  });
  const keigo = result.results.find((item) => item.item === "敬語過多");
  assert.ok(keigo, "ボイス指定時は敬語過多を計測");
  assert.equal(keigo.verdict, "warn");
  ok("keigo overuse warns when a voice profile is active");
}

function testKeigoNotMeasuredWithoutProfile() {
  const result = critiqueGeneration({
    postText: "本日はご案内いたします。とても便利な機能です。ぜひご覧ください。よろしくお願いいたします。"
  });
  assert.equal(result.results.find((item) => item.item === "敬語過多"), undefined);
  ok("keigo overuse is not measured without a voice profile");
}

function main() {
  console.log("ai-qa-critic tests");
  testCleanPostPassesMeasuredChecks();
  testDangerousCtaFails();
  testNaturalWantPhraseDoesNotFail();
  testSalesPressureWarns();
  testEmptyBodyFailsViaExistingAggregate();
  testGenericQuestionEndingWarns();
  testSelfIsolationQuestionDoesNotWarn();
  testKeigoOveruseWarnsWithProfile();
  testKeigoNotMeasuredWithoutProfile();
  console.log(`\nAll ${passed} checks passed.`);
}

try {
  main();
} catch (err) {
  console.error("\nTEST FAILED:\n", err);
  process.exit(1);
}
