# چک‌لیست انتشار

از «می‌خواهم بیلد بگیرم» تا «به کارفرما دادم». هر مرحله یک راه بررسی دارد،
چون هر کدام از این‌ها یک بار واقعاً شکسته است.

---

## قبل از بیلد

### ۱ · هیچ `.env.local` نمانده باشد

```bash
ls apps/desktop/.env* 2>/dev/null && echo "⚠ پاکش کن" || echo "✅ تمیز"
```

Vite مقدار `VITE_API_URL` را به‌صورت رشتهٔ ثابت داخل بیلد می‌گذارد. یک
`.env.local` جامانده که به localhost اشاره کند، نصابی می‌سازد که روی دستگاه
کاربر فقط می‌تواند «Unable to reach the PC MAX service» بدهد.

> از نسخهٔ فعلی `npm run build` خودش جلوی این را می‌گیرد و اسم فایل مقصر را
> می‌گوید. این بررسی لایهٔ دوم است، نه تنها محافظ.

### ۲ · شماره نسخه‌ها یکی باشند

```bash
grep -m1 '"version"' apps/desktop/package.json apps/desktop/src-tauri/tauri.conf.json
grep -m1 '^version' apps/desktop/src-tauri/Cargo.toml
grep -o "appVersion: '[^']*'" apps/desktop/src/lib/config.ts
```

هر چهارتا باید یکی باشند. `tauri.conf.json` چیزی است که به‌روزرسانی خودکار
با آن مقایسه می‌کند؛ اگر عقب بماند، کاربری که نسخهٔ جدید را نصب کرده باز هم
«آپدیت موجود است» می‌بیند.

### ۳ · تست‌ها سبز باشند

```bash
cd apps/api && npx vitest run && cd ../desktop && npx vitest run && cd src-tauri && cargo test
```

### ۴ · سرور با کد فعلی هم‌خط باشد

```bash
ssh root@31.57.63.253 'cd /www/pcmax && git pull && pcmax deploy && pcmax health'
```

بیلد دسکتاپ با API صحبت می‌کند؛ اگر سرور چند کامیت عقب باشد، برنامه به
مسیرهایی می‌زند که هنوز آنجا نیستند و ۴۰۴ می‌گیرد.

---

## بیلد و انتشار

یک تگ بزن؛ بقیه‌اش خودکار است:

```bash
git tag -a v0.4.1 -m "PC MAX 0.4.1" && git push origin v0.4.1
```

ورک‌فلو بیلد می‌گیرد و **خودش GitHub Release می‌سازد** با نصاب و `.sig`.
حدود ۶ دقیقه. آدرس دانلود از قبل قابل حدس است:

```
https://github.com/DLSDT/pc-max/releases/download/v<نسخه>/PC.MAX_<نسخه>_x64-setup.exe
```

(گیت‌هاب فاصله‌های نام فایل را به نقطه تبدیل می‌کند.)

> قبلاً باید دستی Release می‌ساختی و لینک را کپی می‌کردی. دلیلش این است که
> دانلود artifact توکن می‌خواهد و updater بی‌نام‌ونشان درخواست می‌دهد — پس
> نصاب باید جایی عمومی باشد.

> `.sig` حیاتی است: سرور نسخهٔ بدون امضا را «آپدیتی موجود نیست» حساب می‌کند،
> یعنی بی‌سروصدا هیچ‌چیز عرضه نمی‌کند.

CI مقدار `VITE_API_URL` را از secret مخزن می‌گیرد و اگر نبود روی
`https://pc-maxapp.rixy.ir/api/v1` می‌افتد. یعنی بیلدهای CI هیچ‌وقت مشکل
بند ۱ را ندارند.

---

## بعد از بیلد — قبل از تحویل

### ۵ · ثبت نسخه روی سرور

**بدون این، به‌روزرسانی خودکار برای هیچ کاربری کار نمی‌کند.**

```bash
read -rsp 'admin password: ' P && PCMAX_ADMIN_PASSWORD="$P" node apps/api/scripts/register-release.mjs \
  --exe <exe> --sig <sig> --url <لینک ریلیز> \
  --base https://pc-maxapp.rixy.ir/api/v1 --admin-email admin@pcmax.rixy.ir --apply; unset P
```

اول بدون `--apply` بزن: اسکریپت کلید امضا را با pubkey داخل برنامه مقایسه
می‌کند و لینک را دانلود می‌کند تا مطمئن شود همان بایت‌هاست.

بررسی:

```bash
curl -s https://pc-maxapp.rixy.ir/api/v1/app/version
```

باید `latest` پر باشد، نه `null`.

### ۶ · بسته‌های ابزارها روی سرور باشند

سه ابزار در برنامه هست. هر سه باید `available: true` بدهند:

```bash
for t in optiflow optiscaler streamline; do
  printf "%-12s " "$t"
  curl -s "https://pc-maxapp.rixy.ir/api/v1/mfg/tools/$t" | grep -o '"available":[a-z]*'
done
```

اگر چیزی `false` بود یا لیست‌ها خالی بودند، `docs/TOOL-PACKAGES.md` را ببین —
وضعیت کامل هر سه بسته و مانیفست‌های آماده آنجاست. برای Streamline:

```bash
PCMAX_ADMIN_PASSWORD='…' node apps/api/scripts/push-package.mjs \
  --manifest apps/api/scripts/packages/streamline-pc-max.json \
  --base https://pc-maxapp.rixy.ir/api/v1 \
  --admin-email admin@pcmax.rixy.ir
```

اول با `--dry-run` ببین چه چیزی قرار است برود.

> صفحهٔ Streamline `expected: 4` دارد، ولی روی دیسک **فقط یک ست واقعی** هست
> (هر ۱۶ فایل در هر سه پوشه بایت‌به‌بایت یکی‌اند). پس «سه واریانت گمشده»
> وجود ندارد و بعد از آپلود هم «۱ از ۴» می‌ماند، مگر `expected` را در
> `StreamlinePcMaxPage.tsx` روی `1` بگذاری. تصمیمش در
> `docs/TOOL-PACKAGES.md` توضیح داده شده.

### ۷ · تست کامل سرور

```bash
read -rsp 'admin password: ' P && PCMAX_ADMIN_PASSWORD="$P" node apps/api/e2e/run.mjs \
  --base https://pc-maxapp.rixy.ir/api/v1 --admin-email admin@pcmax.rixy.ir; unset P
```

انتظار: **۸۷ پاس · صفر شکست** (اگر Streamline آپلود شده باشد).

### ۸ · نصب واقعی روی یک ویندوز

آخرین حلقه، و تنها چیزی که بقیه را جایگزین نمی‌کند: نصاب را روی یک ویندوز
واقعی نصب کن، وارد شو، یک بازی باز کن، ببین FPS هدف عدد نشان می‌دهد.

---

## تحویل به کارفرما

این‌ها را با هم بفرست:

| فایل | چرا |
|---|---|
| `PC MAX_0.4.0_x64-setup.exe` | نصاب |
| `docs/QA-TEST-GUIDE.md` | چه چیزی را تست کند و چه انتظاری داشته باشد |

راهنمای تست بخش «محدودیت‌های شناخته‌شده» دارد. **حتماً بفرستش** — بدون آن،
کارفرما وقتش را صرف گزارش کردن چیزهایی می‌کند که از قبل می‌دانیم، و بیلد
خراب‌تر از آنچه هست به نظر می‌رسد.

---

## بعد از تحویل

گزارش کرش‌ها خودکار به سرور می‌آید. لازم نیست از کارفرما فایل لاگ بخواهی:

پنل ادمین → **Client Errors**

یا:

```bash
read -rsp 'admin password: ' P
T=$(curl -s -X POST https://pc-maxapp.rixy.ir/api/v1/admin/auth/login \
  -H 'content-type: application/json' \
  -d "{\"email\":\"admin@pcmax.rixy.ir\",\"password\":\"$P\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
unset P
curl -s -H "authorization: Bearer $T" \
  'https://pc-maxapp.rixy.ir/api/v1/admin/client-errors?limit=20' | python3 -m json.tool
```

جای دیگری که ارزش نگاه کردن دارد:

- **Client Errors** — کرش‌های واقعی روی دستگاه کارفرما
- **Email Logs** — اگر گفت «کد نیامد»، اینجا می‌بینی فرستاده شده یا نه
- **Login Attempts** — اگر گفت «نمی‌توانم وارد شوم»
