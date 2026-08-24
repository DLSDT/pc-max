# تست end-to-end از بیرون

این مجموعه فقط از راه HTTP با سرور حرف می‌زند — نه ایمپورتی از سورس API، نه
دسترسی مستقیم به دیتابیس. دقیقاً همان مسیری را می‌رود که برنامه دسکتاپ می‌رود،
پس چیزهایی را می‌گیرد که تست‌های واحد نمی‌بینند: هدر اشتباه در reverse proxy،
CORS ای که دیگر با `tauri://localhost` جور نیست، مایگریشنی که اجرا نشده، یا
ایمیجی که از کامیت اشتباه بیلد شده.

## دو حالت

| حالت | چه می‌کند | کجا |
|---|---|---|
| `readonly` (پیش‌فرض) | فقط می‌خواند. هیچ ردیفی نمی‌سازد و پاک نمی‌کند. | سرور واقعی |
| `full` | همه‌چیز، از جمله ساخت و حذف ردیف | فقط استک محلی |

پیش‌فرض عمداً `readonly` است تا یک `--base` اشتباه تایپ‌شده نتواند روی سرور
بنویسد. اجرای `--mode full` روی آدرسی که localhost نباشد را runner رد می‌کند.

## اجرا

روی استک محلی، کامل:

```bash
cd /home/omid/Desktop/game-optimization-hub
PCMAX_ADMIN_PASSWORD="$(grep '^ADMIN_BOOTSTRAP_PASSWORD=' infrastructure/.env | cut -d= -f2-)" \
node apps/api/e2e/run.mjs --base http://localhost:4000/api/v1 --mode full \
  --admin-email "$(grep '^ADMIN_BOOTSTRAP_EMAIL=' infrastructure/.env | cut -d= -f2-)"
```

روی سرور واقعی (امن — فقط می‌خواند):

```bash
PCMAX_ADMIN_PASSWORD='…' node apps/api/e2e/run.mjs \
  --base https://pc-maxapp.rixy.ir/api/v1 --admin-email admin@pcmax.rixy.ir
```

فقط یک بخش:

```bash
node apps/api/e2e/run.mjs --only catalog
```

بدون `--admin-email` هم اجرا می‌شود؛ تست‌هایی که به ادمین نیاز دارند شکست
می‌خورند، بقیه کار می‌کنند.

خروجی کد غیرصفر می‌دهد اگر چیزی شکست بخورد، پس می‌شود جلوی یک دیپلوی را گرفت.

## چرا از روی این ماشین، نه روی سرور

روی سرور Node نصب نیست (اسکریپت‌ها داخل ایمیج اجرا می‌شوند). تازه اجرای تست از
بیرون بهتر هم هست: مسیر واقعی کاربر شامل Nginx و TLS و CORS را می‌سنجد، نه
`localhost:4000` را که این‌ها را دور می‌زند.

## افزودن تست

هر فایل در `suites/` این شکل را دارد:

```js
import { assert, eq, oneOf } from '../harness.mjs';

export const name = 'catalog';
export const tests = [
  { name: 'چه چیزی را ثابت می‌کند', run: async (ctx) => { … } },
];
```

**قانونی که مهم است:** هر تستی که چیزی می‌سازد، عوض می‌کند یا پاک می‌کند باید
`mode: 'full'` داشته باشد. تست بدون آن روی سرور زنده هم اجرا می‌شود.
