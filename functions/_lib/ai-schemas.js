const scoreFields = {
  hook_strength: { type: "number" },
  specificity: { type: "number" },
  emotional_connection: { type: "number" },
  platform_fit: { type: "number" },
  uniqueness: { type: "number" },
  cta_naturalness: { type: "number" },
  usefulness: { type: "number" },
  human_likeness: { type: "number" },
  tone_accuracy: { type: "number" },
  post_type_accuracy: { type: "number" }
};

const selfCheck = {
  type: "object",
  additionalProperties: false,
  properties: {
    ...scoreFields,
    total: { type: "number" },
    passed: { type: "boolean" },
    reason: { type: "string" }
  },
  required: [...Object.keys(scoreFields), "total", "passed", "reason"]
};

const beforeAfter = {
  type: "object",
  additionalProperties: false,
  properties: {
    before_pattern: { type: "string" },
    after_strategy: { type: "string" },
    improved_points: { type: "array", items: { type: "string" } }
  },
  required: ["before_pattern", "after_strategy", "improved_points"]
};

const postItem = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    hook: { type: "string" },
    body: { type: "string" },
    body_parts: { type: "array", items: { type: "string" } },
    concrete_scene: { type: "string" },
    reader_emotion: { type: "string" },
    aim: { type: "string" },
    target: { type: "string" },
    role: { type: "string" },
    transition: { type: "string" },
    emotional_role: { type: "string" },
    recommended_time: { type: "string" },
    cta: { type: "string" },
    cta_type: { type: "string" },
    improvement: { type: "string" },
    platform_note: { type: "string" },
    tone_applied: { type: "string" },
    post_type_applied: { type: "string" },
    selection_match_score: { type: "number" },
    uniqueness_score: { type: "number" },
    caution_flags: { type: "array", items: { type: "string" } },
    self_check: selfCheck,
    quality_score: { type: "number" }
  },
  required: [
    "title", "hook", "body", "body_parts", "concrete_scene", "reader_emotion",
    "aim", "target", "role", "transition", "emotional_role", "recommended_time",
    "cta", "cta_type", "improvement", "platform_note",
    "tone_applied", "post_type_applied", "selection_match_score", "uniqueness_score",
    "caution_flags", "self_check", "quality_score"
  ]
};

export function outputSchema(feature) {
  if (feature === "day-generate") return oneDaySchema();
  if (feature === "rewrite") return brushupSchema();
  if (feature === "cta") return ctaSchema();
  if (feature === "viral") return viralScoreSchema();
  if (feature === "ab-test") return abCompareSchema();
  return aiPostSchema();
}

// Shared 0-100 sub-score block for diagnosis features.
const diagnosisScoreBlock = {
  type: "object",
  additionalProperties: false,
  properties: {
    clarity: { type: "number" },
    hook: { type: "number" },
    empathy: { type: "number" },
    concreteness: { type: "number" },
    readability: { type: "number" },
    cta_naturalness: { type: "number" }
  },
  required: ["clarity", "hook", "empathy", "concreteness", "readability", "cta_naturalness"]
};

function viralScoreSchema() {
  return {
    name: "sns_mnm_viral_score_v1",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        overall_score: { type: "number" },
        summary: { type: "string" },
        scores: diagnosisScoreBlock,
        strengths: { type: "array", items: { type: "string" } },
        weaknesses: { type: "array", items: { type: "string" } },
        improvements: { type: "array", items: { type: "string" } },
        risk_flags: { type: "array", items: { type: "string" } },
        improved_post: { type: "string" }
      },
      required: [
        "overall_score", "summary", "scores", "strengths",
        "weaknesses", "improvements", "risk_flags", "improved_post"
      ]
    }
  };
}

function abCompareSchema() {
  return {
    name: "sns_mnm_ab_compare_v1",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        winner: { type: "string", enum: ["A", "B", "引き分け"] },
        summary: { type: "string" },
        reason: { type: "string" },
        a_overall: { type: "number" },
        b_overall: { type: "number" },
        a_scores: diagnosisScoreBlock,
        b_scores: diagnosisScoreBlock,
        a_strengths: { type: "array", items: { type: "string" } },
        a_weaknesses: { type: "array", items: { type: "string" } },
        b_strengths: { type: "array", items: { type: "string" } },
        b_weaknesses: { type: "array", items: { type: "string" } },
        improvements: { type: "array", items: { type: "string" } },
        recommended_post: { type: "string" }
      },
      required: [
        "winner", "summary", "reason", "a_overall", "b_overall",
        "a_scores", "b_scores", "a_strengths", "a_weaknesses",
        "b_strengths", "b_weaknesses", "improvements", "recommended_post"
      ]
    }
  };
}

function ctaSchema() {
  const ctaPostItem = {
    type: "object",
    additionalProperties: false,
    properties: {
      reader: { type: "string" },
      post_topic: { type: "string" },
      hook: { type: "string" },
      body: { type: "string" },
      concrete_scene: { type: "string" },
      reader_emotion: { type: "string" },
      question: { type: "string" },
      cta: { type: "string" },
      cta_type: { type: "string" },
      aim: { type: "string" },
      platform_note: { type: "string" },
      caution_flags: { type: "array", items: { type: "string" } },
      self_check: selfCheck,
      quality_score: { type: "number" }
    },
    required: [
      "reader", "post_topic", "hook", "body", "concrete_scene", "reader_emotion",
      "question", "cta", "cta_type", "aim", "platform_note",
      "caution_flags", "self_check", "quality_score"
    ]
  };
  return {
    name: "sns_mnm_cta_v1",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        posts: { type: "array", items: ctaPostItem },
        generation_notes: { type: "string" },
        overall_self_check: selfCheck
      },
      required: ["posts", "generation_notes", "overall_self_check"]
    }
  };
}

function aiPostSchema() {
  return {
    name: "sns_mnm_ai_posts_v2",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        posts: { type: "array", items: postItem },
        generation_notes: { type: "string" },
        before_after: beforeAfter,
        overall_self_check: selfCheck
      },
      required: ["posts", "generation_notes", "before_after", "overall_self_check"]
    }
  };
}

function oneDaySchema() {
  return {
    name: "sns_mnm_one_day_posts_v2",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        posts: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              slot: { type: "string", enum: ["朝投稿", "昼投稿", "夜投稿"] },
              role: { type: "string" },
              hook: { type: "string" },
              body: { type: "string" },
              body_parts: { type: "array", items: { type: "string" } },
              concrete_scene: { type: "string" },
              reader_emotion: { type: "string" },
              emotional_role: { type: "string" },
              aim: { type: "string" },
              recommended_time: { type: "string" },
              cta: { type: "string" },
              cta_type: { type: "string" },
              transition: { type: "string" },
              tone_applied: { type: "string" },
              post_type_applied: { type: "string" },
              uniqueness_score: { type: "number" },
              caution_flags: { type: "array", items: { type: "string" } },
              self_check: selfCheck,
              quality_score: { type: "number" }
            },
            required: [
              "slot", "role", "hook", "body", "body_parts", "concrete_scene",
              "reader_emotion", "emotional_role", "aim", "recommended_time",
              "cta", "cta_type", "transition", "tone_applied", "post_type_applied",
              "uniqueness_score", "caution_flags", "self_check", "quality_score"
            ]
          }
        },
        generation_notes: { type: "string" },
        before_after: beforeAfter,
        overall_self_check: selfCheck
      },
      required: ["posts", "generation_notes", "before_after", "overall_self_check"]
    }
  };
}

function brushupSchema() {
  return {
    name: "sns_mnm_brushup_v2",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        rewritten_post: { type: "string" },
        hook: { type: "string" },
        body_parts: { type: "array", items: { type: "string" } },
        change_points: { type: "array", items: { type: "string" } },
        differences: { type: "string" },
        recommended_use: { type: "string" },
        concrete_scene_added: { type: "string" },
        reader_emotion_added: { type: "string" },
        cta: { type: "string" },
        cta_type: { type: "string" },
        tone_applied: { type: "string" },
        post_type_applied: { type: "string" },
        caution_flags: { type: "array", items: { type: "string" } },
        before_after: beforeAfter,
        self_check: selfCheck,
        quality_score: { type: "number" }
      },
      required: [
        "rewritten_post", "hook", "body_parts", "change_points", "differences",
        "recommended_use", "concrete_scene_added", "reader_emotion_added",
        "cta", "cta_type", "tone_applied", "post_type_applied", "caution_flags",
        "before_after", "self_check", "quality_score"
      ]
    }
  };
}
