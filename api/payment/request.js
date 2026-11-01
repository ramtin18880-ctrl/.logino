const SUPABASE_URL = "https://bwkydygqqdsnkdiopnxy.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_oCpdBTrwqom3mb0AO-0tkA_wAC0ys2d";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PAYPING_TOKEN = process.env.PAYPING_TOKEN;
const SITE_URL = (process.env.SITE_URL || "https://logino-omega.vercel.app").replace(/\\/$/, "");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!SUPABASE_SERVICE_ROLE_KEY || !PAYPING_TOKEN) {
    return res.status(503).json({ error: "تنظیمات امن پی‌پینگ در Vercel کامل نشده است." });
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
    const callback = SITE_URL + "/api/payment/verify?order=" + encodeURIComponent(order.id);
    const paymentResponse = await fetch("https://api.payping.ir/v3/pay", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + PAYPING_TOKEN,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        PayerName: user.user_metadata?.display_name || user.user_metadata?.name || "LOGINO User",
        Amount: amountToman,
        PayerIdentity: user.email || user.phone || String(user.id),
        ReturnUrl: callback,
        Description: plan === "yearly" ? "اشتراک سالانه LOGINO" : "اشتراک ماهانه LOGINO",
        ClientRefId: String(order.id)
      })
    });

    const payment = await paymentResponse.json().catch(() => ({}));
    const paymentCode = payment.paymentCode || payment.PaymentCode || payment.code;
    if (!paymentResponse.ok || !paymentCode) {
      await fetch(SUPABASE_URL + "/rest/v1/payment_orders?id=eq." + encodeURIComponent(order.id), {
        method: "PATCH",
        headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "failed" })
      });
      return res.status(502).json({ error: "پی‌پینگ درخواست پرداخت را نپذیرفت؛ توکن و تنظیمات پذیرنده را بررسی کن." });
    }

    const saveCode = await fetch(SUPABASE_URL + "/rest/v1/payment_orders?id=eq." + encodeURIComponent(order.id), {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: "Bearer " + SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({ authority: String(paymentCode) })
    });
    if (!saveCode.ok) return res.status(502).json({ error: "ذخیره شناسه پرداخت پی‌پینگ ناموفق بود." });

    return res.status(200).json({ url: "https://api.payping.ir/v3/pay/start/" + encodeURIComponent(paymentCode) });
  } catch (error) {
    return res.status(502).json({ error: "ارتباط امن با پی‌پینگ برقرار نشد." });
  }
};
