const SUPABASE_URL = "https://bwkydygqqdsnkdiopnxy.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_oCpdBTrwqom3mb0AO-0tkA_wAC0ys2d";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ZARINPAL_MERCHANT_ID = process.env.ZARINPAL_MERCHANT_ID;
const SITE_URL = process.env.SITE_URL || "https://logino-omega.vercel.app";
const SANDBOX = process.env.ZARINPAL_SANDBOX === "true";
const REQUEST_URL = SANDBOX
  ? "https://sandbox.zarinpal.com/pg/v4/payment/request.json"
  : "https://api.zarinpal.com/pg/v4/payment/request.json";
const START_PAY = SANDBOX
  ? "https://sandbox.zarinpal.com/pg/StartPay/"
  : "https://www.zarinpal.com/pg/StartPay/";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!SUPABASE_SERVICE_ROLE_KEY || !ZARINPAL_MERCHANT_ID) {
    return res.status(503).json({ error: "تنظیمات امن درگاه در Vercel کامل نشده است." });
  }
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "ابتدا وارد حساب LOGINO شو." });

  try {
    const userResponse = await fetch(SUPABASE_URL + "/auth/v1/user", {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + token }
    });
    if (!userResponse.ok) return res.status(401).json({ error: "نشست کاربری معتبر نیست؛ دوباره وارد شو." });
    const user = await userResponse.json();

    const plan = req.body && req.body.plan;
    const prices = { monthly: 150000, yearly: 1000000 };
    if (!Object.prototype.hasOwnProperty.call(prices, plan)) {
      return res.status(400).json({ error: "پلن انتخاب‌شده معتبر نیست." });
    }
    const amountToman = prices[plan];
    const amountRial = amountToman * 10;
    const orderResponse = await fetch(SUPABASE_URL + "/rest/v1/payment_orders", {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify([{
        user_id: user.id,
        plan,
        amount_toman: amountToman,
        status: "pending",
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString()
      }])
    });
    const orders = await orderResponse.json().catch(() => []);
    if (!orderResponse.ok || !orders[0]) {
      return res.status(502).json({ error: "ثبت سفارش پرداخت در پایگاه داده انجام نشد." });
    }
    const order = orders[0];
    const callback = SITE_URL.replace(/\/$/, "") + "/api/payment/verify?order=" + encodeURIComponent(order.id);
    const paymentResponse = await fetch(REQUEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        merchant_id: ZARINPAL_MERCHANT_ID,
        amount: amountRial,
        callback_url: callback,
        description: plan === "yearly" ? "اشتراک سالانه LOGINO" : "اشتراک ماهانه LOGINO",
        metadata: { mobile: user.phone || undefined, email: user.email || undefined }
      })
    });
    const payment = await paymentResponse.json().catch(() => ({}));
    const authority = payment?.data?.authority;
    if (!paymentResponse.ok || payment?.data?.code !== 100 || !authority) {
      await fetch(SUPABASE_URL + "/rest/v1/payment_orders?id=eq." + encodeURIComponent(order.id), {
        method: "PATCH",
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "failed" })
      });
      return res.status(502).json({ error: "زرین‌پال درخواست پرداخت را نپذیرفت. تنظیمات پذیرنده را بررسی کن." });
    }
    const saveAuthority = await fetch(SUPABASE_URL + "/rest/v1/payment_orders?id=eq." + encodeURIComponent(order.id), {
      method: "PATCH",
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ authority })
    });
    if (!saveAuthority.ok) return res.status(502).json({ error: "ذخیره شناسه پرداخت ناموفق بود؛ با پشتیبانی تماس بگیر." });
    return res.status(200).json({ url: START_PAY + encodeURIComponent(authority) });
  } catch (error) {
    return res.status(502).json({ error: "ارتباط امن با درگاه پرداخت برقرار نشد." });
  }
};