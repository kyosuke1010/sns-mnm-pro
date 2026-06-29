// PayPal サブスクリプションPlan 作成スクリプト（ローカル実行用・1回叩くだけ）
//
// 目的: SNS MNM-PRO Lite（月額 ¥1,980・7日間無料トライアル付き）の
//       Product と Plan を作成し、PAYPAL_PLAN_ID を表示する。
//
// 重要: Client ID / Secret はこのファイルに書かない。実行時に環境変数で渡す。
//       表示されるのは Product ID と Plan ID だけ（シークレットは出力しない）。
//
// 使い方（あなたのPCのターミナルで／Node 18+）:
//   PAYPAL_CLIENT_ID=xxxx \
//   PAYPAL_CLIENT_SECRET=yyyy \
//   PAYPAL_ENV=sandbox \
//   node scripts/paypal-create-plan.mjs
//
//   → 最後に表示される PAYPAL_PLAN_ID を Cloudflare の環境変数に登録する。
//
// 本番(Live)用に作り直すときは PAYPAL_ENV=live にして同じコマンドを実行。

const CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const ENV = (process.env.PAYPAL_ENV || "sandbox").toLowerCase();
const PRICE_JPY = process.env.PAYPAL_PRICE_JPY || "1980"; // JPY は小数なし
const TRIAL_DAYS = process.env.PAYPAL_TRIAL_DAYS || "7";

const BASE = ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

function die(msg, extra) {
  console.error("\n❌ " + msg);
  if (extra) console.error(typeof extra === "string" ? extra : JSON.stringify(extra, null, 2));
  process.exit(1);
}

if (!CLIENT_ID || !CLIENT_SECRET) {
  die("PAYPAL_CLIENT_ID と PAYPAL_CLIENT_SECRET を環境変数で渡してください。");
}

async function getAccessToken() {
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) die(`アクセストークン取得に失敗 (${res.status}). Client ID/Secret と Sandbox/Live の組み合わせを確認してください。`, data);
  return data.access_token;
}

async function createProduct(token) {
  const res = await fetch(`${BASE}/v1/catalogs/products`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `snsmnm-product-${Date.now()}`
    },
    body: JSON.stringify({
      name: "SNS MNM-PRO",
      description: "AI×Threads運用支援ツール",
      type: "SERVICE",
      category: "SOFTWARE"
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) die(`Product 作成に失敗 (${res.status})`, data);
  return data.id;
}

async function createPlan(token, productId) {
  const res = await fetch(`${BASE}/v1/billing/plans`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `snsmnm-plan-${Date.now()}`
    },
    body: JSON.stringify({
      product_id: productId,
      name: "SNS MNM-PRO Lite",
      description: `Lite プラン 月額 ¥${PRICE_JPY}（${TRIAL_DAYS}日間無料トライアル付き）`,
      status: "ACTIVE",
      billing_cycles: [
        {
          frequency: { interval_unit: "DAY", interval_count: Number(TRIAL_DAYS) },
          tenure_type: "TRIAL",
          sequence: 1,
          total_cycles: 1,
          pricing_scheme: { fixed_price: { value: "0", currency_code: "JPY" } }
        },
        {
          frequency: { interval_unit: "MONTH", interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 2,
          total_cycles: 0, // 0 = 無期限で毎月課金
          pricing_scheme: { fixed_price: { value: String(PRICE_JPY), currency_code: "JPY" } }
        }
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee: { value: "0", currency_code: "JPY" },
        setup_fee_failure_action: "CONTINUE",
        payment_failure_threshold: 3
      }
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) die(`Plan 作成に失敗 (${res.status})`, data);
  return data.id;
}

(async () => {
  console.log(`\nPayPal Plan 作成を開始します（環境: ${ENV} / 価格: ¥${PRICE_JPY} / トライアル: ${TRIAL_DAYS}日）`);
  const token = await getAccessToken();
  console.log("✓ アクセストークン取得");
  const productId = await createProduct(token);
  console.log("✓ Product 作成: " + productId);
  const planId = await createPlan(token, productId);
  console.log("✓ Plan 作成: " + planId);

  console.log("\n========================================");
  console.log("完了！ Cloudflare に次の環境変数を登録してください：");
  console.log(`  PAYPAL_PLAN_ID = ${planId}`);
  console.log("（PAYPAL_PRODUCT_ID は任意・控え用: " + productId + "）");
  console.log("========================================\n");
})();
