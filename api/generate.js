const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "کلید سرویس هوش مصنوعی هنوز روی سرور تنظیم نشده است." });

  const idea = typeof req.body?.idea === "string" ? req.body.idea.trim() : "";
  if (idea.length < 12 || idea.length > 700) {
    return res.status(400).json({ error: "توضیح لوگو باید بین ۱۲ تا ۷۰۰ کاراکتر باشد." });
  }

  const prompt = [
    "Create one original, professional, polished brand logo based on this brief:",
    idea,
    "Design requirements: make it a clean, distinctive logo suitable for real-world branding; strong readable silhouette; intentional typography only when brand text is specified; balanced composition; crisp edges; centered on a plain, uncluttered background; no mockup, no watermark, no presentation board, no extra captions. Return only the logo artwork."
  ].join("\n\n");

  try {
    const upstream = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024",
        quality: "medium"
      })
    });

    const payload = await upstream.json();
    if (!upstream.ok) {
      const message = payload?.error?.message || "سرویس تولید تصویر پاسخ موفق نداد.";
      return res.status(upstream.status >= 500 ? 502 : upstream.status).json({ error: message });
    }

    const encoded = payload?.data?.[0]?.b64_json;
    if (!encoded) return res.status(502).json({ error: "تصویر معتبری از سرویس دریافت نشد." });
    return res.status(200).json({ image: "data:image/png;base64," + encoded });
  } catch (error) {
    return res.status(500).json({ error: "ارتباط با سرویس تولید تصویر برقرار نشد." });
  }
};