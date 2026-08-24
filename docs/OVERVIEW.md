# PC MAX — توضیح کامل برنامه

نقشهٔ کلی پروژه: چه چیزی هست، از چه تکه‌هایی ساخته شده، و کدام بخش‌ها آن‌قدر
غیرشهودی‌اند که اگر ندانی وقتت را هدر می‌دهند.

نسخهٔ فعلی: **0.4.0** · دامنه: `pc-maxapp.rixy.ir`

---

## ۱ · در یک جمله

یک برنامهٔ دسکتاپ ویندوز که برای **۳۱۳ بازی** تنظیمات گرافیکی بهینه نشان
می‌دهد و سه ابزار افزایش فریم (OptiScaler، AI Optical Flow، Streamline PC Max)
را روی پوشهٔ بازی کاربر نصب می‌کند. پشتش یک API و پنل ادمین است.

---

## ۲ · ساختار مخزن

مونوریپو با npm workspaces:

```
apps/
  api/          Fastify + Drizzle + PostgreSQL + Redis
  desktop/      Tauri v2 (Rust) + React + Vite + Tailwind
packages/
  validation/   اسکیماهای Zod — قرارداد مشترک بین API و دسکتاپ
  types/        تایپ‌های مشترک
infrastructure/ docker-compose + اسکریپت pcmax
docs/           همین‌ها
```

`packages/validation` مهم‌تر از چیزی است که به‌نظر می‌آید: **همان اسکیما هم
ورودی API را اعتبارسنجی می‌کند و هم تایپ کلاینت را می‌سازد.** اگر شکل داده‌ای
را عوض کردی، آنجا عوضش کن نه در دو جای جدا.

---

## ۳ · برنامهٔ دسکتاپ

Tauri یعنی UI با React نوشته می‌شود ولی داخل یک باینری Rust اجرا می‌شود.
هرچه به فایل‌سیستم یا سخت‌افزار دست بزند **باید** در Rust باشد و از طریق
`invoke` صدا زده شود — وب‌ویو خودش دسترسی ندارد. این مرز، مرز امنیتی است.

### صفحه‌ها

| صفحه | کار |
|---|---|
| Home / Games / Categories | مرور کاتالوگ |
| GameDetail | مشخصات بازی + پریست‌های بهینه |
| OptimizedSetting | فهرست بازی‌هایی که پریست دارند |
| OptiScaler / AiOpticalFlow / StreamlinePcMax | سه صفحهٔ ابزار |
| WindowsOptimizer | بهینه‌سازی خود ویندوز |
| MultiFrameGeneration | ویژگی قفل‌دار (اشتراک لازم) |
| Favorites / RecentlyViewed / Recommended / Library | فهرست‌های شخصی |
| Login / Register / ForgotPassword | احراز هویت |
| Subscription | پلن‌ها و خرید |
| Admin | پنل مدیریت داخل خود برنامه |
| Settings / About | تنظیمات و نسخه |

### دستورهای Rust (۱۴ تا)

```
detect_hardware      detect_games         extract_game_icon
optiflow_scan        optiflow_install     optiflow_uninstall
windows_scan         windows_apply        windows_restore
windows_recover      windows_snapshots
apply_game_files     save_binary_file     app_version
```

`optiflow_scan` قبل از نصب، پوشهٔ بازی را می‌گردد و می‌گوید چه فایل‌هایی
جایگزین می‌شوند. عمق جست‌وجو و تعداد ورودی‌ها سقف دارد (۸ سطح، ۲۰۰ هزار
ورودی) تا روی یک درایو ۲۰۰ گیگی UI هنگ نکند.

---

## ۴ · API

Fastify با ۱۰۷ مسیر و ۱۳۹ عملیات، همه زیر `/api/v1`. مستندات OpenAPI روی
`/docs`.

### گروه‌های اصلی

| گروه | نمونه |
|---|---|
| عمومی | `/games`، `/games/{slug}/optimizations`، `/featured`، `/home` |
| احراز هویت | `/auth/register`، `/auth/login`، `/auth/otp/send`، `/auth/refresh` |
| کاربر | `/me`، `/me/devices`، `/me/hardware`، `/favorites` |
| اشتراک | `/subscriptions/plans`، `/subscriptions/purchase`، `/me/features` |
| ابزارها | `/mfg/tools/{tool}`، `/games/{slug}/packages` |
| همگام‌سازی | `/sync`، `/views`، `/client-errors` |
| به‌روزرسانی | `/updates/{target}/{arch}/{version}`، `/app/version` |
| ادمین | ~۴۰ مسیر زیر `/admin/*` |

### نکته‌ای که وقت می‌گیرد

اعتبارسنجی بدنه **قبل از** گارد احراز هویت اجرا می‌شود. یعنی یک درخواست
ناشناس با بدنهٔ بد، `400` می‌گیرد نه `401`. اگر داری تست می‌نویسی که «این
مسیر باید ۴۰۱ بدهد»، بدنهٔ **معتبر** بفرست وگرنه تست بی‌آنکه چیزی را ثابت
کند سبز می‌شود.

---

## ۵ · دیتابیس

۳۷ جدول، ۲۱ مایگریشن. مایگریشن‌ها موقع بالا آمدن کانتینر خودکار اجرا می‌شوند
(`CMD` ایمیج اول `migrate.js` را می‌زند).

گروه‌های اصلی: `users`/`admins`/`sessions` · `games` و جدول‌های وابسته ·
`optimization_profiles`/`settings`/`options` · `subscription_plans`/
`payments`/`subscriptions`/`entitlements` · `optimization_packages`/
`package_files` · `audit_logs`/`login_attempts`/`email_logs`/`client_errors`

> **تلهٔ Drizzle:** خروجی `drizzle-kit generate` را بدون خواندن کامیت نکن —
> گاهی آبجکت‌هایی را که از قبل وجود دارند دوباره می‌سازد.

> **بعد از هر restore:** `pcmax fix-sequences`. اسکریپت restore ردیف‌ها را با
> id اصلی درج می‌کند و شمارنده‌های `serial` را جلو نمی‌برد؛ نتیجه‌اش این است
> که **اولین درج عادی بعدی** با خطای کلید تکراری می‌شکند — و این خطا موقع
> restore دیده نمی‌شود، بعداً به‌شکل ۵۰۰ روی یک درخواست معمولی ظاهر می‌شود.

---

## ۶ · دو مفهوم که بیشترین سردرگمی را می‌سازند

### الف) پریست‌های بهینه

هر بازی صفر تا چند پروفایل دارد. رنگ پریست تعیین می‌کند برای چیست:

| رنگ | هدف | FPS |
|---|---|---|
| 🟢 green | حفظ کیفیت تصویر | ۹۰ |
| 🟡 yellow | فریم بیشتر | ۱۲۰ |
| 🔴 ray_tracing | کیفیت حداکثری | ۶۰ |
| 🔵 multiplay | رقابتی | ۱۴۴ |

`target_fps` از روی همین رنگ ساخته می‌شود، نه per-game. تنها فیلدی که
می‌توانست per-game متفاوتش کند `games.performance_rating` است، ولی **هر ۳۱۳
ردیف مقدار ۵۰ دارند**، پس وزن دادن با آن فقط تفاوت ساختگی می‌سازد.
`pcmax target-fps` این را اعمال می‌کند (idempotent).

### ب) بسته‌ها: component / variant / role

این مهم‌ترین و غیرشهودی‌ترین بخش سیستم است. هر فایل بسته سه برچسب دارد:

**`component`** تعیین می‌کند فایل در کدام picker صفحه دیده شود:

| صفحه | picker ها |
|---|---|
| OptiScaler | `installer` · `plan` (۸) · `order` (۱۲) |
| AI Optical Flow | `unlocker` (۳) · `streamline` (۴) |
| Streamline PC Max | `streamline` (۴) |

**`variant`** اسم گزینه داخل picker است. **فایلی که `variant` ندارد گزینه
نمی‌سازد** — فایل پایه است و همیشه نصب می‌شود.

**`role`** تعیین می‌کند فایل کجا کپی شود:

| role | مقصد |
|---|---|
| `relative` | مسیری نسبت به ریشهٔ بازی |
| `launcher` | کنار فایل اجرایی که کاربر انتخاب کرده |
| `streamline` | جایگزینی همان فایل هرجا که در نصب پیدا شود |

> ⚠️ **فایلی با `component` غلط نامرئی است.** نه خطا می‌دهد، نه لاگ می‌کند؛
> فقط در آن picker ظاهر نمی‌شود و کاربر یک لیست خالی می‌بیند که شبیه باگ
> برنامه است. این دقیقاً همان چیزی است که سه صفحهٔ ابزار را از کار انداخته
> بود — جزئیاتش در [TOOL-PACKAGES.md](TOOL-PACKAGES.md).

---

## ۷ · احراز هویت

ثبت‌نام با **ایمیل + کد یک‌بارمصرف**. توکن دسترسی JWT کوتاه‌عمر (۹۰۰ ثانیه)
به‌علاوهٔ کوکی refresh. ادمین‌ها جدا هستند (`kind: admin` در توکن) و مجوزهای
ریزدانه دارند.

- `ADMIN_BOOTSTRAP_*` فقط وقتی ادمین **وجود ندارد** او را می‌سازد؛ رمز ادمین
  موجود را عوض نمی‌کند. برای تغییر: `pcmax set-admin <email>`
- تلاش‌های ورود در `login_attempts` ثبت می‌شوند
- ورودهای ناموفق پیاپی به `429` می‌خورند — این محافظت brute-force است و
  رفتار درست است

---

## ۸ · اشتراک و پرداخت

چهار پلن (۱، ۳، ۶، ۱۲ ماه). درگاه: Zarinpal. یک درگاه `mock` هم هست که **هر
پرداختی را تأیید می‌کند** — API با آن در حالت production بالا نمی‌آید مگر
`ALLOW_MOCK_PAYMENTS` را صریحاً بگذاری.

ویژگی‌های قفل‌دار با کلید قابلیت کار می‌کنند نه با نام entitlement:
`multi_frame_generation` و `windows_optimizer`.

---

## ۹ · به‌روزرسانی خودکار

Tauri updater به `/updates/{target}/{arch}/{version}` می‌زند و **فقط دو پاسخ**
را می‌فهمد: `204` (به‌روزی) یا `200` با بدنهٔ
`{version, url, signature, pub_date}`. هر چیز دیگری — ۴۰۴، پاکت خطا، بدنهٔ
ناقص — به‌روزرسانی را برای **همهٔ نصب‌ها** بی‌صدا از کار می‌اندازد.

> تا وقتی نسخه‌ای در `/admin/app-versions` ثبت نشده باشد، این مسیر همیشه
> `204` می‌دهد و هیچ کاربری آپدیت نمی‌گیرد. فایل `.sig` خروجی بیلد را نگه
> دار — بدون آن نمی‌شود نسخه را منتشر کرد.

---

## ۱۰ · استقرار

```
اینترنت → Nginx (aaPanel, SSL) → 127.0.0.1:4000 → کانتینر api
                                                    ├─ postgres
                                                    └─ redis
```

هیچ سرویسی مستقیم روی اینترنت نیست. مدیریت با `pcmax`:

| دستور | کار |
|---|---|
| `pcmax deploy` | git pull + بیلد + اجرا |
| `pcmax target-fps` | پر کردن FPS هدف |
| `pcmax metadata` | ژانرها و منتخب‌ها |
| `pcmax fix-sequences` | تعمیر شمارنده‌ها بعد از restore |
| `pcmax set-admin <email>` | ساخت/تغییر ادمین |
| `pcmax backup` / `restore` | بکاپ دیتابیس |
| `pcmax health` | تست محلی و عمومی |

**سرور Node ندارد** — اسکریپت‌ها داخل ایمیج اجرا می‌شوند. برای همین تست e2e
و آپلود بسته‌ها از روی ورک‌استیشن اجرا می‌شوند، نه روی سرور.

> `VITE_API_URL` موقع بیلد به‌صورت رشتهٔ ثابت داخل باندل می‌نشیند. یک
> `.env.local` جامانده که به localhost اشاره کند، نصابی می‌سازد که روی دستگاه
> کاربر فقط می‌تواند «Unable to reach the PC MAX service» بدهد.
> `scripts/check-api-url.mjs` جلوی بیلد را می‌گیرد.

---

## ۱۱ · تست

| مجموعه | تعداد |
|---|---|
| API (vitest) | ۲۰۰ |
| دسکتاپ (vitest) | ۹۳ |
| Rust (cargo) | ۶۸ |
| **e2e جعبه‌سیاه** | **۹۰** |

مجموعهٔ e2e فقط از راه HTTP حرف می‌زند و چیزهایی را می‌گیرد که تست واحد
نمی‌بیند: هدر غلط reverse proxy، CORS ای که با `tauri://localhost` جور نیست،
مایگریشن اجرانشده، ایمیجی از کامیت اشتباه. جزئیات:
[apps/api/e2e/README.md](../apps/api/e2e/README.md).

حالت پیش‌فرضش `readonly` است و اجرای حالت نویسنده روی آدرس غیرلوکال را رد
می‌کند.

---

## ۱۲ · اسکریپت‌های عملیاتی

روی **ورک‌استیشن** اجرا می‌شوند:

| اسکریپت | کار |
|---|---|
| `apps/api/e2e/run.mjs` | تست جعبه‌سیاه یک دیپلوی |
| `apps/api/scripts/push-package.mjs` | آپلود بسته از روی پوشهٔ دیسک |
| `apps/api/scripts/retag-package.mjs` | اصلاح component/variant بدون آپلود دوباره |

`push-package` فایل‌های هم‌محتوا را یک بار آپلود می‌کند (هشت «پلن» OptiScaler
یک باینری‌اند با هشت نام) و قابل تکرار است.

`retag-package` از این استفاده می‌کند که `files/complete` هر `storageKey` ای
را می‌پذیرد و حذف یک ردیف آبجکت ذخیره‌شده را پاک نمی‌کند — پس می‌شود ردیف را
روی همان آبجکت دوباره ثبت کرد. یعنی اصلاح ۱۱۱ مگابایت، صفر بایت آپلود.

---

## ۱۳ · چیزهایی که در گیت نیستند

- `infrastructure/.env` — رمزهای production
- `Untitled Folder/` — فایل‌های خام ابزارها (~۱ گیگ). **غیرقابل‌بازتولید**
- `game opti/` — فایل‌های متنی تنظیمات (داده‌شان در دیتابیس هست)
- `icon/` — پک آیکون خام

بکاپ باید این‌ها را داشته باشد؛ `node_modules` و `target` نه (با یک دستور
دوباره ساخته می‌شوند).

---

## ۱۴ · نقشهٔ سند‌ها

| سند | برای چه |
|---|---|
| [QA-TEST-GUIDE.md](QA-TEST-GUIDE.md) | به تستر بده |
| [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) | از بیلد تا تحویل |
| [TOOL-PACKAGES.md](TOOL-PACKAGES.md) | وضعیت سه صفحهٔ ابزار |
| [DEPLOY-VPS.md](DEPLOY-VPS.md) | راه‌اندازی سرور |
| [ARCHITECTURE.md](ARCHITECTURE.md) · [API.md](API.md) | جزئیات فنی |
