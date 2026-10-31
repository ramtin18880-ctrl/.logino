const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const IMAGE_MODEL = "black-forest-labs/flux.1-schnell";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.POLLINATIONS_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "کلید Pollinations هنوز در تنظیمات سرور ثبت نشده است. متغیر POLLINATIONS_API_KEY را تنظیم کنید."
    });
  }

  const idea = typeof req.body?.idea === "string" ? req.body.idea.trim() : "";
  if (idea.length < 12 || idea.length > 700) {
    return res.status(400).json({
      error: "توضیح لوگو باید بین ۱۲ تا ۷۰۰ کاراکتر باشد."
    });
  }

  const prompt = [
    "Create one original, professional brand logo based on this brief:",
    idea,
    "Logo design only. Clean distinctive vector-like silhouette, balanced composition, crisp edges, centered on a plain uncluttered background. Use readable typography only if the brief specifies brand text. No mockup, no watermark, no presentation board, no extra captions."
  ].join("\n\n");

  try {
    const url = new URL("https://gen.pollinations.ai/image/" + encodeURIComponent(prompt));
    url.searchParams.set("model", IMAGE_MODEL);
    url.searchParams.set("width", "1024");
    url.searchParams.set("height", "1024");
    url.searchParams.set("nologo", "true");

    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Accept": "image/*"
      }
    });

    if (!upstream.ok) {
      const details = await upstream.text().catch(() => "");
      let message = "سرویس FLUX نتوانست تصویر را تولید کند.";
      if (upstream.status === 401) message = "کلید Pollinations معتبر نیست.";
      else if (upstream.status === 402) message = "اعتبار حساب Pollinations کافی نیست.";
      else if (upstream.status === 429) message = "درخواست‌ها زیاد شده‌اند؛ کمی بعد دوباره تلاش کنید.";
      else if (details) message += " " + details.slice(0, 240);
      return res.status(upstream.status === 401 || upstream.status === 402 || upstream.status === 429 ? upstream.status : 502)
        .json({ error: message });
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return res.status(502).json({ error: "پاسخ سرویس، فایل تصویر معتبر نبود." });
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (!bytes.length) {
      return res.status(502).json({ error: "تصویر خالی از سرویس دریافت شد." });
    }

    return res.status(200).json({
      image: "data:" + contentType + ";base64," + bytes.toString("base64")
    });
  } catch (error) {
    return res.status(502).json({
      error: "ارتباط با سرویس تولید تصویر برقرار نشد. لطفاً دوباره تلاش کنید."
    });
  }
};
