# LOGINO

استودیوی فارسی ساخت لوگو با مدل تصویرساز **FLUX.1-schnell از Black Forest Labs** از طریق **Cloudflare Workers AI**.

## فایل‌ها
- `index.html`: رابط کاربری فارسی
- `api/generate.js`: مسیر امن سمت سرور برای تولید تصویر با Cloudflare Workers AI

## راه‌اندازی

1. پروژه را روی Vercel مستقر کنید؛ GitHub Pages به‌تنهایی فایل API را اجرا نمی‌کند.
2. در Cloudflare یک حساب بسازید و از بخش Workers AI، شناسه حساب (Account ID) را بردارید.
3. یک API Token با دسترسی Workers AI بسازید. برای اجرای مدل، Cloudflare مجوز Workers AI Read یا Workers AI Write را می‌پذیرد؛ فقط حداقل دسترسی لازم را انتخاب کنید.
4. در Vercel به Settings → Environment Variables بروید و این دو متغیر را برای Production و Preview/Development که استفاده می‌کنید اضافه کنید:
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_API_TOKEN`
5. ذخیره کنید و آخرین Deployment را Redeploy کنید.

**مهم:** مقدار API Token را در چت، کد سایت یا مخزن GitHub قرار ندهید. آن را فقط به‌عنوان Environment Variable محرمانه در Vercel ذخیره کنید. این پروژه دیگر به `POLLINATIONS_API_KEY` نیاز ندارد.

## سهمیه و هزینه

طبق صفحه رسمی قیمت‌گذاری Cloudflare که در ۱ اکتبر ۲۰۲۶ به‌روزرسانی شده، Workers AI در پلن رایگان روزانه ۱۰٬۰۰۰ Neurons دارد. این سهمیه در ساعت ۰۰:۰۰ UTC بازنشانی می‌شود؛ مصرف بیشتر از سهمیه رایگان در پلن رایگان متوقف می‌شود. هزینه و تعداد تصویر قابل تولید به مصرف Neurons مدل و درخواست‌ها بستگی دارد؛ تولید نامحدود یا تعداد ثابت تصویر تضمین نمی‌شود.

- مدل: `@cf/black-forest-labs/flux-1-schnell`
- مستندات مدل: https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/
- قیمت‌گذاری: https://developers.cloudflare.com/workers-ai/platform/pricing/

## محدودیت رابط

محدودیت ۲ تصویر در ۴۸ ساعت در رابط فعلی فقط در حافظه مرورگر همان دستگاه ذخیره می‌شود؛ این یک محدودیت نمایشی/آزمایشی است، نه سهمیه امن سمت سرور. برای محدودیت واقعی کاربران باید احراز هویت و ذخیره‌سازی سمت سرور اضافه شود.
