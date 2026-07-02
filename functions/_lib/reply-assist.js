// リプ支援モード（管理者専用 v1）のプロンプト組み立て。
//
// 投稿生成とリプライ生成は本質的に違う：
// - 相手の投稿の文脈・温度に乗ること（フックで始める投稿とは違う）
// - 短いこと（1〜3文。長文リプは営業臭くなる）
// - 製品名・宣伝・誘導文言を一切含めないこと（純粋な会話としての返信）
//
// 既存の voice-injector / openai.js のパイプラインをそのまま使う。
// Threads API への書き込みは一切しない（生成して表示するだけ）。

import { getVoiceProfile } from "./voice-profiles.js";
import { buildVoiceInstruction } from "./voice-injector.js";

export const REPLY_STANCES = ["empathy", "tsukkomi", "insight"];

const STANCE_LABEL = {
  empathy: "共感寄り。相手の悩み・あるあるに乗る（例:「それめっちゃわかる、僕も〜」）",
  tsukkomi: "ツッコミ寄り。笑いで距離を縮める（例:「〜んかい！！ってなるやつw」）",
  insight: "情報提供寄り。一言だけ役に立つ（例:「これ、たぶん〜すると変わるかも」）"
};

// stance → voice-injector の temperature モードへのマッピング。
// empathy→gentle寄り, tsukkomi→full-throttle寄り, insight→standard。
// voice-profiles.js の temperature[mode].for に含まれる語で選ばせるため、
// resolveTemperatureMode がヒットするダミーの postType 語を渡す。
const STANCE_POST_TYPE = {
  empathy: "感謝",
  tsukkomi: "あるある",
  insight: "ノウハウ"
};

export function normalizeStance(value) {
  const v = String(value || "").trim();
  return REPLY_STANCES.includes(v) ? v : "empathy";
}

export const replySchema = {
  name: "sns_mnm_reply_assist_v1",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      replies: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            text: { type: "string" },
            approach: { type: "string" }
          },
          required: ["text", "approach"]
        }
      }
    },
    required: ["replies"]
  }
};

export function buildReplyPrompt({ targetPost = "", stance = "empathy", dialect = "", voiceProfileId = "" } = {}) {
  const post = String(targetPost || "").trim();
  const normalizedStance = normalizeStance(stance);

  const lines = [
    "You write Threads REPLIES (リプライ), not standalone posts. This is a fundamentally different task from post generation.",
    "",
    "TARGET POST (the post you are replying to):",
    post,
    "",
    "REPLY RULES (must all hold):",
    "1. Read the target post's context and emotional temperature (悩み/自慢/質問/愚痴/報告) and match your reply's temperature to it. Do not ignore what they actually said.",
    "2. Stay SHORT. A reply is shorter than a post — 1 to 3 sentences. A long reply reads as sales pitching, never write a multi-paragraph reply.",
    "3. NEVER include a product name, tool name, URL, or any guidance phrase like 「プロフィールへ」「詳しくはこちら」「DMください」. This is a plain human reply, not marketing.",
    "4. Do not end on a generic crowd-survey question. If you ask something, make it specific to what they just said.",
    `5. STANCE for this reply: ${normalizedStance} — ${STANCE_LABEL[normalizedStance]}`,
    "6. Produce exactly 3 candidates. Each must take a genuinely different angle (not the same sentence reworded) — vary the opening, the specific detail you react to, and the phrasing.",
    "",
    "Return JSON only: { \"replies\": [ { \"text\": \"...\", \"approach\": \"short label for the angle used\" }, × 3 ] }"
  ];

  const voiceProfile = getVoiceProfile(voiceProfileId);
  const voiceInstruction = voiceProfile
    ? buildVoiceInstruction(voiceProfile, { dialect, postType: STANCE_POST_TYPE[normalizedStance] })
    : "";
  if (voiceInstruction) lines.push(voiceInstruction);

  return lines.join("\n");
}
