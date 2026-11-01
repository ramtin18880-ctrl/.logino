const SUPABASE_URL = "https://bwkydygqqdsnkdiopnxy.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ZARINPAL_MERCHANT_ID = process.env.ZARINPAL_MERCHANT_ID;
const SITE_URL = process.env.SITE_URL || "https://logino-omega.vercel.app";
const SANDBOX = process.env.ZARINPAL_SANDBOX === "true";
const VERIFY_URL = SANDBOX
  ? "https://sandbox.zarinpal.com/pg/v4/payment/verify.json"
  : "https://api.zarinpal.com/pg/v4/payment/verify.json";

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");
  const base = SITE_URL.replace(/\/$/, "");
  if (!SUPABASE_SERVICE_ROLE_KEY || !ZARINPAL_MERCHANT_ID) {
    return res.redirect(302, base + "/?payment=setup_error");
  }
  const orderId = typeof req.query.order === "string" ? req.query.order : "";
  const authority = typeof req.query.Authority === "string" ? req.query.Authority : "";
  const status = typeof req.query.Status === "string" ? req.query.Status : "";
  if (!orderId || !authority || status !== "OK") {
    return res.redirect(302, base + "/?payment=cancelled");
  }

  try {
    const orderResponse = await fetch(
      SUPABASE_URL + "/rest/v1/payment_orders?id=eq." + encodeURIComponent(orderId) +
      "&authority=eq." + encodeURIComponent(authority) + "&select=id,user_id,plan,amount_toman,status,expires_at",
      { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY } }
    );
    const orders = await orderResponse.json().catch(() => []);
    const order = orders[0];
    if (!order) return res.redirect(302, base + "/?payment=not_found");
    if (order.status === "paid") return res.redirect(302, base + "/?payment=success");
    if (order.status !== "pending" || (order.expires_at && Date.parse(order.expires_at) < Date.now())) {
      return res.redirect(302, base + "/?payment=expired");
    }

    const verification = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        merchant_id: ZARINPAL_MERCHANT_ID,
        amount: Number(order.amount_toman) * 10,
        authority
      })
    });
    const result = await verification.json().catch(() => ({}));
    if (!verification.ok || result?.data?.code !== 100) {
      await fetch(SUPABASE_URL + "/rest/v1/payment_orders?id=eq." + encodeURIComponent(order.id) + "&status=eq.pending", {
        method: "PATCH",
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "failed" })
      });
      return res.redirect(302, base + "/?payment=failed");
    }

    const activation = await fetch(SUPABASE_URL + "/rest/v1/rpc/activate_subscription_from_payment", {
      method: "POST",
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p_authority: authority, p_ref_id: String(result.data.ref_id || "") })
    });
    const activated = await activation.json().catch(() => false);
    if (!activation.ok || activated !== true) {
      return res.redirect(302, base + "/?payment=activation_error");
    }
    return res.redirect(302, base + "/?payment=success");
  } catch (error) {
    return res.redirect(302, base + "/?payment=verify_error");
  }
};