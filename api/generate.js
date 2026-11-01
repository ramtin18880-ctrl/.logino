const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const SUPABASE_URL = "https://bwkydygqqdsnkdiopnxy.supabase.co";
const SUPABASE_KEY = "sb_publishable_oCpdBTrwqom3mb0AO-0tkA_wAC0ys2d";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authorization = req.headers.authorization || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) {
    return res.status(401).json({ error: "برای ساخت لوگو ابتدا وارد حساب LOGINO شو." });
  }

  if (!ACCOUNT_ID || !API_TOKEN) {
    return res.status(503).json({
      error: "اتصال Cloudflare هنوز تنظیم نشده است. متغیرهای CLOUDFLARE_ACCOUNT_ID و CLOUDFLARE_API_TOKEN را در تنظیمات Vercel ثبت کنید."
    });
  }

  const idea = typeof req.body?.idea === "string" ? req.body.idea.trim() : "";
  if (idea.length < 12 || idea.length > 700) {
    return res.status(400).json({
      error: "توضیح لوگو باید بین ۱۲ تا ۷۰۰ کاراکتر باشد."
    });
  }

  let quotaResult;
  try {
    const userResponse = await fetch(SUPABASE_URL + "/auth/v1/user", {
      headers: { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + accessToken }
    });
    if (!userResponse.ok) {
      return res.status(401).json({ error: "نشست حساب معتبر نیست؛ دوباره وارد شو." });
    }
    const rpcResponse = await fetch(SUPABASE_URL + "/rest/v1/rpc/consume_free_generation", {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + accessToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ p_prompt: idea })
    });
    quotaResult = await rpcResponse.json().catch(() => null);
    if (!rpcResponse.ok) {
      return res.status(503).json({
        error: "بررسی سهمیه در Supabase انجام نشد. وجود تابع consume_free_generation و دسترسی آن را بررسی کن."
      });
    }
    if (Array.isArray(quotaResult)) quotaResult = quotaResult[0];
    if (!quotaResult || quotaResult.allowed !== true) {
      return res.status(429).json({
        error: quotaResult?.message || "سهمیه رایگان این حساب تمام شده است؛ پس از ۴۸ ساعت دوباره شارژ می‌شود.",
        remaining: quotaResult?.remaining ?? 0
      });
    }
  } catch (error) {
    return res.status(503).json({ error: "ارتباط با سامانه سهمیه LOGINO برقرار نشد." });
  }

  const prompt = [
    "Create one original, professional brand logo based on this brief:",
    idea,
    "Create ONLY the graphic symbol / icon for the brand. Absolutely NO text, NO letters, NO words, NO numbers, NO typography, NO pseudo-writing, NO watermark. The website will add the exact brand name separately. Make a premium, distinctive, memorable logo mark with professional vector-logo art direction, strong simple geometry, precise clean edges, balanced negative space, polished details, centered composition, and a restrained sophisticated palette derived from the brief. Show one logo symbol only, not a mockup, not a poster, not a presentation board. Avoid generic clip-art, stock-logo appearance, random decorative shapes, and busy backgrounds."
  ].join("\n\n");

  try {
    const endpoint = "https://api.cloudflare.com/client/v4/accounts/"
      + encodeURIComponent(ACCOUNT_ID)
      + "/ai/run/" + IMAGE_MODEL;

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + API_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompt, steps: 4 })
    });

    const payload = await upstream.json().catch(() => null);

    if (!upstream.ok || payload?.success === false) {
      const apiMessage = Array.isArray(payload?.errors)
        ? payload.errors.map(item => item.message).filter(Boolean).join(" ")
        : "";
      let message = "سرویس Cloudflare نتوانست تصویر را تولید کند.";
      if (upstream.status === 401) {
        message = "توکن Cloudflare معتبر نیست یا منقضی شده است.";
      } else if (upstream.status === 403) {
        message = "توکن Cloudflare مجوز Workers AI ندارد یا دسترسی این مدل محدود است.";
      } else if (upstream.status === 429) {
        message = "محدودیت درخواست Cloudflare پر شده است؛ بعداً دوباره تلاش کنید.";
      } else if (upstream.status === 400 && apiMessage) {
        message = "درخواست تولید تصویر پذیرفته نشد: " + apiMessage.slice(0, 220);
      } else if (apiMessage) {
        message += " " + apiMessage.slice(0, 220);
      }
      const status = [400, 401, 403, 429].includes(upstream.status)
        ? upstream.status
        : 502;
      return res.status(status).json({ error: message });
    }

    const image = payload?.result?.image;
    if (typeof image !== "string" || !image.length) {
      return res.status(502).json({
        error: "Cloudflare پاسخ داد، اما داده تصویر معتبر دریافت نشد."
      });
    }

    return res.status(200).json({
      image: "data:image/jpeg;base64," + image
    });
  } catch (error) {
    return res.status(502).json({
      error: "ارتباط با Cloudflare برقرار نشد. لطفاً کمی بعد دوباره تلاش کنید."
    });
  }
};
