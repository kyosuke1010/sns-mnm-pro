import { decryptString, encryptString, last4 } from "./security.js";

export const OPENAI_MODEL_MODES = {
  low_cost: {
    label: "低コスト",
    model: "gpt-5.5",
    reasoning: "low",
    verbosity: "low"
  },
  standard: {
    label: "標準",
    model: "gpt-5.5",
    reasoning: "medium",
    verbosity: "medium"
  },
  high_quality: {
    label: "高品質",
    model: "gpt-5.5",
    reasoning: "high",
    verbosity: "medium"
  }
};

export function normalizeModelMode(value) {
  const text = String(value || "").trim();
  if (["low_cost", "standard", "high_quality"].includes(text)) return text;
  if (text.includes("低")) return "low_cost";
  if (text.includes("高")) return "high_quality";
  return "standard";
}

export function modelConfig(mode, env = {}) {
  const normalized = normalizeModelMode(mode);
  const defaults = OPENAI_MODEL_MODES[normalized] || OPENAI_MODEL_MODES.standard;
  const envOverride = {
    low_cost: env.OPENAI_MODEL_LOW_COST,
    standard: env.OPENAI_MODEL_STANDARD,
    high_quality: env.OPENAI_MODEL_HIGH_QUALITY
  }[normalized];
  return { ...defaults, mode: normalized, model: envOverride || defaults.model };
}

export async function saveOpenAiSettings(env, userId, apiKey, modelMode, profile = null) {
  requireOpenAiBindings(env);
  const now = new Date().toISOString();
  const existing = await env.DB.prepare("SELECT id, openai_key_encrypted, openai_key_last4 FROM ai_settings WHERE user_id = ? LIMIT 1")
    .bind(userId)
    .first();
  const cleanKey = String(apiKey || "").trim();
  const encryptedKey = cleanKey
    ? await encryptString(cleanKey, env.OPENAI_ENCRYPTION_KEY)
    : existing?.openai_key_encrypted || null;
  const keyLast4 = cleanKey ? last4(cleanKey) : existing?.openai_key_last4 || null;
  const normalizedMode = normalizeModelMode(modelMode);
  const encryptedProfile = profile
    ? await encryptString(JSON.stringify(profile), env.OPENAI_ENCRYPTION_KEY)
    : null;

  if (existing) {
    await env.DB.prepare(`
      UPDATE ai_settings
      SET openai_key_encrypted = ?, openai_key_last4 = ?, model_mode = ?,
          profile_json_encrypted = COALESCE(?, profile_json_encrypted),
          updated_at = ?
      WHERE user_id = ?
    `).bind(encryptedKey, keyLast4, normalizedMode, encryptedProfile, now, userId).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO ai_settings (
        id, user_id, openai_key_encrypted, openai_key_last4, model_mode,
        profile_json_encrypted, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), userId, encryptedKey, keyLast4, normalizedMode, encryptedProfile, now, now).run();
  }

  return { configured: Boolean(encryptedKey), keyLast4, modelMode: normalizedMode };
}

export async function getOpenAiSettings(env, userId, { includeKey = false, includeProfile = false } = {}) {
  requireOpenAiBindings(env);
  const row = await env.DB.prepare(`
    SELECT openai_key_encrypted, openai_key_last4, model_mode, profile_json_encrypted
    FROM ai_settings WHERE user_id = ? LIMIT 1
  `).bind(userId).first();
  if (!row) return { configured: false, modelMode: "standard", keyLast4: null, apiKey: null, profile: null };

  let apiKey = null;
  let profile = null;
  if (includeKey && row.openai_key_encrypted) {
    apiKey = await decryptString(row.openai_key_encrypted, env.OPENAI_ENCRYPTION_KEY);
  }
  if (includeProfile && row.profile_json_encrypted) {
    try {
      profile = JSON.parse(await decryptString(row.profile_json_encrypted, env.OPENAI_ENCRYPTION_KEY));
    } catch {
      profile = null;
    }
  }

  return {
    configured: Boolean(row.openai_key_encrypted),
    keyLast4: row.openai_key_last4 || null,
    modelMode: normalizeModelMode(row.model_mode),
    apiKey,
    profile
  };
}

export async function callOpenAiResponses({ apiKey, model, reasoning, verbosity, input, schema, maxOutputTokens = 2200 }) {
  const payload = {
    model,
    input,
    reasoning: { effort: reasoning || "medium" },
    max_output_tokens: maxOutputTokens,
    store: false
  };
  payload.text = { verbosity: verbosity || "medium" };
  if (schema) {
    payload.text = {
      ...payload.text,
      format: {
        type: "json_schema",
        name: schema.name,
        schema: schema.schema,
        strict: true
      }
    };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const rawText = await response.text();
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    throw new OpenAiSafeError("OPENAI_JSON_PARSE_FAILED", "OpenAI response JSON parse failed", response.status);
  }

  if (!response.ok) {
    throw classifyOpenAiError(response.status, data);
  }

  if (data?.status === "incomplete") {
    throw new OpenAiSafeError("OPENAI_OUTPUT_INCOMPLETE", "OpenAI output was incomplete. Please try with fewer posts or retry.", 502);
  }

  return { data, text: extractResponseText(data) };
}

export function extractResponseText(data) {
  if (!data) return "";
  if (typeof data.output_text === "string") return data.output_text;
  const chunks = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.refusal === "string") {
        throw new OpenAiSafeError("OPENAI_REFUSAL", "OpenAI could not generate this request. Please adjust the input.", 400);
      }
      if (typeof content.text === "string") chunks.push(content.text);
      if (typeof content.output_text === "string") chunks.push(content.output_text);
    }
  }
  return chunks.join("\n").trim();
}

export function parseJsonOutput(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (!match) throw new OpenAiSafeError("AI_JSON_PARSE_FAILED", "AI output JSON parse failed", 502);
    try {
      return JSON.parse(match[0]);
    } catch {
      throw new OpenAiSafeError("AI_JSON_PARSE_FAILED", "AI output JSON parse failed", 502);
    }
  }
}

export class OpenAiSafeError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.name = "OpenAiSafeError";
    this.code = code;
    this.status = status;
  }
}

export function openAiErrorResponse(error) {
  const authStatus = Number(error?.status);
  if (authStatus === 401 || authStatus === 403) {
    return Response.json({ ok: false, error_code: "AUTH_REQUIRED", message: "Login required" }, { status: authStatus });
  }
  const safe = error instanceof OpenAiSafeError
    ? error
    : new OpenAiSafeError("OPENAI_REQUEST_FAILED", "生成に失敗しました。APIキー設定、利用上限、または生成形式に問題がある可能性があります。", 500);
  return Response.json({ ok: false, error_code: safe.code, message: safe.message }, { status: safe.status });
}

function classifyOpenAiError(status, data) {
  const type = data?.error?.type || "";
  const code = data?.error?.code || "";
  if (status === 401 || status === 403) {
    return new OpenAiSafeError("OPENAI_API_KEY_INVALID", "OpenAI API接続に失敗しました。APIキーと権限を確認してください。", status);
  }
  if (status === 429 || type.includes("rate") || String(code).includes("quota")) {
    return new OpenAiSafeError("OPENAI_QUOTA_OR_RATE_LIMIT", "OpenAIの利用上限、残高、またはレート制限に達している可能性があります。", status);
  }
  if (status >= 500) {
    return new OpenAiSafeError("OPENAI_UPSTREAM_ERROR", "OpenAI側で一時的なエラーが発生しました。時間をおいて再度お試しください。", status);
  }
  const message = String(data?.error?.message || "");
  if (status === 400 && /schema|json_schema|response_format|strict/i.test(message)) {
    return new OpenAiSafeError("OPENAI_SCHEMA_INVALID", "生成結果の形式指定に問題があります。画面を更新して再度お試しください。", status);
  }
  if (status === 400) {
    return new OpenAiSafeError("OPENAI_INVALID_REQUEST", "生成リクエストの形式に問題があります。入力内容を短くするか、生成数を減らして再度お試しください。", status);
  }
  return new OpenAiSafeError("OPENAI_REQUEST_FAILED", "生成に失敗しました。APIキー設定、利用上限、または生成形式に問題がある可能性があります。", status || 500);
}

function requireOpenAiBindings(env) {
  if (!env.DB) throw new OpenAiSafeError("DB_BINDING_MISSING", "D1 binding is not configured", 500);
  if (!env.OPENAI_ENCRYPTION_KEY) throw new OpenAiSafeError("OPENAI_ENCRYPTION_KEY_MISSING", "OpenAI encryption key is not configured", 500);
}
