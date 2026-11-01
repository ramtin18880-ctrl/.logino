const SUPABASE_URL = "https://bwkydygqqdsnkdiopnxy.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PAYPING_TOKEN = process.env.PAYPING_TOKEN;
const SITE_URL = (process.env.SITE_URL || "https://logino-omega.vercel.app").replace(/\/$/, "");

module.exports = async function handler(req, res) {
  const base = SITE_URL;
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).send("Method not allowed");
  if (!SUPABASE_SERVICE_ROLE_KEY || !PAYPING_TOKEN) return res.redirect(302, base + "/?payment=setup_error");

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const query = req.query || {};
  const pick = (...values) => values.find(v => (typeof v === "string" && v.trim()) || (typeof v === "number" && Number.isFinite(v)));
  const orderId = String(pick(query.order, body.clientRefId, body.ClientRefId) || "");
  const paymentCode = String(pick(body.paymentCode, body.PaymentCode, query.paymentCode, query.PaymentCode) || "");
  const paymentRefId = String(pick(body.paymentRefId, body.PaymentRefId, query.paymentRefId, query.PaymentRefId) || "");
  if (!orderId || !paymentCode || !paymentRefId) return res.redirect(302, base + "/?payment=cancelled");

  try {
    const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY };
    const lookup = await fetch(SUPABASE_URL + "/rest/v1/payment_orders?id=eq." + encodeURIComponent(orderId) + "&authority=eq." + encodeURIComponent(paymentCode) + "&select=id,user_id,plan,amount_toman,status,expires_at", { headers });
    if (!lookup.ok) return res.redirect(302, base + "/?payment=verify_error");
    const rows = await lookup.json();
    const order = rows[0];
    if (!order) return res.redirect(302, base + "/?payment=not_found");
    if (order.status === "paid") return res.redirect(302, base + "/?payment=success");
    if (order.status !== "pending" || (order.expires_at && Date.parse(order.expires_at) < Date.now())) return res.redirect(302, base + "/?payment=expired");

    const amount = Number(order.amount_toman);
    if (!Number.isSafeInteger(amount) || amount <= 0) return res.redirect(302, base + "/?payment=verify_error");
    const verify = await fetch("https://api.payping.ir/v3/pay/verify", {
      method: "POST",
      headers: { Authorization: "Bearer " + PAYPING_TOKEN, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ PaymentRefId: paymentRefId, PaymentCode: paymentCode, Amount: amount })
    });
    const result = await verify.json().catch(() => ({}));
    const confirmedCode = String(result.code || result.paymentCode || result.PaymentCode || "");
    const confirmedAmount = Number(result.amount ?? result.Amount);
    if (!verify.ok || confirmedCode !== paymentCode || confirmedAmount !== amount) return res.redirect(302, base + "/?payment=failed");

    const activation = await fetch(SUPABASE_URL + "/rest/v1/rpc/activate_subscription_from_payment", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ p_authority: paymentCode, p_ref_id: paymentRefId })
    });
    const activated = await activation.json().catch(() => false);
    if (!activation.ok || activated !== true) return res.redirect(302, base + "/?payment=activation_error");
    return res.redirect(302, base + "/?payment=success");
  } catch (_) {
    return res.redirect(302, base + "/?payment=verify_error");
  }
};
