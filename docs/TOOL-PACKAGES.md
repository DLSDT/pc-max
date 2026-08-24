# وضعیت سه صفحهٔ ابزار

بررسی‌شده روی production در ۲۰۲۶-۰۸-۲۴. **هر سه صفحه ناقص‌اند** و دلیلش در دو
تای اول «فایل نداریم» نیست — فایل‌ها هستند، ولی با **برچسب اشتباه** آپلود
شده‌اند.

---

## چطور این صفحه‌ها کار می‌کنند

هر صفحهٔ ابزار چند «محور» (axis) دارد و هر محور یک `component` را از مانیفست
بسته می‌خواند. انتخاب‌های داخل هر محور از `variant` فایل‌ها می‌آیند.

یعنی یک فایل با `component` اشتباه، **نامرئی** است — نه خطا می‌دهد، نه لاگ
می‌کند؛ فقط در آن picker ظاهر نمی‌شود و کاربر یک لیست خالی می‌بیند.

---

## وضعیت فعلی

| صفحه | محور | انتظار | روی production |
|---|---|---|---|
| **OptiScaler** | installer | — | ۶ گزینه (ولی اسم‌هایشان order است) |
| | plan | ۸ | **۰** |
| | order | ۱۲ | **۰** |
| **AI Optical Flow** | unlocker | ۳ | **۰** |
| | streamline | ۴ | **۰** |
| **Streamline PC Max** | streamline | ۴ | **بسته وجود ندارد** |

---

## ۱ · AI Optical Flow — فایل‌ها هستند، برچسبشان غلط است

بستهٔ `optiflow` روی سرور **۱۸ فایل درست** دارد:

- `version.dll` و `dlss-enabler.ini` با `role=launcher` ← این همان unlocker است
- ۱۶ تا DLL استریم‌لاین با `role=streamline`

ولی **هر ۱۸ تا `component: installer` و `variant: null` دارند.**

صفحه دنبال `component: 'unlocker'` و `component: 'streamline'` می‌گردد. هیچ‌کدام
پیدا نمی‌شود، پس هر دو picker خالی‌اند.

`role` درست است و `component` غلط — یعنی موقع آپلود، `component` روی مقدار
پیش‌فرض (`installer`) رها شده.

**رفع:** فایل‌های فعلی باید حذف و با `component` درست دوباره آپلود شوند.
API راهی برای تغییر `component` یک فایل موجود ندارد؛ فقط حذف و آپلود دوباره.

---

## ۲ · OptiScaler — پلن و اوردر اصلاً آپلود نشده‌اند

روی سرور ۱۷ فایل هست:

- ۱۱ فایل پایه (runtime خود OptiScaler) — درست
- ۶ تا `OptiScaler.ini` با نام‌های `AMD P1-6X`، `NVIDIA P1-6X`، … که
  **order** هستند ولی `component: installer` خورده‌اند

هیچ فایل `component: plan` یا `component: order` وجود ندارد.

**فایل‌های درست روی دیسک هستند** و دقیقاً با چیزی که کد انتظار دارد می‌خوانند:

```
Untitled Folder/OPTI MFG-2X-6X-V5/
  OPTI Plan/    → ۸ پوشه   ↔  expected: 8   ✓
  OPTI Order/   → ۱۲ پوشه  ↔  expected: 12  ✓
```

این تصادفی نیست — کد صفحه بر اساس همین محتوای V5 نوشته شده. سروری که الان
بالاست محتوای نسخهٔ V4 را دارد (۶ اوردر، بدون پلن).

**مانیفست آماده است:**

```bash
node apps/api/scripts/push-package.mjs \
  --manifest apps/api/scripts/packages/optiscaler-plans-orders.json --dry-run
```

۲۰ واریانت. حجم روی دیسک ۱۹۶ مگابایت است ولی **فقط ۲۵ مگابایت آپلود
می‌شود**: هر ۸ فایل «پلن» یک باینری‌اند که به هشت نام مختلف کپی شده
(`dxgi.dll`، `winmm.dll`، `version.dll`، …) — این‌طوری proxy DLL کار می‌کند و
کاربر انتخاب می‌کند بازی کدام نام را لود کند. اسکریپت فایل‌های هم‌محتوا را
یک بار آپلود می‌کند و بقیهٔ ردیف‌ها همان را share می‌کنند؛ حذف یک ردیف هم
فایل ذخیره‌شده را پاک نمی‌کند، پس امن است.

`role=launcher` گذاشته شده چون این فایل‌ها کنار
فایل اجرایی بازی می‌نشینند — همان چیزی که `OptiScaler.ini`های فعلی روی سرور
هم دارند، پس با چیزی که کلاینت الان درست resolve می‌کند یکی است.

> ۶ اوردر قدیمیِ بدبرچسب هم باید حذف شوند، وگرنه در picker مربوط به
> installer باقی می‌مانند.

---

## ۳ · Streamline PC Max — بسته اصلاً وجود ندارد

روی سرور `available: false`.

روی دیسک **فقط یک ست واقعی** هست. هر ۱۶ فایل در هر سه پوشهٔ زیر
بایت‌به‌بایت یکی‌اند:

```
NVIDIA MFG Original V2/Streamline PC MAX V2          ۱۶ فایل
OPTI MFG-2X-6X-V4/OPTI Scaler/OptiScaler/streamline  ۱۶ فایل  (همان)
OPTI MFG-2X-6X-V5/OPTI Scaler/OptiScaler/streamline  ۱۸ فایل  (همان + ۲ لایسنس)
```

پس چیزی به‌عنوان «سه واریانت گمشده» وجود ندارد. آنچه در دیتابیس لوکال
به‌عنوان واریانت‌های `Streamline 2-11`، `Streamline 2-12` و
`Streamline PC Max V1` ثبت شده، هرکدام یک فایل ۸۴ تا ۸۹ بایتی‌اند —
**متن ASCII**، فیکسچر تست که به کاتالوگ راه پیدا کرده. یک interposer واقعی
۶۴۷٬۸۰۸ بایت است.

```bash
node apps/api/scripts/push-package.mjs \
  --manifest apps/api/scripts/packages/streamline-pc-max.json --dry-run
```

### تصمیمی که باقی مانده: `expected: 4`

کد هر دو صفحهٔ Streamline و AI Optical Flow `expected: 4` دارد، ولی یک ست
بیشتر وجود ندارد. پس حتی بعد از آپلود، «۱ از ۴» نشان می‌دهد.

دو راه:

- **اگر قرار نیست واریانت دیگری بیاید** → در
  `apps/desktop/src/pages/StreamlinePcMaxPage.tsx` و `AiOpticalFlowPage.tsx`
  مقدار را `1` کن. صفحه کامل دیده می‌شود.
- **اگر قرار است بیاید** → دست نزن. «۱ از ۴» صادقانه است و همین‌طور هم
  طراحی شده (کامنت `ChoiceGrid` می‌گوید پر کردن لیست با گزینه‌های بی‌اثر
  بدتر از گفتن عدد واقعی است).

همین سؤال برای `unlocker` با `expected: 3` هم هست — روی دیسک یک unlocker
بیشتر نیست.

---

## ترتیب پیشنهادی

۱. اول OptiScaler (پلن و اوردر) — بیشترین اثر، و فایل‌هایش کامل روی دیسک است
۲. بعد Streamline
۳. بعد پاک‌سازی و آپلود دوبارهٔ optiflow با `component` درست
۴. آخر تصمیم دربارهٔ `expected`

هر بار اول `--dry-run`.

بعد از هر کدام:

```bash
for t in optiflow optiscaler streamline; do
  printf "%-12s " "$t"
  curl -s "https://pc-maxapp.rixy.ir/api/v1/mfg/tools/$t" | grep -o '"available":[a-z]*'
done
```
