// 決済後プロビジョニングのローカル検証（外部認証情報なしで実行可能）。
//   実行: node test/billing.test.mjs
//
// env.DB を最小モックに差し替えて、provisionPaidUser / recordPurchase /
// cancelSubscription / トークン / メール組み立て の振る舞いを確認する。

import assert from "node:assert/strict";
import {
  BILLING_TRIAL_DAYS,
  buildWelcomeEmail,
  cancelSubscription,
  createPasswordSetToken,
  hashPasswordSetToken,
  isProPlan,
  passwordSetUrl,
  provisionPaidUser,
  recordPurchase,
  sendTransactionalEmail
} from "../functions/_lib/billing.js";

// --- 最小 D1 モック -----------------------------------------------------------
// billing.js が発行する具体的な SQL をシグネチャで判別して、配列ストアを操作する。
function createMockDB(seedUsers = []) {
  const users = seedUsers.map((u) => ({ ...u }));
  const purchases = [];

  function prepare(sql) {
    const norm = sql.replace(/\s+/g, " ").trim();
    let binds = [];
    const api = {
      bind(...args) {
        binds = args;
        return api;
      },
      async first() {
        if (norm.startsWith("SELECT * FROM users WHERE email")) {
          return users.find((u) => u.email === binds[0]) || null;
        }
        if (norm.startsWith("SELECT * FROM purchase_history WHERE transaction_id")) {
          return purchases.find((p) => p.transaction_id === binds[0]) || null;
        }
        throw new Error("Unhandled first() query: " + norm);
      },
      async run() {
        if (norm.startsWith("INSERT INTO users")) {
          const [
            id, email, display_name, password_hash, plan, plan_start_date,
            paypal_subscription_id, password_set_token_hash, password_set_expires_at,
            trial_started_at, trial_expires_at, trial_status, created_at, updated_at
          ] = binds;
          users.push({
            id, email, display_name, password_hash, role: "user", plan, status: "active",
            plan_start_date, plan_cancel_date: null, paypal_subscription_id,
            password_set_token_hash, password_set_expires_at,
            trial_started_at, trial_expires_at, trial_status, created_at, updated_at
          });
          return { success: true };
        }
        if (norm.startsWith("UPDATE users SET plan =")) {
          const [
            plan, plan_start_date, paypal_subscription_id, password_set_token_hash,
            password_set_expires_at, trial_started_at, trial_expires_at, trial_status,
            updated_at, id
          ] = binds;
          const u = users.find((x) => x.id === id);
          if (u) {
            u.plan = plan;
            u.status = "active";
            u.plan_start_date = u.plan_start_date || plan_start_date;
            u.plan_cancel_date = null;
            u.paypal_subscription_id = paypal_subscription_id;
            u.password_set_token_hash = password_set_token_hash;
            u.password_set_expires_at = password_set_expires_at;
            u.trial_started_at = u.trial_started_at || trial_started_at;
            u.trial_expires_at = trial_expires_at;
            u.trial_status = trial_status;
            u.updated_at = updated_at;
          }
          return { success: true };
        }
        if (norm.startsWith("UPDATE users SET plan_cancel_date")) {
          const [plan_cancel_date, updated_at, subscription_id] = binds;
          for (const u of users) {
            if (u.paypal_subscription_id === subscription_id) {
              u.plan_cancel_date = plan_cancel_date;
              u.updated_at = updated_at;
            }
          }
          return { success: true };
        }
        if (norm.startsWith("INSERT INTO purchase_history")) {
          const [
            id, user_id, email, plan_type, payment_method, amount_jpy,
            status, transaction_id, subscription_id, raw_event_type, created_at, updated_at
          ] = binds;
          if (transaction_id && purchases.some((p) => p.transaction_id === transaction_id)) {
            throw new Error("UNIQUE constraint failed: purchase_history.transaction_id");
          }
          purchases.push({
            id, user_id, email, plan_type, payment_method, amount_jpy,
            status, transaction_id, subscription_id, raw_event_type, created_at, updated_at
          });
          return { success: true };
        }
        throw new Error("Unhandled run() query: " + norm);
      }
    };
    return api;
  }

  return { DB: { prepare }, _users: users, _purchases: purchases };
}

const baseEnv = (mock) => ({ ...mock, APP_SECRET: "test-secret", APP_BASE_URL: "https://example.com" });

let passed = 0;
function ok(label) {
  passed += 1;
  console.log("  ✓ " + label);
}

// --- テスト本体 ---------------------------------------------------------------

async function testNewUserProvision() {
  const mock = createMockDB();
  const env = baseEnv(mock);
  const res = await provisionPaidUser(env, {
    email: "Buyer@Example.com",
    name: "紅茶 太郎",
    subscriptionId: "I-SUB123",
    transactionId: "TXN-1",
    amountJpy: 1980,
    paymentMethod: "paypal",
    rawEventType: "BILLING.SUBSCRIPTION.ACTIVATED"
  });

  assert.equal(res.ok, true);
  assert.equal(res.isNewUser, true);
  assert.ok(res.passwordSetToken, "should issue a password-set token");
  assert.equal(mock._users.length, 1);
  const u = mock._users[0];
  assert.equal(u.email, "buyer@example.com", "email normalized");
  assert.equal(u.plan, "lite");
  assert.equal(u.role, "user");
  assert.equal(u.status, "active");
  assert.equal(u.trial_status, "active");
  assert.ok(u.password_hash, "placeholder password hash set (NOT NULL)");
  assert.ok(u.password_set_token_hash, "token hash stored, not raw token");
  assert.notEqual(u.password_set_token_hash, res.passwordSetToken, "raw token not stored");
  assert.equal(u.paypal_subscription_id, "I-SUB123");

  // trial window ~ 7 days
  const span = new Date(u.trial_expires_at).getTime() - new Date(u.trial_started_at).getTime();
  assert.equal(Math.round(span / (24 * 3600 * 1000)), BILLING_TRIAL_DAYS);

  assert.equal(mock._purchases.length, 1);
  assert.equal(mock._purchases[0].transaction_id, "TXN-1");
  assert.equal(mock._purchases[0].status, "completed");
  ok("new buyer: user created (lite, 7-day trial), token hashed, purchase recorded");
}

async function testIdempotentTransaction() {
  const mock = createMockDB();
  const env = baseEnv(mock);
  const first = await provisionPaidUser(env, { email: "dup@example.com", transactionId: "TXN-DUP" });
  const second = await provisionPaidUser(env, { email: "dup@example.com", transactionId: "TXN-DUP" });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.alreadyProcessed, true, "second call recognized as duplicate");
  assert.equal(mock._users.length, 1, "no duplicate user");
  assert.equal(mock._purchases.length, 1, "no duplicate purchase");
  ok("same PayPal transaction processed only once (idempotent)");
}

async function testExistingUserUpgrade() {
  const mock = createMockDB([
    {
      id: "u-existing",
      email: "trial@example.com",
      display_name: "既存",
      password_hash: "pbkdf2-sha256:1:aa:bb",
      role: "user",
      plan: "trial",
      status: "active",
      trial_started_at: "2026-01-01T00:00:00.000Z"
    }
  ]);
  const env = baseEnv(mock);
  const res = await provisionPaidUser(env, {
    email: "trial@example.com",
    subscriptionId: "I-UP",
    transactionId: "TXN-UP"
  });

  assert.equal(res.ok, true);
  assert.equal(res.isNewUser, false);
  assert.equal(res.passwordSetToken, null, "existing user with password: no reset token");
  const u = mock._users[0];
  assert.equal(u.plan, "lite", "upgraded to lite");
  assert.equal(u.paypal_subscription_id, "I-UP");
  assert.equal(u.trial_started_at, "2026-01-01T00:00:00.000Z", "original trial start preserved (COALESCE)");
  ok("existing user upgraded to lite without resetting password");
}

async function testAdminUntouched() {
  const mock = createMockDB([
    {
      id: "admin-1",
      email: "admin@example.com",
      password_hash: "x",
      role: "admin",
      plan: "admin_full",
      status: "active"
    }
  ]);
  const env = baseEnv(mock);
  const res = await provisionPaidUser(env, {
    email: "admin@example.com",
    transactionId: "TXN-ADM"
  });
  assert.equal(res.ok, true);
  assert.equal(res.isAdmin, true);
  assert.equal(res.passwordSetToken, null);
  assert.equal(mock._users[0].plan, "admin_full", "admin plan not downgraded");
  assert.equal(mock._purchases.length, 1, "purchase still recorded for admin");
  ok("admin account never downgraded by a purchase event");
}

async function testInvalidEmail() {
  const mock = createMockDB();
  const env = baseEnv(mock);
  const res = await provisionPaidUser(env, { email: "not-an-email", transactionId: "TXN-BAD" });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "INVALID_EMAIL");
  assert.equal(mock._users.length, 0);
  ok("invalid email rejected, nothing written");
}

async function testTokenRoundTrip() {
  const env = baseEnv(createMockDB());
  const { token, tokenHash } = await createPasswordSetToken(env);
  const rehashed = await hashPasswordSetToken(env, token);
  assert.equal(rehashed, tokenHash, "presented token re-hashes to stored hash");
  const wrong = await hashPasswordSetToken(env, token + "x");
  assert.notEqual(wrong, tokenHash);
  assert.equal(passwordSetUrl(env, token), `https://example.com/set-password.html?token=${encodeURIComponent(token)}`);
  ok("password-set token hashes deterministically; URL built");
}

async function testRecordPurchaseIdempotent() {
  const mock = createMockDB();
  const env = baseEnv(mock);
  const a = await recordPurchase(env, { email: "p@example.com", transactionId: "T1", amountJpy: 1980 });
  const b = await recordPurchase(env, { email: "p@example.com", transactionId: "T1", amountJpy: 1980 });
  assert.equal(a.recorded, true);
  assert.equal(b.recorded, false);
  assert.equal(b.alreadyProcessed, true);
  assert.equal(mock._purchases.length, 1);
  ok("recordPurchase is idempotent on transaction_id");
}

async function testCancelSubscription() {
  const mock = createMockDB([
    { id: "c1", email: "c@example.com", password_hash: "x", role: "user", plan: "lite", status: "active", paypal_subscription_id: "I-CANCEL" }
  ]);
  const env = baseEnv(mock);
  const res = await cancelSubscription(env, { subscriptionId: "I-CANCEL", recordEvent: true, rawEventType: "BILLING.SUBSCRIPTION.CANCELLED" });
  assert.equal(res.ok, true);
  assert.ok(mock._users[0].plan_cancel_date, "cancel date set");
  ok("cancelSubscription marks plan_cancel_date");
}

async function testEmailNoop() {
  const env = baseEnv(createMockDB());
  const res = await sendTransactionalEmail(env, { to: "x@example.com", subject: "s", text: "t" });
  assert.equal(res.sent, false);
  assert.equal(res.skipped, true);
  assert.equal(res.reason, "EMAIL_NOT_CONFIGURED");
  ok("sendTransactionalEmail is a no-op when EMAIL_API_KEY/EMAIL_FROM unset");
}

function testWelcomeEmail() {
  const mail = buildWelcomeEmail({ name: "太郎", setPasswordUrl: "https://example.com/set-password.html?token=abc", planLabel: "Lite" });
  assert.ok(mail.subject.includes("SNS MNM-PRO"));
  assert.ok(mail.html.includes("https://example.com/set-password.html?token=abc"));
  assert.ok(mail.text.includes("7日間") || mail.text.includes(`${BILLING_TRIAL_DAYS}日`));
  ok("welcome email contains the set-password link");
}

function testPlanHelpers() {
  assert.equal(isProPlan("pro"), true);
  assert.equal(isProPlan("admin_full"), true);
  assert.equal(isProPlan("lite"), false);
  assert.equal(isProPlan("trial"), false);
  ok("isProPlan helper correct");
}

async function main() {
  console.log("billing.js provisioning tests");
  await testNewUserProvision();
  await testIdempotentTransaction();
  await testExistingUserUpgrade();
  await testAdminUntouched();
  await testInvalidEmail();
  await testTokenRoundTrip();
  await testRecordPurchaseIdempotent();
  await testCancelSubscription();
  await testEmailNoop();
  testWelcomeEmail();
  testPlanHelpers();
  console.log(`\nAll ${passed} checks passed.`);
}

main().catch((err) => {
  console.error("\nTEST FAILED:\n", err);
  process.exit(1);
});
