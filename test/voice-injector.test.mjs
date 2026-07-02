import assert from "node:assert/strict";
import {
  buildVoiceInstruction,
  pickFingerprints,
  resolveTemperatureMode,
  normalizeDialectKey
} from "../functions/_lib/voice-injector.js";
import { getVoiceProfile } from "../functions/_lib/voice-profiles.js";
import { buildVoiceInstructionForInput } from "../functions/api/ai/generate.js";

let passed = 0;
function ok(label) {
  passed += 1;
  console.log("  ✓ " + label);
}

const profile = getVoiceProfile("kocha-ouji");
const zero = () => 0;      // 固定乱数（先頭から選ぶ・count=2）
const high = () => 0.99;   // 固定乱数（count=3）

function testPersonaAlwaysIncluded() {
  const core = "困ってる人をすっと助けたい";
  const kansai = buildVoiceInstruction(profile, { dialect: "関西弁", random: zero });
  const standard = buildVoiceInstruction(profile, { dialect: "標準語", random: zero });
  assert.ok(kansai.includes(core), "kansai に人格層が含まれる");
  assert.ok(standard.includes(core), "standard に人格層が含まれる");
  ok("persona layer is included regardless of dialect");
}

function testStandardHasNoKansai() {
  const standard = buildVoiceInstruction(profile, { dialect: "標準語", random: zero });
  assert.ok(!standard.includes("やねん"), "標準語に『やねん』が無い");
  assert.ok(!standard.includes("みんなそう思わへん"), "標準語に関西同意求めが無い");
  assert.ok(standard.includes("〜だよね？"), "標準語の register が入る");
  ok("standard dialect contains no kansai register tokens");
}

function testKansaiHasKansai() {
  const kansai = buildVoiceInstruction(profile, { dialect: "関西弁", random: zero });
  assert.ok(kansai.includes("〜やねん"), "関西弁 register が入る");
  assert.ok(kansai.includes("やん"), "few-shot / register に関西弁表現が入る");
  ok("kansai dialect contains kansai register tokens");
}

function testTemperatureModeFromPostType() {
  assert.equal(resolveTemperatureMode(profile.temperature, "共感型"), "full-throttle");
  assert.equal(resolveTemperatureMode(profile.temperature, "ノウハウ"), "standard");
  assert.equal(resolveTemperatureMode(profile.temperature, "告知"), "announce");
  assert.equal(resolveTemperatureMode(profile.temperature, "商品導線型"), "standard"); // 未該当は標準
  ok("temperature mode is selected from postType");
}

function testFingerprintCountIsTwoOrThree() {
  const two = pickFingerprints(profile.fingerprints, zero);
  const three = pickFingerprints(profile.fingerprints, high);
  assert.equal(two.length, 2, "count=2");
  assert.equal(three.length, 3, "count=3");
  assert.equal(new Set(two).size, two.length, "重複なし(2)");
  assert.equal(new Set(three).size, three.length, "重複なし(3)");
  // 全部入れ禁止：総数より必ず少ない
  assert.ok(three.length < profile.fingerprints.length);
  ok("fingerprints pick 2-3 only (deterministic with injected random)");
}

function testBackwardCompatNoProfile() {
  assert.equal(buildVoiceInstruction(null, {}), "", "profile 無しは空文字");
  assert.equal(buildVoiceInstructionForInput({}, {}), "", "voiceProfileId 無しは空文字");
  assert.equal(buildVoiceInstructionForInput({ voiceProfileId: "not-exist" }, {}), "", "未知IDは空文字");
  ok("no voiceProfileId => empty instruction (generate.js backward compatible)");
}

function testDialectKeyMapping() {
  assert.equal(normalizeDialectKey("関西弁"), "kansai");
  assert.equal(normalizeDialectKey("標準語"), "standard");
  assert.equal(normalizeDialectKey("kansai"), "kansai");
  assert.equal(normalizeDialectKey(""), "standard");
  ok("dialect (#14 value) maps to register key");
}

function main() {
  console.log("voice-injector tests");
  testPersonaAlwaysIncluded();
  testStandardHasNoKansai();
  testKansaiHasKansai();
  testTemperatureModeFromPostType();
  testFingerprintCountIsTwoOrThree();
  testBackwardCompatNoProfile();
  testDialectKeyMapping();
  console.log(`\nAll ${passed} checks passed.`);
}

main();
