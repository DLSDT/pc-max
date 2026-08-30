# وصل کردن درگاه پرداخت

راه‌اندازی درگاه ایرانی (زیبال یا آیدی‌پی) وقتی دامنهٔ تأییدشده‌ی درگاه با
دامنهٔ API یکی نیست.

---

## چرا اصلاً کاری لازم است

جریان خرید از قبل همین شکلی است و عوض نشده:

```
برنامه  →  POST /subscriptions/purchase
سرور    →  یک ردیف پرداخت می‌سازد، از درگاه آدرس می‌گیرد، redirectUrl برمی‌گرداند
برنامه  →  redirectUrl را باز می‌کند
کاربر   →  در درگاه پرداخت می‌کند
درگاه   →  به callbackUrl برمی‌گردد
سرور    →  خودش با درگاه verify می‌کند و بعد اشتراک را فعال می‌کند
```

تنها گره این است که **درگاه آدرس بازگشت را فقط روی دامنه‌ای قبول می‌کند که
مرچنت با آن تأیید شده**. مرچنت روی `cianet.ir` تأیید شده ولی API روی
`pc-maxapp.rixy.ir` است، پس آدرس بازگشت باید روی `cianet.ir` باشد و از آنجا به
API برسد.

این حدس نیست؛ زیبال با یک callback روی دامنهٔ API صریحاً رد می‌کند:

```json
{"result": 106, "message": "آدرس callbackUrl باید مرتبط با cianet.ir باشد"}
```

پس پل روی cianet.ir اجباری است، نه یک راه از چند راه.

> **فعال‌سازی هیچ‌وقت به callback اعتماد نمی‌کند.** سرور بعد از بازگشت، خودش
> از درگاه می‌پرسد پرداخت شده یا نه و مبلغ را با قیمت پلن مقایسه می‌کند. یعنی
> کسی که آدرس بازگشت را دستی باز کند اشتراک نمی‌گیرد.

---

## گام ۱ — یک زیردامنه روی دامنهٔ تأییدشده

درگاه فقط دامنه را می‌سنجد، نه اینکه چه چیزی آنجا نشسته — و **زیردامنه را
قبول می‌کند**. یک `CNAME` که مستقیم به API اشاره کند کافی است؛ نه فورواردی، نه
کدی روی سایت اصلی.

در پنل DNS (اینجا کلادفلر):

| فیلد | مقدار |
|---|---|
| Type | `CNAME` |
| Name | `pay` |
| Target | `pc-maxapp.rixy.ir` |
| Proxy | **روشن** (ابر نارنجی) |

پروکسی باید روشن باشد: کلادفلر آن‌وقت خودش گواهی TLS را برای `pay.cianet.ir`
صادر می‌کند. با ابر خاکستری، مرورگر گواهی `pc-maxapp.rixy.ir` را می‌بیند و
پیش از رسیدن به callback خطای امنیتی می‌دهد.

**بررسی:**

```bash
curl -s "https://pay.cianet.ir/api/v1/payments/zibal/callback?trackId=1"
```

باید JSON بدهد (`Payment not found` — رسید به API و پرداختی با آن مشخصه نبود).

### چرا نه فوروارد روی خود دامنه

اولین طرح این بود که مسیری روی `cianet.ir` به API پروکسی شود. دو چیز جلویش را
گرفت: `cianet.ir` یک اپ **Next.js** پشت کلادفلر است نه هاست PHP (فایل `.php`
اصلاً اجرا نمی‌شود)، و مسیر `/api/v1/` از قبل مال API خودِ آن اپ است. زیردامنه
هر دو مشکل را دور می‌زند.

---

## گام ۲ — تنظیمات سرور

در `/www/pcmax/infrastructure/.env`:

```bash
PAYMENT_PROVIDER=zibal
ZIBAL_MERCHANT=<کد مرچنت>
PAYMENT_CALLBACK_BASE_URL=https://pay.cianet.ir
```

یا برای آیدی‌پی:

```bash
PAYMENT_PROVIDER=idpay
IDPAY_API_KEY=<کلید>
IDPAY_SANDBOX=false
PAYMENT_CALLBACK_BASE_URL=https://pay.cianet.ir
```

بعد `pcmax up`.

> `PAYMENT_CALLBACK_BASE_URL` تازه اضافه شده. اگر نگذاریش، از
> `ZARINPAL_CALLBACK_BASE_URL` می‌خواند تا استقرار فعلی نشکند.

### محدودیت IP

زیبال می‌تواند روی مرچنت **IP allowlist** داشته باشد. اگر فعال باشد، تماس از هر
IP دیگری `result: 115 invalid IP` می‌گیرد — که شبیه خرابی درگاه به نظر می‌رسد
ولی فقط یعنی سرور در فهرست نیست.

IP خروجی سرور را از خودش بپرس و همان را در پنل زیبال اضافه کن:

```bash
curl -s ifconfig.me
```

---

## گام ۳ — تست بدون پول واقعی

**زیبال** یک مرچنت تستی دارد که کل مسیر را بدون جابه‌جایی پول طی می‌کند:

```bash
ZIBAL_MERCHANT=zibal
```

**آیدی‌پی** با `IDPAY_SANDBOX=true` همین کار را می‌کند (کلید واقعی لازم است).

قیمت‌ها را هم برای تست پایین بیاور:

```bash
read -rsp 'admin password: ' P && PCMAX_ADMIN_PASSWORD="$P" node apps/api/scripts/set-plan-prices.mjs \
  --toman 1000 --base https://pc-maxapp.rixy.ir/api/v1 --admin-email admin@pcmax.rixy.ir --apply; unset P
```

قیمت‌های واقعی در `plan-prices-backup.json` ذخیره می‌شوند. برگرداندنشان:

```bash
… set-plan-prices.mjs --restore plan-prices-backup.json --apply
```

> قیمت به **ریال** ذخیره و از درگاه گرفته می‌شود. اسکریپت تومان می‌گیرد و
> ضربدر ده می‌کند، پس `--toman 1000` یعنی «۱۰,۰۰۰ IRR» روی صفحه و ۱۰۰۰ تومان
> از کارت.

---

## گام ۴ — یک خرید واقعی

در برنامه وارد شو، یک پلن بخر، در درگاه پرداخت کن.

بعدش:

```bash
read -rsp 'admin password: ' P
T=$(curl -s -X POST https://pc-maxapp.rixy.ir/api/v1/admin/auth/login \
  -H 'content-type: application/json' \
  -d "{\"email\":\"admin@pcmax.rixy.ir\",\"password\":\"$P\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
unset P
curl -s -H "authorization: Bearer $T" \
  'https://pc-maxapp.rixy.ir/api/v1/admin/payments?limit=5' | python3 -m json.tool
```

`status` باید `paid` باشد و اشتراک در برنامه فعال شده باشد.

---

## اگر کار نکرد

| نشانه | معنی |
|---|---|
| صفحهٔ خطا یا هشدار TLS بعد از پرداخت | رکورد `pay` نیست یا پروکسی‌اش خاموش است |
| «Payment not found» | query string در فوروارد حذف شده |
| «Payment verification failed» | درگاه پرداخت را تأیید نکرد — در پنل درگاه ببین |
| خطای مرچنت موقع شروع خرید | کد مرچنت یا دامنهٔ تأییدشده جور نیست |

پرداخت‌های ناموفق در `/admin/payments` با وضعیت `failed` می‌مانند، پس همیشه
می‌شود دید چند تا شروع شده و چند تا رسیده.

---

## وضعیت پیاده‌سازی

**زیبال** — قرارداد API در برابر خود درگاه تأیید شده: درخواست `result: 100` با
`trackId` می‌دهد، verify یک تراکنش پرداخت‌نشده `result: 202` می‌دهد، و صفحهٔ
`gateway.zibal.ir/start/<trackId>` بالا می‌آید.

**آیدی‌پی** — طبق مستندات v1.1 نوشته شده و با پاسخ‌های شبیه‌سازی‌شده تست شده،
ولی **در برابر درگاه واقعی امتحان نشده** چون کلید API لازم دارد. اولین خرید
sandbox این را ثابت می‌کند.

هر دو مبلغ را با آنچه درگاه گزارش می‌دهد مقایسه می‌کنند و اگر کمتر بود اشتراک
را فعال نمی‌کنند.
