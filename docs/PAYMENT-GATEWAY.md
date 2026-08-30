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

تنها گره این است که **درگاه‌های ایرانی آدرس بازگشت را فقط روی دامنه‌ای قبول
می‌کنند که مرچنت با آن تأیید شده**. مرچنت روی `cianet.ir` تأیید شده ولی API
روی `pc-maxapp.rixy.ir` است، پس آدرس بازگشت باید روی `cianet.ir` باشد و از
آنجا به API برسد.

> **فعال‌سازی هیچ‌وقت به callback اعتماد نمی‌کند.** سرور بعد از بازگشت، خودش
> از درگاه می‌پرسد پرداخت شده یا نه و مبلغ را با قیمت پلن مقایسه می‌کند. یعنی
> کسی که آدرس بازگشت را دستی باز کند اشتراک نمی‌گیرد.

---

## گام ۱ — یک مسیر روی cianet.ir به API فوروارد شود

سایت `cianet.ir` دست‌نخورده می‌ماند؛ فقط یک مسیر اضافه می‌شود.

اگر Nginx است:

```nginx
location /pcmax/api/v1/payments/ {
    proxy_pass https://pc-maxapp.rixy.ir/api/v1/payments/;
    proxy_set_header Host pc-maxapp.rixy.ir;
    proxy_ssl_server_name on;
}
```

با `PAYMENT_CALLBACK_BASE_URL=https://cianet.ir/pcmax`.

**چرا زیر `/pcmax` و نه مستقیم `/api/v1/`:** خود cianet.ir از قبل روی
`/api/v1/` یک API دارد — یک درخواست آزمایشی آنجا
`{"ok":false,"error":"API key نامعتبر یا غیرفعال است."}` برگرداند. فوروارد
گذاشتن روی همان مسیر یا سایت را می‌شکند یا خودش نادیده گرفته می‌شود.
`/pcmax` آزاد بود (۴۰۴ ساده).

سرور آدرس بازگشت را `<base>/api/v1/payments/<provider>/callback` می‌سازد، پس
با این base آدرس نهایی
`https://cianet.ir/pcmax/api/v1/payments/zibal/callback` می‌شود و همان چیزی
است که قانون بالا می‌گیرد. هر دو درگاه بدون تغییر nginx کار می‌کنند.

`proxy_pass` با اسلش پایانی، مسیر باقی‌مانده و query string را خودش منتقل
می‌کند — درگاه نتیجه را در query می‌فرستد (`trackId`، `success`، `orderId`) و
بدون آن سرور نمی‌فهمد کدام پرداخت را verify کند.

اگر Apache یا هاست اشتراکی است، همان کار با یک فایل PHP دو خطی هم می‌شود —
مهم این است که query string حفظ شود.

**بررسی:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://cianet.ir/pcmax/api/v1/payments/zibal/callback?trackId=1"
```

باید یک **JSON** با کد `404` بدهد (به API رسید و پرداختی با آن مشخصه پیدا
نکرد). اگر `Not found` متنی دیدی یعنی هنوز خود cianet.ir جواب می‌دهد و فوروارد
برقرار نیست.

---

## گام ۲ — تنظیمات سرور

در `/www/pcmax/infrastructure/.env`:

```bash
PAYMENT_PROVIDER=zibal
ZIBAL_MERCHANT=<کد مرچنت>
PAYMENT_CALLBACK_BASE_URL=https://cianet.ir/pcmax
```

یا برای آیدی‌پی:

```bash
PAYMENT_PROVIDER=idpay
IDPAY_API_KEY=<کلید>
IDPAY_SANDBOX=false
PAYMENT_CALLBACK_BASE_URL=https://cianet.ir/pcmax
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
| صفحهٔ خطای cianet.ir بعد از پرداخت | فوروارد گام ۱ برقرار نیست |
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
