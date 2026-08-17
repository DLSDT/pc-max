# گزارش ممیزی (Audit) و نقشه معماری — Game Optimization Hub

> نسخه: 1.0 — مرحله ۱ از ۲۱ (Audit)
> تاریخ: ۱۷ اوت ۲۰۲۶
> وضعیت: این سند **پیش از اعمال هر تغییر بزرگ** تهیه شده است. تغییرات طبق برنامه مرحلهای بخش «Migration Plan» و پس از تأیید شما اجرا میشوند.

---

## ۱. خلاصه اجرایی

پروژه فعلی یک پایه فنی **قوی و سالم** است: مونوریپوی تمیز با ۳ اپلیکیشن، اسکیمای رابطهای منظم، تستهای یکپارچهسازی واقعی (۲۹ تست روی PostgreSQL جاسازیشده)، لایه امنیتی مناسب (JWT + Argon2id + RBAC + Rate Limit + Helmet + Audit)، و یک مسیر همگامسازی cache-first برای دسکتاپ که بهدرستی کار میکند.

اما برای رسیدن به «پلتفرم تجاری اشتراکمحور» که در مشخصات خواسته شده، **چهار شکاف ساختاری اساسی** وجود دارد:

1. **بدون احراز هویت کاربر**: جدول `users` صرفاً هویت ناشناس مبتنی بر `deviceId` است (خود مشتری اعلام میکند). هیچ Login/Register، رمز عبور، یا نشست کاربری واقعی وجود ندارد.
2. **بدون مدل اشتراک/پرداخت**: هیچ جدول `subscription_plans`, `subscriptions`, `payments`, `entitlements`, `devices`, `license_sessions` وجود ندارد.
3. **بهینهسازی فقط «تنظیمات» است، نه «بسته»**: مدل فعلی (`optimization_profiles` ← `settings` ← `options`) فقط مقادیر پیشنهادی گرافیکی است. هیچ سیستم Package فایل (manifest، SHA-256، نصب اتمیک، Backup/Rollback، سازگاری سختافزاری) وجود ندارد.
4. **بدون پیکربندی از راه دور**: Branding، تم (رنگها)، اعلانها، حالت Maintenance و حداقل نسخه برنامه همگی Hardcode شدهاند؛ برای تغییر آنها باید اپ را Rebuild کرد — که دقیقاً خلاف قانون #۶۶ پروژه است.

خبر خوب: **هیچ بخشی از معماری فعلی نیاز به بازنویسی ندارد** — همهچیز قابل تکامل مرحلهای با کمترین Breaking Change است. این گزارش مسیر دقیق را نشان میدهد.

---

## ۲. معماری فعلی (Current Architecture)

### ساختار مونوریپو
```
game-optimization-hub/
├── apps/
│   ├── api/          # Fastify 5 + Drizzle ORM + PostgreSQL 16
│   ├── admin/        # Next.js 15 (App Router) + shadcn/ui
│   └── desktop/      # Tauri 2 + React 19 + Vite + Tailwind + i18next (EN/FA)
├── packages/
│   ├── validation/   # Zod schemaهای مشترک قرارداد API
│   └── types/        # تایپهای مشترک
├── infrastructure/   # docker-compose (postgres)
└── docs/             # مستندات
```

### Backend (apps/api)
| لایه | وضعیت |
|---|---|
| فریمورک | Fastify 5 + Zod type provider + OpenAPI/Swagger در `/docs` (~۶۰ route) |
| ORM | Drizzle ORM + ۱۹ جدول + یک مایگریشن کامیتشده |
| احراز هویت | JWT دسترسی کوتاهمدت + Refresh Token چرخشی (کوکی) — **فقط برای ادمین** |
| رمزنگاری | Argon2id |
| اختیارات | RBAC: `super_admin / admin / editor / viewer` با permissionهای گرانولار |
| امنیت | Helmet، CORS allowlist، Rate Limit سراسری، Audit Log برای همه تغییرات ادمین |
| فایلها | Presigned Upload با دو درایور: دیسک محلی و S3/R2 (آمازون SDK) |
| ماژولها | system، device، public-games، public-optimizations، sync، uploads، auth، admin-games، admin-optimizations، admin-taxonomy، admin-users، admin-analytics، admin-audit، admin-releases |
| تست | ۲۹ تست یکپارچهسازی روی PostgreSQL جاسازیشده (embeded-postgres) |

### پایگاه داده (۱۹ جدول)
`users`، `admins`، `sessions`، `categories`، `tags`، `optimization_categories`، `games`، `game_images`، `game_categories`، `game_tags`، `game_requirements`، `optimization_profiles`، `optimization_profile_versions`، `optimization_settings`، `optimization_options`، `favorites`، `views`، `audit_logs`، `app_versions`

### Admin Panel (apps/admin)
داشبورد آماری (بازدید، محبوبترین بازیها)، CRUD کامل بازیها (وضعیت Draft/Published، الزامات، تگها، بجهای تکنولوژی DLSS/FSR/XeSS/RT/FG)، ویرایشگر پروفایلهای بهینهسازی (پروفایل ← تنظیمات ← گزینهها ← دستهبندی ← نسخهگذاری semver ← انتشار)، تاکسونومی، انتشار نسخههای اپ، مدیریت ادمینها، گزارش Audit.

### Desktop App (apps/desktop)
- Tauri 2 + React 19؛ سایدبار جمعشونده، هدر با جستجو + پیل وضعیت آنلاین/آفلاین + بج بهروزرسانی.
- صفحات: خانه، بازیها، دستهبندیها، پیشنهادشده، اخیراً دیدهشده، علاقهمندیها، تنظیمات، درباره.
- i18n انگلیسی + فارسی با RTL کامل؛ تم تیره (بنفش/آبی فعلی).
- همگامسازی cache-first: کتابخانه را در `localStorage` کش میکند، آفلاین بدون کرش رندر میشود، بازگشت آنلاین خودکار Re-sync میکند. بیلد: ۱۱۸.۶ kB gzip.
- پوسته Tauri برای ویندوز آماده است: NSIS، آیکونهای کامل، `windows_subsystem`، capabilities حداقلی.

### نقاط قوتی که حفظ میشوند
- ✅ معماری مونوریپو + اشتراکگذاری قراردادهای Zod بین کلاینتها و سرور.
- ✅ لایه امنیتی ادمین (JWT چرخشی، Argon2id، RBAC، rate-limit، audit).
- ✅ انتزاع Storage (درایور محلی + S3/R2) — آماده برای CDN.
- ✅ ماژول sync با انتشار visibility صحیح (رفعشده در تست E2E).
- ✅ مسیر cache-first آفلاین دسکتاپ.
- ✅ تستهای یکپارچهسازی روی دیتابیس واقعی.
- ✅ پوسته Tauri آماده ویندوز.

---

## ۳. مشکلات یافتشده (Problems Found)

### ۳.۱ معماری
| # | مشکل | شدت |
|---|---|---|
| A1 | `users` فقط هویت ناشناس deviceId است؛ هیچ حساب کاربری، رمز عبور یا نشست واقعی ندارد | 🔴 بحرانی |
| A2 | هیچ مدل اشتراک/پرداخت/حق دسترسی (entitlement) وجود ندارد | 🔴 بحرانی |
| A3 | «بهینهسازی» فقط مقادیر پیشنهادی است؛ هیچ سیستم فایل/مانیفست/نصب/بکاپ وجود ندارد | 🔴 بحرانی |
| A4 | Branding/تم/اعلان/Maintenance همگی hardcode هستند — بدون Rebuild قابل تغییر نیستند | 🔴 بحرانی |
| A5 | هیچ سرویس پیکربندی از راه دور (remote config) وجود ندارد | 🟠 بالا |
| A6 | هیچ لایه کش سرور (Redis) و صف پسزمینه وجود ندارد | 🟠 بالا |
| A7 | `featured` (بازیهای ویژه) از کجا میآید؟ باید از Backend قابل تنظیم باشد نه ثابت | 🟠 بالا |

### ۳.۲ دسکتاپ
| # | مشکل | شدت |
|---|---|---|
| D1 | دسکتاپ **هیچ Login ندارد** — درگاه خرید/اشتراک و گیتینگ ممتاز غیرممکن است | 🔴 بحرانی |
| D2 | هیچ تشخیص سختافزار واقعی (Rust command) وجود ندارد؛ `device.ts` فقط stub است | 🟠 بالا |
| D3 | پلاگین `tauri-plugin-updater` نصب نیست — فقط بج UI وجود دارد | 🟠 بالا |
| D4 | capabilities حداقلی است؛ برای عملیات فایلسیستم (بکاپ/نصب/rollback) باید بهصورت allowlist گسترش یابد | 🟠 بالا |
| D5 | تم فعلی بنفش/آبی است؛ تم قرمز/سفید/تیره درخواستی پیاده نشده | 🟡 متوسط |
| D6 | هیچ صفحه «حساب من / دستگاههای من / تاریخچه بهینهسازی» وجود ندارد | 🟡 متوسط |

### ۳.۳ ادمین
| # | مشکل | شدت |
|---|---|---|
| M1 | هیچ بخش Users/Subscriptions/Payments/Packages/Devices/Branding/Theme/Analytics/Security در ادمین نیست | 🔴 بحرانی |
| M2 | هیچ ویرایشگر Optimization Package (فایل + مانیفست + سازگاری GPU) وجود ندارد | 🔴 بحرانی |
| M3 | پالت رنگ و لوگوها hardcode هستند؛ پنل Branding/Theme وجود ندارد | 🟠 بالا |
| M4 | جدول `admins` و `users` از هم جدا هستند؛ نقشهای کاربری (super_admin/admin/content/support/viewer) برای کاربران تعریف نشده | 🟡 متوسط |

### ۳.۴ API
| # | مشکل | شدت |
|---|---|---|
| P1 | مسیرهای `/users/device` و `/views` بدون احراز هویت هستند و `deviceId` را از کلاینت میپذیرند (جعلپذیر + تورم بازدید) | 🔴 بحرانی |
| P2 | بدون endpoint برای ثبتنام/ورود کاربر، ایجاد پرداخت، بررسی حق دسترسی، دانلود بسته | 🔴 بحرانی |
| P3 | Search ادمین فقط روی name بود (slug نبود) — رفع شد | ✅ رفعشده |
| P4 | مانیفست sync شامل بازیهای draft/archive بود — رفع شد (حذفها بهصورت `deleted` منتشر میشوند) | ✅ رفعشده |

---

## ۴. ریسکهای امنیتی (Security Risks)

| # | ریسک | وضعیت فعلی | اقدام پیشنهادی |
|---|---|---|---|
| S1 | جعل هویت دستگاه (Device Spoofing) | 🔴 `deviceId` خام از کلاینت پذیرفته میشود | ثبت امن دستگاه: سرور nonce صادر کند، اپ با کلید ذخیرهشده در Keychain امضا کند؛ محدودیت تعداد دستگاه و ضد-سوءاستفاده |
| S2 | تورم بازدید/آمار (Abuse) | 🟠 `/views` بدون احراز | احراز + rate-limit اختصاصی + تأیید دستگاه ثبتشده |
| S3 | شکست قفل حساب (Account Lockout) | 🟠 فقط rate-limit سراسری | قفل موقت پس از N تلاش ناموفق + لاگ امنیتی |
| S4 | Token Theft / Session Fixation | 🟡 توکنها با کوکیهای HttpOnly + چرخش | تداوم: بررسی SameSite/secure، شناسه دستگاه در refresh، revoke همه نشستها |
| S5 | Path Traversal در فایلهای بهینهسازی (آینده) | ⚠️ هنوز سیستم فایل نصب وجود ندارد — **از روز اول باید** | Normalize + Resolve + مقایسه با دایرکتوری مجاز بازی؛ ممنوعیت هر نوشتن خارج از آن |
| S6 | Remote Code Execution (آینده) | ⚠️ | بستهها فقط Manifest با عملیات allowlist (کپی/جایگزینی فایل)؛ هیچ اسکریپت/اجرایی از سرور پذیرفته نشود |
| S7 | دستکاری کلاینت | ⚠️ | هیچ secret در کلاینت؛ تصمیمات اشتراک/حق دسترسی همیشه server-side |
| S8 | Payment Manipulation | ⚠️ هنوز وجود ندارد | Verify سمت سرور + idempotency + امضای callback |
| S9 | IDOR | 🟡 باید ممیزی شود | تستهای اختصاصی در security audit |
| S10 | CSRF در کوکی ادمین | 🟡 | تأیید SameSite + منشأ درخواست |

---

## ۵. مشکلات عملکردی (Performance Problems)

| # | مشکل | اقدام |
|---|---|---|
| F1 | هر بازدید = ۲ نوشتن همزمان در دیتابیس (insert + increment) | شمارندههای Redis + flush دورهای؛ یا درج انبوه ناهمزمان |
| F2 | بدون کش سرور برای بازیهای پربازدید / پیکربندی / پلنها | کش Redis با invalidate هوشمند در زمان تغییر |
| F3 | صفحهبندی offset برای همه لیستها | برای `views` و `audit_logs` و کتابخانه بزرگ: cursor pagination (keyset) |
| F4 | `audit_logs` بدون محدودیت رشد | سیاست نگهداری (retention) + آرشیو |
| F5 | بازیابی روابط در لیستها (N+1) | بررسی کوئریها با `with`/joins و ایندکسهای composite |
| F6 | بدون بارگذاری آزمایشی | k6 با سناریوهای ۱هزار/۱۰هزار/۱۰۰هزار |

---

## ۶. مشکلات پایگاه داده (Database Problems)

1. **جدولهای کلیدی محصول وجود ندارند**: `subscription_plans`, `subscriptions`, `payments`, `payment_transactions`, `entitlements`, `devices`, `license_sessions`, `optimization_packages`, `package_files`, `package_manifest_entries`, `hardware_profiles`, `optimization_history`, `app_config` (remote config), `announcements`, `login_attempts`, `password_resets`.
2. **ایندکسهای ازدسترفته**: ایندکس composite روی `views(user_id, game_id, created_at)`، `games(view_count)`، `audit_logs(created_at)`، و ایندکسهای مشابه برای keyset pagination باید اضافه شوند.
3. **سازگاری `users`**: ستونهای `email` (unique)، `username`، `password_hash`، `role`، `status`، `created_at/updated_at` باید به جدول `users` اضافه شوند (با حفظ سازگاری `deviceId` برای انتقال نرم).
4. **پشتیبانگیری خودکار** دیتابیس (pg_dump دورهای + retention + PITR) فقط در مستندات است؛ باید اسکریپت/workflow شود.
5. **محدودیتهای یکتایی/ارجاعی** (FK, unique) در جدولهای جدید از روز اول اعمال شود.

---

## ۷. معماری پیشنهادی (Recommended Architecture)

```
┌────────────────────────────────────────────────────────────┐
│  Windows Desktop (Tauri 2)                                 │
│  React UI · Hardware Detection (Rust) · Cache-First        │
│  Atomic Installer · Backup/Restore · Auto-Updater          │
└───────────────┬────────────────────────────────────────────┘
                │ HTTPS · JWT (کوتاه) · Refresh چرخشی
┌───────────────▼────────────────────────────────────────────┐
│  CDN / API Gateway (اختیاری: Cloudflare)                   │
│  لایه Rate Limit · WAF · کش لبه                        │
└───────────────┬────────────────────────────────────────────┘
┌───────────────▼────────────────────────────────────────────┐
│  Load Balancer → چند نمونه API (Fastify, بدون State)   │
│  Auth · Users · Subscriptions · Payments · Packages        │
│  Entitlements · Devices · Sync · Admin · Analytics         │
└───────┬──────────────────────┬───────────────────┬─────────┘
        │                      │                   │
┌───────▼────────┐   ┌─────────▼────────┐   ┌──────▼─────────┐
│ Redis          │   │ PostgreSQL 16    │   │ Object Storage │
│ Session Cache  │   │ مدل اشتراک/پرداخت│   │ R2/S3 + CDN    │
│ Rate Limit     │   │ بستهها/مانیفست   │   │ بستههای آپتیمایز│
│ شمارندهها/کش   │   │ ایندکس + cursor  │   │ + Presigned URL│
│ قفلهای موقت    │   │ پشتیبان خودکار   │   │                │
└────────────────┘   └──────────────────┘   └────────────────┘
        │
┌───────▼────────────────────────────────────────────────────┐
│ صف کارهای پسزمینه (اختیاری: BullMQ / pg-queue)            │
│ شمارنده بازدید · پاکسازی · ایمیل · اعلانها                 │
└────────────────────────────────────────────────────────────┘
```

**اصول کلیدی معماری:**
- **همه تصمیمات مهم server-side**: اشتراک، پرداخت، حق دسترسی، محدودیت دستگاه، اجازه دانلود. کلاینت Trust Boundary نیست.
- **بستههای بهینهسازی = فایل + مانیفست + سازگاری**: هر بسته Metadata دارد (GPU Vendor/Family، حداقل VRAM/RAM، CPU tier، نسخه ویندوز، نسخه بازی، معماری) + مانیفست فایلها (SHA-256، مقصد، عملیات allowlist).
- **پرداخت Provider-Agnostic**: اینترفیس `PaymentProvider` + پیادهسازی ZarinPal (و بعداً درگاههای دیگر). Verify همیشه سمت سرور؛ تراکنش idempotent.
- **پیکربندی از راه دور**: جدول `app_config` (JSON) + کش Redis + پخش به کلاینت از طریق sync — هر تغییری بدون Rebuild به کاربران میرسد.
- **امنیت فایلسیستم**: هیچ مسیری از سرور بدون Validation اجرا نمیشود؛ normalize/resolve/مقایسه با دایرکتوری مجاز؛ عملیات فقط allowlist.

---

## ۸. ساختار پوشهای جدید (New Folder Structure)

```
apps/api/src/
├── modules/
│   ├── auth/            # login/register/refresh/logout/lockout/password-reset
│   ├── users/           # پروفایل، دستگاههای من، revoke
│   ├── subscriptions/   # پلنها + اشتراک من
│   ├── payments/        # provider-agnostic + zarinpal + webhook/verify
│   ├── entitlements/    # بررسی حق دسترسی (server-side)
│   ├── devices/         # ثبت امن دستگاه + محدودیت
│   ├── packages/        # بستههای بهینهسازی + مانیفست + دانلود امضاشده
│   ├── hardware/        # پروفایلهای سختافزاری + موتور سازگاری
│   ├── optimize/        # تاریخچه بهینهسازی
│   ├── config/          # remote config (branding/theme/announcement/maintenance)
│   ├── admin/           # (موجود + users/subscriptions/payments/packages/devices/branding)
│   └── sync/            # (موجود — توسعهیافته)
├── services/
│   ├── payments/        # interface + zarinpal + mock
│   ├── packages/        # manifest/hash/install-plan
│   └── compatibility/   # موتور توصیه
└── jobs/                # شمارنده بازدید، پاکسازی، پشتیبان

apps/desktop/src/
├── lib/
│   ├── hardware/        # Rust commands → CPU/GPU/VRAM/RAM/OS
│   ├── installer/       # دانلود→تأیید→بکاپ→نصب اتمیک→رولبک
│   └── auth/            # نشست امن (بدون ذخیره secret)
├── pages/ (موجود +)
│   ├── Login / Register
│   ├── Subscription / Checkout
│   ├── MyAccount / Devices
│   └── OptimizationHistory

apps/admin/app/
├── (dashboard)/
│   ├── users/  subscriptions/  payments/
│   ├── packages/  hardware-profiles/
│   ├── branding/  theme/  settings/
│   └── devices/  analytics/  security/
```

---

## ۹. وابستگیهای جدید (Required Dependencies)

| لایه | پکیج | دلیل |
|---|---|---|
| API | `@node-rs/argon2` (یا فعلی) | موجود |
| API | `ioredis` | کش/نرخ/شمارنده |
| API | `bullmq` (یا `pg-boss`) | صف پسزمینه |
| API | `undici`/`fetch` (استاندارد) | تماس درگاه پرداخت |
| API | `archiver`/`unzipper` | ساخت/استخراج بسته |
| Desktop | `@tauri-apps/plugin-updater` | آپدیت امن (امضا + هش) |
| Desktop | `@tauri-apps/plugin-fs` + `plugin-dialog` | بکاپ/نصب/انتخاب مسیر بازی |
| Desktop | `@tauri-apps/plugin-store` (یا keyring) | ذخیره امن شناسه دستگاه |
| Desktop | `crypto-js`/WebCrypto | هش SHA-256 سمت کلاینت |
| Desktop | `wmic`/PowerShell (Rust) | تشخیص سختافزار ویندوز |
| Testing | `k6` (script) | بارگذاری |
| Testing | `@vitest/coverage` | پوشش |

---

## ۱۰. تغییرات پایگاه داده (Required Database Changes)

**جدولهای جدید:**
1. `subscription_plans` — name, duration_days, price, currency, device_limit, features (JSONB), status, sort_order
2. `subscriptions` — user_id, plan_id, start_date, expiration_date, status (pending/active/expired/cancelled/suspended/refunded), payment_id, timestamps
3. `payments` — user_id, plan_id, amount, currency, provider, status, idempotency_key (unique)
4. `payment_transactions` — payment_id, provider_tx_id, provider_status, raw (JSONB), timestamps
5. `entitlements` — user_id, subscription_id, feature, granted_at, expires_at
6. `devices` — user_id, device_id (امن), name, platform, last_seen, revoked_at, registered_via
7. `license_sessions` — device_id, entitlement_id, issued_at, expires_at, revoked_at
8. `optimization_packages` — game_id, name, version, status, gpu_vendor, gpu_family, min_vram, rec_vram, min_ram, cpu_tier, min_windows, game_version, arch, target_resolution, target_fps, description
9. `package_files` — package_id, filename, sha256, size, destination, operation (allowlist), version, storage_key
10. `optimization_history` — user_id, device_id, game_id, package_id, package_version, status, error_code, installed_at, restored_at
11. `app_config` — key (unique), value JSONB, updated_by, updated_at (branding/theme/announcement/maintenance/min_app_version/featured)
12. `login_attempts` — email, ip, success, at (برای lockout)
13. `password_resets` — user_id, token_hash, expires_at, used_at

**تغییر جدولهای موجود:**
- `users`: + email (unique)، username، password_hash، role، status (active/suspended)، timestamps؛ حفظ `deviceId` برای انتقال نرم
- ایندکسهای جدید: `views(user_id, game_id, created_at)`، `games(view_count DESC)`، `audit_logs(created_at)`، `optimization_history(user_id, created_at)`
- `app_versions`: + `minimum_supported_version`, `mandatory` (فعلاً موجود است؟ اگر نه اضافه شود)

---

## ۱۱. تغییرات API (Required API Changes)

**عمومی (Desktop):**
- `POST /auth/register` ، `POST /auth/login` ، `POST /auth/refresh` ، `POST /auth/logout` ، `POST /auth/password/reset`
- `GET /me` ، `GET /me/devices` ، `DELETE /me/devices/:id`
- `GET /subscriptions/plans` ، `POST /subscriptions/purchase` (ایجاد پرداخت)، `GET /subscriptions/me`
- `POST /payments/:provider/callback` (verify server-side، idempotent)
- `GET /packages/:game/:package` (با entitlement check) → Signed URL
- `GET /hardware/profiles` ، `POST /hardware/recommend` (موتور سازگاری)
- `GET /optimize/history` ، `POST /optimize/result` (ثبت نتیجه)
- `GET /config` (branding/theme/announcement/maintenance/min_version) — در sync

**ادمین:**
- CRUD: `users`، `subscription_plans`، `subscriptions` (تمدید/لغو/دستی)، `payments`، `optimization_packages` (+ آپلود فایل، مانیفست، hash)، `hardware_profiles`، `devices` (revoke)، `branding`، `theme`، `settings` (remote config)، `announcements`

---

## ۱۲. کامپوننتهای ویندوز (Required Windows Components)

| کامپوننت | توضیح |
|---|---|
| Hardware Detection (Rust) | دستورات Tauri: CPU/GPU/Vendor/VRAM/RAM/Windows/Arch/Resolution/Driver — فقط خواندنی |
| Secure Device ID | کلید تصادفی در Keychain ویندوز + ثبت از طریق چالش سرور |
| Atomic Installer | دانلود → verify SHA-256 → استخراج به temp → بکاپ → جایگزینی اتمیک → verify → ثبت موفقیت؛ rollback خودکار |
| Path Guard | normalize/resolve مسیرهای بسته و مقایسه با دایرکتوری مجاز بازی؛ بلوکه کردن `..` |
| Game Detector | Steam/Epic/Xbox/Registry/مسیر دستی — فقط با تأیید کاربر |
| Auto-Updater | `tauri-plugin-updater` + امضای بهروزرسانی + بررسی هش و نسخه |
| Least Privilege | اجرای عادی بدون ادمین؛ درخواست elevation فقط برای عملیات لازم |
| Progress Pipeline | مراحل: تشخیص سختافزار → تشخیص بازی → بررسی اشتراک → دانلود → verify → بکاپ → نصب → verify → کامل |

---

## ۱۳. برنامه مهاجرت (Migration Plan) — ۲۱ مرحله

> هر مرحله: Build + Tests + Typecheck + Lint + بررسی امنیت + بررسی Regression، بعد مرحله بعد.

| فاز | مرحله | خروجی کلیدی | شکستن؟ |
|---|---|---|---|
| **۱** | Audit | این سند | — |
| **۲** | Architecture Refactor | لایه config/جداسازی ماژولها + ایندکسها + migration پایه | کم |
| **۳** | Authentication | Register/Login/Refresh/Lockout/Password-reset (کاربر + ادمین مشترک) | کم |
| **۴** | Users | پروفایل کاربر، status، suspend/activate، جستجو | کم |
| **۵** | Subscriptions | پلنها (داینامیک) + اشتراک + entitlement + محدودیت دستگاه | جدید |
| **۶** | Payment | اینترفیس Provider + ZarinPal + verify server-side + idempotency + sandbox | جدید |
| **۷** | Admin Panel | منوهای جدید: Users/Subscriptions/Payments/Devices/Security/Settings | جدید |
| **۸** | Game Management | تکمیل موجود (Cover/Logo/Background/Engine/Release) | — |
| **۹** | Package Management | بسته + فایلها + مانیفست + نسخهگذاری + آپلود امن | جدید |
| **۱۰** | Hardware Detection | Rust commands + نمایش «Your PC» | جدید |
| **۱۱** | Compatibility Engine | تطبیق بسته با سختافزار → Recommended Profile | جدید |
| **۱۲** | Secure Download | Signed URL + CDN + محدود به entitlement | جدید |
| **۱۳** | Backup / Restore | بکاپ قبل از هر تغییر + Restore Original | جدید |
| **۱۴** | One-Click Optimization | Pipeline کامل + Progress UI + خطا/Retry/Restore | جدید |
| **۱۵** | Branding / Theme | remote config + پنل برندینگ + تم قرمز/سفید/تیره | کم |
| **۱۶** | Caching | Redis + کش پیکربندی/پلنها/بازیها + شمارنده بازدید | — |
| **۱۷** | Auto Update | پلاگین آپدیت + mandatory/min version | — |
| **۱۸** | Monitoring | متریکها + Sentry integration point + هشدارها | — |
| **۱۹** | Security Audit | OWASP + IDOR/SSRF/Path Traversal/CSRF + تستهای امنیتی | — |
| **۲۰** | Load Testing | k6: ۱هزار / ۱۰هزار / ۱۰۰هزار | — |
| **۲۱** | Production Build | ادمین + API + دسکتاپ + `.exe` (ویندوز/CI) | — |

**اولویت پیشنهادی من برای اجرا (پس از تأیید):** ۲ → ۳ → ۴ → ۵ → ۶ (هسته درآمد) سپس ۹ → ۱۰ → ۱۱ → ۱۲ → ۱۳ → ۱۴ (هسته ارزش) سپس ۱۵ → ۱۶ → ۱۷ → ۱۸ → ۱۹ → ۲۰ → ۲۱.

---

## ۱۴. استراتژی تست (Testing Strategy)

| سطح | ابزار | پوشش |
|---|---|---|
| Unit | Vitest | سرویسها: اشتراک، entitlement، سازگاری، مانیفست، path guard |
| Integration | Vitest + embedded-postgres | جریان کامل: register → خرید → callback → فعالسازی → دانلود → نصب → تاریخچه |
| API | سوئیت موجود (۲۹ تست) + موارد جدید | همه endpointهای جدید + idempotency + RBAC + lockout |
| Security | تستهای اختصاصی | IDOR، path traversal، CSRF، تزریق، دستکاری قیمت، replay callback |
| File/Install | تست Rust (cargo test) | atomic replace، rollback، hash mismatch |
| Load | k6 | ۱هزار/۱۰هزار کاربر همزمان، ۱۰۰هزار ثبتنام |
| E2E | Playwright (ادمین) + پیشنمایش (دسکتاپ) | جریانهای اصلی UI |

---

## ۱۵. استراتژی استقرار (Deployment Strategy)

- **Dev**: `npm run dev:embedded` (Postgres جاسازیشده، seed فقط بار اول، داده پایدار) — موجود و درست.
- **Staging/Prod**: docker-compose یا Kubernetes: API (چند نمونه، stateless) + PostgreSQL 16 (PITR، بکاپ دورهای + retention) + Redis + Object Storage (R2/S3) + CDN.
- **CI**: GitHub Actions — تست + typecheck + build ادمین/دسکتاپ + workflow ساخت `.exe` ویندوز (موجود).
- **Release**: publish installer → ثبت نسخه در ادمین (release notes, min version, mandatory) → کلاینتها Auto-Update.
- **Monitoring**: healthchecks + متریک (latency, 5xx, login/payment/optimization failures) + هشدار؛ Sentry با redaction دادههای حساس.

---

## ۱۶. تصمیمهایی که قبل از مرحله ۲ به تأیید شما نیاز است

1. **درگاه پرداخت اول**: ZarinPal (ریال) — در مرحله ۶ با حالت Sandbox/Mock پیاده شود و با کلید واقعی شما فعال شود؟ یا درگاه دیگری؟
2. **نقش کاربر در جدول `users`**: آیا `users` باید با `admins` ادغام شود (یک جدول + role) یا جدا بمانند؟ (پیشنهاد من: ادغام تدریجی با حفظ `admins` فعلی برای سازگاری)
3. **شناسه امن دستگاه**: روش چالش-پاسخ با کلید در Keychain — تأیید میکنید؟
4. **حالت آفلاین برای عملیات ممتاز**: پیشنهاد من — مشاهده کتابخانه آفلاین آزاد، اما دانلود/نصب بسته همیشه نیاز به تأیید server-side دارد (با TTL کوتاه برای کش entitlement). تأیید میکنید؟

---

---

## ۱۷. گزارش پیشرفت اجرا (Phases 2–6 — تکمیلشده)

> بهروزرسانی ۱۷ اوت ۲۰۲۶ — پس از تأیید معماری، مراحل ۲ تا ۶ پیاده و بهصورت زنده تأیید شد.

| فاز | وضعیت | جزئیات |
|---|---|---|
| ۲ — Architecture Refactor | ✅ | مایگریشن `0001` (۱۱ جدول جدید + ستونهای حساب کاربری + ایندکسهای keyset/کامپوزیت)؛ جداسازی ماژولها؛ لایه سرویس `subscriptions`؛ اصلاح `dev-embedded` (بوت idempotent + ensure پلنها در نصبهای ارتقایافته) |
| ۳ — Authentication | ✅ | `register/login/refresh(چرخشی)/logout/forgot/reset` با Argon2id، قفل حساب پس از ۵ تلاش ناموفق، باطل‌سازی همه نشستها پس از تغییر رمز؛ توکنهای access با `kind: user/admin` تفکیکشده |
| ۴ — Users | ✅ | `GET/PATCH /me`، `GET /me/subscription` (بررسی entitlement سمت سرور)، دستگاههای امن (`/me/devices` با سقف پلن)، مدیریت کاربران ادمین (جستجو/تعلیق/فعالسازی + جزئیات با دستگاهها و اشتراکها) |
| ۵ — Subscriptions | ✅ | پلنهای کاملاً داینامیک (CRUD ادمین، ۴ پلن پیشفرض seed)، جریان خرید idempotent، تمدید/لغو/اعطای دستی توسط ادمین |
| ۶ — Payment | ✅ | اینترفیس `PaymentProvider` + ZarinPal (v4، sandbox) + Mock؛ **verify همیشه سمت سرور**؛ idempotency از طریق `idempotencyKey` و callback تکراری بیضرر |

**تست:** ۴۴/۴۴ تست یکپارچهسازی (۱۵ تست جدید: auth، lockout، rotation، reset، پلنها، خرید، idempotency، سقف دستگاه، RBAC).

**تأیید زنده:** ثبتنام → خرید (mock) → callback → اشتراک فعال با ۳ entitlement → سقف ۱ دستگاه → پنل ادمین (Users/Plans/Subscriptions/Payments) — همگی در پیشنمایش دسکتاپ و ادمین چک شد.

**رفعشده هنگام تست:** بگ shutdown دوگانه `pool.end` در dev-embedded؛ بگ نبود پلنها در دیتابیسهای ارتقایافته (ensure idempotent)؛ نرخ محدودیت مسیر login ادمین برای burst تست.

---

## ۱۸. گزارش پیشرفت اجرا (Phases 7–11 — تکمیلشده)

> به‌روزرسانی ۱۷ اوت ۲۰۲۶ — مراحل ۷ تا ۱۱ طبق برنامه پیاده و با تست + تأیید زنده تکمیل شد.

| فاز | وضعیت | جزئیات |
|---|---|---|
| ۷ — Admin Ops | ✅ | مایگریشن `0002`؛ ماژول‌های `admin-devices` (لیست/Revoke دستگاه همه کاربران)، `admin-security` (لاگ login-attempts با IP/User-Agent و موفق/ناموفق)، `admin-settings` (remote config در جدول `app_config` — اعلان، حالت تعمیرات، حداقل نسخه، بدون Rebuild) + مسیر عمومی `GET /config` |
| ۹ — Optimization Package Engine | ✅ | جداول `optimization_packages` (compatibility metadata: GPU vendor/family، VRAM/RAM/Windows/arch حداقل‌ها، FPS/Resolution هدف)، `package_files` (SHA-256 سمت سرور + destination + operation)، `package_versions` (اسنپ‌شات مانیفست در هر publish با semver bump). دانلود فقط با entitlement (`premium_optimization`) و مانیفست با هش تأییدشده + URLها؛ allowlist پسوند فایل (هیچ executable/اسکریپتی)؛ آپلود مستقیم local + presign برای S3 |
| ۱۰ — Hardware Detection | ✅ | فرمان Tauri `detect_hardware` (Rust — PowerShell/Get-CimInstance: CPU/GPU/VRAM/RAM/Windows/معماری/رزولوشن)؛ ذخیره پروفایل سخت‌افزار (`PUT/GET /me/hardware`، فیلدهای privacy-conscious)؛ پنل «Your PC» در صفحه اصلی دسکتاپ + آپلود خودکار |
| ۱۱ — Compatibility Engine | ✅ | موتور امتیازدهی قطعی `services/compatibility.ts` (vendor match +۴۰، family +۳۰/−۲۰، VRAM/RAM/Windows/arch حداقل‌ها، tie-break به نفع جدیدترین انتشار)؛ `POST /hardware/recommend` فقط روی بسته‌های published؛ نمایش «Recommended for your PC» در صفحه بازی + لیست بسته‌های منتشرشده |

**تست:** ۵۳/۵۳ تست یکپارچه‌سازی (۹ تست جدید: CRUD بسته، رد فایل ناامن، آپلود + SHA-256 سمت سرور، publish + semver، گیت دانلود با entitlement، امتیازدهی سازگاری، دستگاه‌ها، settings).

**تأیید زنده (۲۰/۲۰):** ثبت‌نام → ذخیره پروفایل سخت‌افزار → ایجاد/آپلود/hash/انتشار بسته توسط ادمین → recommend روی سخت‌افزار واقعی → 403 برای کاربر رایگان → اعطای دستی پلن → 200 با مانیفست هش‌شده → دستگاه‌ها/امنیت/settings ادمین → `GET /config` عمومی.

**رفع‌شده هنگام تست:** 415 برای آپلود باینری (ثبت content-type parser بافر + نوشتن body به‌جای `request.raw` مصرف‌شده)؛ نبود `status` در پاسخ public بسته؛ **بگ واقعی:** POST با `content-type: application/json` و بدنه خالی → 500 (اکنون 400 با پیام واضح؛ مشابه بدنه بیش از حد بزرگ → 413)؛ tie-break recommend برای بسته‌های هم‌امتیاز.

---

## ۱۹. گزارش پیشرفت اجرا (Phases 12–13 — تکمیل‌شده)

> به‌روزرسانی ۱۷ اوت ۲۰۲۶ — فاز ۱۲ (دانلود امن) و ۱۳ (بکاپ/بازیابی) پیاده و با تست + تأیید زنده کامل شد.

| فاز | وضعیت | جزئیات |
|---|---|---|
| ۱۲ — Secure Download | ✅ | فایل‌های بسته **هرگز** به‌صورت عمومی سرو نمی‌شوند. دانلود فقط با بررسی entitlement سمت سرور، و URLها **امضاشده با TTL** هستند: درایور محلی HMAC-SHA256 با مقایسه constant-time + انقضا (`GET /api/v1/uploads/signed/:exp/:sig/*`)، درایور S3/R2 presigned GET. مسیر خام `/uploads/packages/*` در حالت محلی 403 می‌گیرد؛ `DOWNLOAD_SIGNING_SECRET` (اجباری در production) و `DOWNLOAD_URL_TTL` (پیش‌فرض ۹۰۰ ثانیه) |
| ۱۳ — Backup / Restore | ✅ | موتور بکاپ دسکتاپ (`lib/backup.ts`): ثبت بسته‌های اعمال‌شده (بازی/بسته/نسخه/زمان)، اسنپ‌شات نام‌دار (تا ۱۰ نسخه) شامل favorites + زبان، بازیابی با بازنویسی state و **بازتأیید سمت سرور** (بسته‌های حذف‌شده گزارش می‌شوند). بخش «Backups» در تنظیمات + دکمه دانلود امن روی کارت‌های بسته که state را ثبت می‌کند؛ کش entitlement کوتاه‌مدت (TTL ۵ دقیقه) در `lib/subscription.ts` |

**تست:** ۵۵/۵۵ تست یکپارچه‌سازی (۲ تست جدید: دانلود امضاشده — معتبر/دستکاری‌شده/منقضی/مسیر خام 403 — و تاریخچه انتشار).

**تأیید زنده (۱۵/۱۵):** ایجاد/آپلود/انتشار بسته → 403 برای کاربر رایگان → اعطای دستی → دانلود با URL امضاشده + `expiresIn` → دریافت بایت‌ها و تطابق SHA-256 → امضای دستکاری‌شده 403 → لینک منقضی 403 → مسیر خام 403 → `GET /admin/packages/:id/versions` با اسنپ‌شات مانیفست.

**تأیید UI:** دانلود بسته در صفحه بازی (دکمه Download → Downloaded) → بخش Backups در تنظیمات (ایجاد/بازیابی با پیام موفقیت).

**رفع‌شده هنگام تست — بگ واقعی:** `DELETE`/`POST` بدون بدنه با `content-type: application/json` → 500 (در Fastify بدنه خالی JSON خطا می‌داد). حالا parser سفارشی JSON بدنه خالی را `{}` می‌کند و JSON خراب → 400؛ تست cleanup ادمین (DELETE) به‌درستی کار می‌کند.

---

## ۲۰. گزارش پیشرفت اجرا (Phases 14, 16, 21 — تکمیل‌شده)

> به‌روزرسانی ۱۷ اوت ۲۰۲۶ — One-Click Optimization، Caching/Performance و Production Build پیاده و تأیید شد.

| فاز | وضعیت | جزئیات |
|---|---|---|
| ۱۴ — One-Click Optimization | ✅ | Pipeline کامل در `lib/optimizer.ts`: مانیفست (گیت entitlement سمت سرور) → دانلود از URL امضاشده → **verify SHA-256** هر فایل → بکاپ فایل‌های موجود → اعمال اتمیک (temp+rename) → ثبت در backup/restore. Progress UI با مراحل + درصد + Retry. Writer دوگانه: پوسته Tauri → فرمان Rust `apply_game_files` (اعتبارسنجی مسیر + allowlist پسوند، بکاپ به `.goh-backup/<ts>/`، **rollback کامل** در خطا)؛ مرورگر → staged (قابل تست در Preview). ثبت مسیر نصب هر بازی (`lib/gamePaths.ts`) |
| ۱۶ — Caching / Performance | ✅ | لایه `lib/ttl-cache.ts` دو لایه: حافظه داخلی + Redis اشتراکی (`REDIS_URL`، fallback بی‌خطر). مسیرهای داغ: `/games/cached` و `/home/cached` (TTL ۳۰s) + `/subscriptions/plans` و `/config` (TTL ۶۰s) با هدر `Cache-Control`. دسکتاپ sync را از `/home/cached` می‌گیرد؛ **Invalidation** بعد از هر تغییر ادمین (پلن‌ها/بازی‌ها/settings) |
| ۲۱ — Production Build | ✅ | Dockerfile چندمرحله‌ای API (build → runtime slim، migrate در start از طریق `dist/db/migrate.js`)، سرویس‌های api + redis در docker-compose؛ تأیید زنده: `npm run build` → `node dist/index.js` با `NODE_ENV=production` → health + هدرهای کش درست؛ workflow ویندوز NSIS موجود و کامل (`build-windows.yml`) |

**تست:** ۵۵/۵۵ (افزودن invalidation کش بعد از CRUD ادمین — تست «پلن جدید در storefront» با کش stale رد شده بود).

**تأیید زنده:** Production build روی DB واقعی؛ هدرهای `cache-control: max-age=30/60`؛ UI Preview: کلیک Optimize → درخواست مسیر نصب → pipeline اجرا → «اعمال شد v1.0.1» + ثبت در backup store + دریافت فایل از URL امضاشده در Network.

---

## ۲۱. گزارش پیشرفت اجرا (Phases 15, 17–20 — تکمیل‌شده)

> به‌روزرسانی ۱۷ اوت ۲۰۲۶ — برندینگ/تم، Auto Update، Monitoring و Security Audit + Load Testing پیاده و تأیید شد. **برنامه ۲۱ مرحله‌ای کامل شد.**

| فاز | وضعیت | جزئیات |
|---|---|---|
| ۱۵ — Branding / Theme | ✅ | تنظیم `branding` در remote config (رنگ accent، نام اپ، لوگو/بنر، توضیح)؛ `lib/branding.ts` دسکتاپ — پالیت از API اعمال می‌شود بدون Rebuild؛ پنل Branding در ادمین؛ **آیکون‌ها**: کیت `/icon` (لوگوی اپ → مجموعه کامل آیکون Tauri + favicon ادمین و دسکتاپ؛ ۸ آیکون بازی استخراج و به `game-icons/` وایرشد) |
| ۱۷ — Auto Update | ✅ | پلاگین `tauri-plugin-updater` (Cargo + capabilities + `plugins` در tauri.conf)؛ `lib/updater.ts` — چک نسخه، آپدیت native، `compareVersions`؛ بج «Update available» در هدر + **بنر اجباری** وقتی نسخه اجرایی زیر `min_app_version` سرور باشد (مدیریت از ادمین، بدون Rebuild) |
| ۱۸ — Monitoring | ✅ | `lib/monitoring.ts` — integration point Sentry (فعال فقط با `SENTRY_DSN`؛ redaction: حذف secrets/توکن‌ها، ماسک ایمیل، حذف query string)؛ هوک در error handler مرکزی (۵۰۰ها) + شکست verification پرداخت؛ `SENTRY_ENV`/`SENTRY_TRACES_SAMPLE_RATE` |
| ۱۹ — Security Audit | ✅ | ممیزی OWASP: IDOR (همه مسیرهای `/me/*` و `:id` به کاربر صاحب توکن محدودند)، SSRF (آدرس درگاه ثابت — بدون ورودی کاربر)، Path Traversal (normalize + `..` guard در storage؛ sanitize filename آپلود)، CSRF (refresh فقط کوکی HttpOnly + SameSite=strict)، Price Manipulation (قیمت همیشه از جدول پلن — کلاینت فقط planId می‌فرستد)، Replay callback (idempotent) |
| ۲۰ — Load Testing | ✅ | سناریوی k6 (`infrastructure/k6/load-test.js`) با سه هدف ۱k/۱۰k/۱۰۰k کاربر همزمان + thresholds (خطا <۱٪، p95<۵۰۰ms، cache p95<۳۰۰ms) + مستندات؛ **اسمُک زنده روی dev**: cached endpoints p95 ۱۰–۱۶ms و DB-backed ~۴۰ms زیر بار هم‌زمان، ۰ خطای ۵xx |

**تست:** ۶۰/۶۰ تست یکپارچه‌سازی (۵ تست جدید امنیتی: IDOR بین‌کاربری، Price Manipulation، نیاز به کوکی refresh — CSRF، عدم نشت داده ادمین از API عمومی، و **بازگشت ۴۲۹ بجای ۵۰۰** در Rate Limit).

**بگ واقعی پیدا و رفع شد (حین Load Test):** `@fastify/rate-limit` خطای محدودیت را به‌صورت `Error` ساده با `statusCode: 429` پرتاب می‌کند و error handler سفارشی آن را ۵۰۰ می‌کرد — هر درخواست محدودشده به‌صورت ۵۰۰ برمی‌گشت و (در production) Sentry را از نویز پر می‌کرد. حالا خطاهای 4xx سمت Fastify به‌درستی با status خودشان برمی‌گردند (`RATE_LIMITED`). همچنین `RATE_LIMIT_VIEWS=120` برای endpoint ناشناس `/views` (کنترل تورم آمار).

**تأیید زنده:** همه ۵ workspace typecheck؛ ۶۰/۶۰ تست؛ build تولیدی admin + desktop + API؛ UI Preview — خانه با آیکون‌های واقعی بازی‌ها، بج Update، پنل Your PC، ۲۰۰ همه‌جا، بدون خطای کنسول بعد از رفرش کامل.

*✅ برنامه ۲۱ مرحله‌ای (Audit → Production) به‌صورت کامل اجرا شد — از معماری و احراز هویت تا پرداخت، بسته‌های بهینه‌سازی، دانلود امن، بکاپ، Optimization یک‌کلیکی، کش، آپدیت، مانیتورینگ، ممیزی امنیتی و Load Testing.*

---

## ۲۲. بازطراحی UI (Premium Red & White + فیلتر آیکون‌ها + هدر جزئیات)

| مورد | وضعیت | جزئیات |
|---|---|---|
| تم Premium Red & White | ✅ | پالت بنفش/فیروزه‌ای/آبی حذف شد؛ `--primary` حالا کریمسون `#E50914` (`357 92% 47%`) در دسکتاپ و ادمین، `--ring` روشن‌تر برای هاله‌ها، پس‌زمینه‌ها خاکستری خنثی (`hue 0`) با متن سفید/خاکستری روشن؛ گرادیان‌های `fuchsia` سایدبار/درباره → `red-600`؛ نمودار دشبورد ادمین و `bg-glow` → قرمز؛ برندینگ پیش‌فرض سرور/کلاینت `#8b5cf6` → `#E50914` |
| فیلتر سخت کتابخانه | ✅ | ممیزی `/icon/game icon/` (۲۸۲ پوشه): **۴ بازی بدون آیکون منطبق از دیتابیس و seed حذف شد** — `doom` (آیکون موجود فقط DOOM Eternal است — بازی متفاوت)، `high-on-life` (فقط High On Life 2)، `kingdom-come-deliverance` و `lego-batman` (بدون پوشه). اکنون ۱۰ بازی باقی‌مانده هرکدام آیکون اختصاصی دارند (`gameIcons.ts` + ۲ آیکون جدید gta-v/elden-ring استخراج شد) |
| هدر صفحه جزئیات بازی | ✅ | منطق hero بازنویسی شد: تصویر هدر و بک‌گراند بلور شده از **آیکون اختصاصی همان بازی** (`gameIconUrl(slug)`) می‌آید؛ هیچ بنر اشتراکی/هاردکد (مثل بنر RDR2 برای بازی‌های دیگر) دیگر نمایش داده نمی‌شود؛ fallback فقط cover همان بازی (از DB) و سپس tile خنثی — تصویر `background` اشتراکی از hero حذف شد. Hero صفحه خانه نیز به همان منطق ارتقا یافت |
| CORS dev | ✅ | `http://127.0.0.1:1420` به allowlist پیش‌فرض اضافه شد (پیش‌نمایش مرورگر) |

**آمار جدید:** ۱۰ بازی، ۴۰ پروفایل بهینه‌سازی (به‌جای ۱۴/۵۶). تست‌ها و دشبورد ادمین هم‌زمان به‌روزرسانی شدند (`Total Games: 10`، `Profiles: 40`).

**تأیید:** typecheck همه ۵ workspace؛ ۶۰/۶۰ تست؛ build تولیدی admin + desktop؛ UI زنده — خانه با آیکون واقعی ۱۰ بازی، هدر جزئیات GTA V با آرت اختصاصی خودش، دشبورد ادمین با تم قرمز و اعداد جدید.

---

## ۲۳. بازطراحی بزرگ: تم روشن Premium + کاتالوگ کامل ۲۸۲ بازی + Favorites + احراز هویت شماره‌مبنا

| مورد | وضعیت | جزئیات |
|---|---|---|
| تم روشن Premium White + Crimson | ✅ | دارک‌مود به‌طور کامل حذف شد (دسکتاپ و ادمین). توکن‌های متمرکز: `--background: 0 0% 100%`، `--card: 0 0% 97%`، `--border: 220 13% 91%`، `--foreground: 222 47% 11%`، `--primary: 357 92% 47%` (#E50914)، `--primary-hover` #DC2626. بدون `dark:`، بدون `bg-black`/`bg-gray-900/950` در UI (فقط اسکریم مدال/اورلی). توگل تم حذف شده. یک تغییر برند فقط از CSS vars یک‌جا انجام می‌شود |
| ایمپورتر کامل کاتالوگ (`import-catalog.ts`) | ✅ | دایرکتوری واقعی `/icon/game icon/` اسکن می‌شود — نه لیست هاردکد. ۲۸۰ پوشه → ۲۸۲ بازی (۲ بازی کوریت gta-v/elden-ring + کاتالوگ) با اسلاگ دترمینیستیک. **Idempotent**: upsert بر اساس اسلاگ، پروفایل‌ها فقط وقتی ساخته می‌شوند که وجود نداشته باشند (تست: ۳ بار اجرا → همان ۳ بازی، ۰ تکراری). `npm run catalog:import -w @goh/api`؛ افزودن پوشه جدید → ایمپورت خودکار در بوت بعدی |
| کولیشن اسلاگ | ✅ | دو جفت پوشه تکراری در پک (Assassin's Creed Syndicate و Dragon Age Inquisition هرکدام با دو املا) با پسوند `-2` به‌صورت دترمینیستیک رزولوشن می‌شوند و گزارش می‌شوند (never silently dropped) |
| تبدیل آیکون + نگاشت | ✅ | `convert-icons.py` همه `.ico`ها را به PNG 256×256 در `apps/desktop/public/game-icons/` تبدیل و `gameIcons.ts` را بازتولید می‌کند؛ هر بازی دقیقاً یک آیکون دارد، بدون مسیر شکسته |
| Favorites | ✅ | جدول `favorites` با `unique(user_id, game_id)` (قبلاً در migration 0000). API: `GET/PUT/DELETE /api/v1/favorites[/:gameId]` (PUT آیدی‌مپوتنت)، تایید احراز هویت + اعتبارسنجی بازی + ایزوله‌سازی کاربر (IDOR test). دسکتاپ: کش localStorage آفلاین + همگام‌سازی با سرور هنگام login/restore؛ optimistic با rollback |
| **بگ FavoritesPage (ریشه‌یابی و رفع)** | ✅ | `useSyncExternalStore` با `getFavorites()` که هر بار آرایه‌ی جدید (`Object.values`) برمی‌گرداند → حلقه بی‌نهایت + crash صفحه. ریشه: snapshot باید reference-stable باشد. رفع: `favoritesList` مشتق‌شده در CacheShape (تغییر مرجع فقط با تغییر واقعی). رگرسیون: ۳ تست واحد vitest جدید در دسکتاپ (`npm test -w apps/desktop`) |
| احراز هویت شماره‌مبنا | ✅ | `users.phone` (یکتا، نرمال‌شده بین‌المللی) + `phone_verified`. `lib/phone.ts` (نرمال‌سازی، anti-enumeration یکسان)، `lib/otp.ts` (کد CSPRNG ۶ رقمی، hash‌شده، انقضای کوتاه، یک‌بارمصرف، محدودیت تلاش، cooldown ارسال، نرخ محدود)، `lib/sms/` (ابسترکشن `SmsProvider` — پیاده‌سازی Kavenegar + LogProvider برای dev؛ کلیدها فقط در بک‌اند). جریان‌ها: Register (OTP) / Login / Forgot-Password (OTP → reset → ابطال نشست‌های قبلی) |
| مهاجرت امن email→phone | ✅ | Migration 0003 غیرمخرب: `phone` و `phone_verified` nullable اضافه شدند. `ensureDemoUser` حساب legacy ایمیل‌مبنا را **درجا** ارتقا می‌دهد (همان id — اشتراک/فاووریت/دستگاه‌ها/پرداخت‌ها حفظ می‌شوند). دمو: `+989120000000 / Demo123!`. داده‌های موجود حذف نمی‌شوند |
| ادمین | ✅ | ستون phone در Users؛ dashboard با داده زنده (۲۸۲ بازی / ۱۱۲۸ پروفایل)؛ تم روشن یکسان |
| تست‌ها | ✅ | API: **۶۸/۶۸** (کاتالوگ/ایمپورت/فاووریت/OTP/دسترسی/IDOR + رگرسیون‌های قبلی)؛ دسکتاپ: **۳/۳** (snapshot cache). Typecheck هر ۵ workspace؛ build تولیدی API + desktop + admin |
| بگ واقعی حین QA | ✅ | `ensureDemoUser` فقط با phone چک می‌کرد ولی ردیف legacy با email وجود داشت → unique violation هنگام بوت. رفع با ارتقای درجا (بخش مهاجرت بالا) + «Upgraded legacy demo account to phone» در لاگ بوت |
| بگ واقعی حین QA | ✅ | ادمین Next dev با module graph کهنه (404 روی chunk های خودش) — با پاک کردن `.next` و ری‌استارت حل شد |

**تأیید زنده:** دسکتاپ با تم روشن (پس‌زمینه سفید، دکمه‌های کریمسون `rgb(230,10,21)`، سایدبار روشن)، ۲۸۲ بازی با آیکون واقعی، لاگین با شماره (دمو)، افزودن/حذف فاووریت با رفرش و همگام‌سازی سرور، صفحه جزئیات GTA V با آرت اختصاصی، ادمین با ۲۸۲/۱۱۲۸ و تم روشن — بدون خطای کنسول.

---

## ۲۴. فاز ۰ — ممیزی راست‌آزمایی (Verification Audit) + رفع شکاف‌ها

**ممیزی واقعی (نه گزارش قبلی):**

| مورد | نتیجه |
|---|---|
| تم روشن | ✅ دسکتاپ: صفر `dark:`/`bg-black`/`bg-gray-900/950`؛ ادمین: فقط ۲ اسکریم مدال (`bg-black/40`) که استاندارد است. توکن‌ها: `--primary: 357 92% 47%` (#E50914)، پس‌زمینه سفید |
| کاتالوگ | ✅ ۲۸۰ پوشه در `/icon/game icon/`، ۲۸۲ بازی در DB، ۲۸۲ اسلاگ یکتا، ۰ ردیف تکراری، ۰ پوشه بدون آیکون، ۵۷۲ فایل آیکون |
| Idempotency | ✅ اجرای مجدد ایمپورتر: `Games imported: 0`، `Games already present: 280`، `Database errors: 0` |
| **بگ یافت‌شده #۱** | ⚠️ `catalog:import` پس از انتقال فایل به `src/scripts/` مسیر پیش‌فرض را با ۳ سطح (به‌جای ۴) بالا می‌رفت → خطای «Icon directory not found»؛ متغیر `GOH_ICON_DIR` مستندشده ولی پیاده‌نشده بود. رفع: مسیرهای صحیح + خواندن env (تأیید با اجرای واقعی) |
| Favorites | ✅ ۱۸/۱۸: add → re-login → persists → remove → user-specific |
| Phone Auth | ✅ ۱۸/۱۸: register→OTP→login (نرمال‌سازی)، OTP یک‌بارمصرف، forgot→reset→لاگین با رمز جدید |
| **بگ یافت‌شده #۲ (امنیتی)** | ⚠️ بعد از ریست رمز، access token های قبلی تا انقضا معتبر می‌ماندند (refresh revoke می‌شد ولی JWT استات‌لس نه). رفع: **Token Versioning** — ستون `token_version` (migration 0004)، کلیم `tv` در access token، چک در middleware، افزایش هنگام reset. تست: token قبل از reset → 401 |

**فازهای ۱–۲۱ (آزمون واقعی):**

| فاز | وضعیت |
|---|---|
| ۱–۴ اشتراک/پرداخت/ادمین | ✅ پلن‌ها از DB (غیر هاردکد)، CRUD ادمین، manual-grant، اکستند/سوسپند، audit |
| ۵–۶ سخت‌افزار/سازگاری | ⚠️ **شکاف واقعی #۳**: هیچ موتور سازگاری هارد‌افزار↔بسته وجود نداشت. رفع: `lib/compatibility.ts` (vendor/family/VRAM/RAM/Windows/arch، نتیجه compatible/incompatible/unknown — بدون حدس‌زدن) + بدج «Compatible with your PC» + رتبه‌بندی بسته‌ها + ۹ تست واحد |
| ۷–۸ بسته/مدیر بسته | ⚠️ **شکاف #۴**: جدول optimization_packages خالی بود — سیستم وجود داشت ولی قابل استفاده نبود. رفع: seed ۲ بسته واقعی (GTA V NVIDIA RTX30، Elden Ring AMD FSR) با آپلود فایل، SHA-256 سروری، publish (idempotent) |
| ۹–۱۲ نصب امن/بکاپ/تاریخچه | ✅ Rust: `safe_destination` (ضد path traversal)، backup→SHA-256→atomic install→rollback؛ JS: `optimizer.ts` ۱۶ مرحله |
| ۱۳–۱۴ برندینگ/تم | ✅ تنظیمات remote از API؛ `/config` برندینگ را بازتاب داد (تست شد) |
| ۱۵–۱۷ دشبورد/دستگاه/Entitlement | ✅ دشبورد با آمار واقعی (۲۸۲/۱۱۲۸)؛ دانلود بسته فقط با entitlement سروری (free → 403) |
| ۱۸–۲۰ امنیت/مقیاس/تست | ✅ + تست‌های جدید |

**فاز ۲۱ — Acceptance Test (اجرای واقعی):** **۱۸/۱۸** — register→OTP→login→free-user blocked (403)→manual grant→entitlement→download→**SHA-256 مطابقت**→favorite→logout/login→persist→admin create plan→disable plan→branding→/config→audit logs.

**Build/Test:** typecheck هر ۵ workspace ✓ · API **۶۸/۶۸** ✓ · دسکتاپ **۱۲/۱۲** (۹ سازگاری + ۳ cache) ✓ · build تولیدی API + desktop + admin ✓ (لینت اسکریپت جدا ندارد؛ typecheck+test پوشش می‌دهند).

## ۲۵. راست‌آزمایی لوله نصب واقعی + رفع باگ‌های Entitlement/Manifest (Windows Pipeline Verification)

**هدف:** تأیید واقعی لوله نصب optimization (نه فقط بازبینی کد). از آنجا که این هاست لینوکسی است و خروجی `.exe` فقط روی رانر ویندوز CI ساخته می‌شود، **همان هسته Rust که در اپ ویندوز شipped می‌شود** با `cargo test` واقعی علیه فایل‌سیستم موقت تست شد + کل زنجیره JS/API با سرور زنده. ادعای «اجرای خود فایل exe» نمی‌شود — دقیقاً گزارش می‌شود چه چیزی و کجا اجرا شد.

### باگ‌های واقعی پیدا و رفع شد

| # | باگ | ریشه | رفع | تأیید |
|---|---|---|---|---|
| ۵ (امنیتی، Phase 18) | **Suspend/Revoke اشتراک، entitlement را باطل نمی‌کرد** — `hasEntitlement` فقط ردیف `entitlements.expiresAt` را چک می‌کرد نه وضعیت اشتراک. کاربر suspended همچنان بسته دانلود می‌کرد (۲۰۰ به‌جای ۴۰۳) | `entitlementFeaturesFor` فقط از جدول entitlements می‌خواند | join به جدول subscriptions با شرط `status='active' AND expirationDate > now` — باطل‌سازی فوری و **قابل برگشت** (re-activate ادمین دسترسی را برمی‌گرداند)؛ در `admin-subscriptions.ts` هنگام extend، `entitlements.expiresAt` هم به تاریخ جدید کشیده می‌شود (بدون قطع زودهنگام) | تست enforce زنده: expired→403 ✓ suspended→403 ✓ re-activate→200 ✓ extend→entitlement ~60 روز ✓ + ۲ تست رگرسیون در سویت |
| ۶ | **منیفست بسته‌ها بعد از انتشار v2 تکراری می‌شد** — `listPackageFiles` همه ردیف‌های فایل را در همه نسخه‌ها برمی‌گرداند؛ دانلود شامل ۲ ردیف برای یک destination بود (که نصب‌کننده Rust آن را درست رد می‌کرد) و hash قدیمی ممکن بود سرو شود | ردیف‌های packageFiles اپِند می‌شوند، نسخه‌های قدیمی حذف نمی‌شوند | dedupe در `listPackageFiles` به «جدیدترین ردیف per destination» — snapshot های `optimization_package_versions` تاریخچه کامل را برای restore/audit نگه می‌دارند | دانلود زنده: ۱ ردیف per destination با hash نسخه جدید ✓ نسخه v1 در history قابل ممیزی ✓ + تست رگرسیون |

### Enforcement (اسکریپت زنده، ۱۵/۱۵)

- اشتراک منقضی (backdate واقعی ردیف) → 403 ✓
- Suspended توسط ادمین → 403 ✓ · re-activate → 200 ✓
- Extend توسط ادمین → 200 و `entitlements.expiresAt` به ~۶۰ روز ✓
- فعال → 200 ✓
- محدودیت دستگاه: دستگاه دوم → **409** (CONFLICT — همان‌طور که طراحی شده)، revoke → مجدداً مجاز ✓
- نسخه‌بندی بسته: publish → bump نسخه ✓، history شامل v1 و v2 ✓، hash v2 ≠ hash v1 ✓

### تست‌ها / بیلدها

- API: **۷۱/۷۱** (۶۷ integration + ۴ واحد) — شامل ۳ تست رگرسیون جدید (suspend/revoke، extend، dedupe منیفست)
- دسکتاپ: **۱۲/۱۲** · Typecheck هر ۵ workspace ✓
- Build تولیدی: API ✓ · Desktop ✓ · Admin ✓ (exit=0 هر سه)

### محدودیت صادقانه

اجرای نهایی داخل خود executable ویندوز (نصب واقعی فایل روی `C:\...`) فقط روی رانر ویندوز ممکن است. هسته Rust (`safe_destination`, `apply_game_files`, `rollback`) که همان کد شipped است، با `cargo test` روی فایل‌سیستم واقعی تست شد؛ دانلود/SHA-256/entitlement/device-limit/versioning همگی روی سرور زنده تأیید شدند. برای تأیید کامل exe، workflow CI ویندوز (`apps/desktop/.github` یا `tauri-action` موجود) باید روی یک runner ویندوز اجرا شود.

## ۲۶. PC MAX — برندینگ نهایی، هویت ویندوز، لاگین یکپارچه (ایمیل یا شماره)

### برندینگ
- نام محصول در همهجا: **PC MAX** — Tauri (`productName`، عنوان پنجره، توضیحات باندل)، Cargo (`pc-max` / `pc_max_lib`)، `index.html`، i18n (en/fa)، Sidebar/About/Login، پنل ادمین (metadata، سایدبار، صفحه ورود، پیشفرض Branding)، API (`/config` appName + پیشفرض `brand_name`)، GitHub Actions (نام آرتیفکت `pcmax-windows-setup`)، README ها.
- نسخه: **0.1.0 ← 0.2.0** (package.json دسکتاپ + Cargo + tauri.conf.json هماهنگ).
- شناسه Tauri: `com.pcmax.desktop`؛ domain آپدیت placeholder → `api.pcmax.app`.
- **مراجع عمدی باقیمانده** (تکنیکال، تغییرشان Breaking بود): نام workspace ها (`@goh/*`)، نام ریشه `game-optimization-hub` و پوشه repo، prefix کوکی `goh_user_refresh`، `GOH_*` env ها، اسلاگها/مسیرهای دیتابیس، نام workflow فایل.
- بگ محیطی: ردیف `branding` قدیمی در `app_config` با کلیدهای camelCase (از ذخیره قبلی پنل) با اسکیمای فعلی (snake_case) ناسازگار بود → نرمالسازی شد؛ حالا `/config` برندینگ کامل PC MAX را برمیگرداند (تست زنده ✓).

### آیکون
- منبع: `icon/icon app .jpg` (۶۴۰×۶۴۰ RGB). بدون تغییر منبع؛ LANCZOS resize.
- تولید: PNG های 16–512 (`32x32.png`، `128x128.png`، `128x128@2x.png`، `icon.png`، `512x512.png`، `256x256.png`)، **ICO چندحجمی 16/24/32/48/64/128/256**، favicon.ico + icon.png وب. همه در UI (سایدبار/لایو/درباره/لاگین) و `bundle.icon` استفاده میشوند.

### احراز هویت یکپارچه (ایمیل یا شماره)
- فیلد واحد `identifier` در login/register/forgot/reset/OTP؛ سرور نوع را تشخیص میدهد (`normalizeIdentifier`: شامل `@` → ایمیل، وگرنه شماره).
- ایمیل: trim + lowercase + فرمت؛ شماره: نرمالسازی E.164 بینالمللی (قبلی). هر دو unique؛ حسابها میتوانند phone-only یا email-only باشند؛ legacy email-era حسابها (phone=null) بدون قفل شدن همچنان وارد میشوند.
- OTP: ستون `otp_codes.email` + غیرNOT-NULL شدن `phone` (migration 0005) + `users.email_verified`؛ امنیت قبلی (hash، یکبارمصرف، انقضا، تلاش، cooldown، rate-limit) حفظ شد. `MailProvider` انتزاعی (Console در dev؛ کلیدها فقط بکاند) همتا با `SmsProvider`.
- Forgot/reset برای ایمیل و شماره: پاسخ عمومی بدون افشای وجود حساب (decoy code) ✓؛ ریست → tokenVersion++ + ابطال همه نشستها ✓.
- **تستهای جدید (API):** ثبت/ورود با ایمیل، نرمالسازی ایمیل (حروف بزرگ/فاصله)، ایمیل تکراری → 409، شناسه نامعتبر → 400، ریست رمز با ایمیل + رد token قدیمی + OTP یکبارمصرف، حساب phone-only همچنان کار میکند.
- E2E زنده: **۱۹/۱۹** (branding، ایمیل register/login/normalize، شماره register/login، forgot/reset ایمیل، موارد منفی).

### تستها / بیلدها
- API: **۷۵/۷۵** (۴ تست جدید) · دسکتاپ: **۱۲/۱۲** · Rust: **۱۲/۱۲** (پس از تغییر نام crate) · Typecheck هر ۵ workspace ✓
- Build تولیدی: API ✓ · Desktop ✓ · Admin ✓ (exit=0)
- پیشنمایش زنده: عنوان پنجره/سایدبار/لاگین همگی PC MAX؛ ورود با شماره دمو از طریق فیلد یکپارچه ✓

### محدودیت صادقانه
- بیلد/اجرای واقعی Windows (NSIS، آیکون exe، متادیتا) فقط روی رانر ویندوز GitHub Actions ممکن است؛ workflow بهروز شده (`pcmax-windows-setup`) باید یک بار در Actions اجرا شود تا خروجی exe تأیید نهایی شود. آیکون/متادیتا از config یکسان تولید میشوند.

## 27. Universal Game Optimization + Real Email (audit 2026-08-18)

### کاتالوگ عمومی بازی
- `games.executables` / `steam_app_id` / `epic_app_id` / `launcher` در schema، فرم ادمین (کارت «Game Detection»)، و پاسخ عمومی `GameSummary`/`GameDetail` (از طریق `toSummary`) — تشخیص کاملاً داده‌محور، هیچ بازی‌ای در کامپوننت‌ها هاردکد نیست.
- مدیریت بازی‌ها در ادمین: create/edit/disable/publish از قبل موجود بود؛ فیلدهای تشخیص اضافه شد. افزودن بازی جدید بدون تغییر سورس فرانت‌اند.

### تشخیص بازی (Desktop)
- کامند Rust `detect_games(roots, known)` — اسکن با عمق محدود (root + زیرپوشه‌های مستقیم) روی Program Files + کتابخانه‌های Steam (پارس VDF، case-insensitive). نتیجه فقط (root, executable) است؛ هیچ مسیری به سرور نمی‌رود.
- `store/library.ts` (zustand + persist): ورودی manual/detected، انجمن slug بعداً، حذف، تمیزکردن. `lib/detect.ts` در مرورگر صادقانه «بدون فایل‌سیستم» برمی‌گرداند — هیچ داده جعلی‌ای.
- صفحه «My Games» (`/library`): Detect، Add Game (مسیر دستی)، وضعیت Supported/Unknown + Detected/Manual + وضعیت زنده بسته بهینه‌سازی (موجود/نصب‌شده/ندارد) با کوئری per-game کش‌شده.
- Home: هیرو بازی حذف شد؛ هیرو PC MAX (برند + Detect/Add/View) + «Your Games» داینامیک + کاتالوگ. حالت‌های ۰/۱/چند بازی تست شد (پیش‌نمایش زنده: افزودن دستی → انجمن → «Optimization available · v1.0.5»).

### ایزوله‌سازی چندبازی
- سرور: `findPackageBySlug(gameId, slug)` — بسته‌ها به بازی گره خورده‌اند؛ لیست/جزئیات/دانلود از طریق slug بازی فیلتر می‌شود (IDOR-safe).
- تست‌های رگرسیون جدید (۴): لیست per-game جدا، لوکاپ/دانلود cross-game → 404 حتی برای کاربر premium، hash و نسخه per-game مستقل.
- Rust: `safe_destination` + `apply_game_files` از قبل مسیرها را داخل gameDir قفل می‌کنند (آزمایش‌های ۱۲/۱۲ قبلی).
- **باگ تستی پیدا و رفع شد**: شماره تلفن تکراری بین دو suite باعث OTP cooldown شد؛ شماره جدید + `RATE_LIMIT_MAX=10000` فقط در هارنس تست (سوئیت >۳۰۰ ریکوئست در دقیقه از یک IP).

### ایمیل واقعی (SMTP)
- `lib/email.ts`: `MailProvider` (Console dev / SMTP با nodemailer)، لاگ امن در `email_logs` (recipient هش‌شده + mask، بدون توکن/رمز)، قالب‌های متمرکز PC MAX (Verification / Password Reset / Security / Welcome / Admin Test)، هرگز throw به caller (پیام امن عمومی).
- اعتبارنامه‌ها فقط env: `EMAIL_PROVIDER`/`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/`EMAIL_FROM`/`EMAIL_FROM_NAME`؛ startup validation (اگر `smtp` بدون creds → خطا).
- auth-user: ارسال واقعی verification/reset با لینک توکن یک‌بارمصرف `RESET_LINK_BASE_URL/reset-password?token=`؛ رمزنگاری توکن، انقضا، single-use، نرخ‌محدودیت، cooldown، decoy برای جلوگیری از enumeration، `token_version` bump هنگام reset.
- `modules/admin-email.ts`: وضعیت کانفیگ ایمیل + «Test Email» فقط برای ادمین؛ رمزها هرگز برنمی‌گردند.
- تست‌های موجود: register/login ایمیل، normalization، ایمیل تکراری، شناسه نامعتبر، reset با ایمیل + کشتن توکن قدیمی، OTP reuse رد.

### نتایج
- API: **79/79** (شامل ۴ تست جدید چندبازی) · Desktop: 12/12 · Rust: **14/14** (۲ تست جدید detection) · typecheck هر ۵ workspace ✓ · بیلد تولیدی API/Desktop/Admin ✓ (exit=0).
- پیش‌نمایش زنده تأیید شد: هیرو PC MAX، صفحه My Games (افزودن دستی → انجمن → وضعیت بسته زنده v1.0.5)، سایدبار «My Games».

### محدودیت صادقانه
- ایمیل واقعی: **NOT VERIFIED** — اعتبار SMTP واقعی در این محیط موجود نیست؛ provider با لاگ‌دهی و تست ادمین آماده است ولی ارسال به صندوق واقعی نیازمند `SMTP_*` env دارد.
- Windows build واقعی: **NOT VERIFIED** — فقط رانر ویندوز GitHub Actions؛ workflow (`pcmax-windows-setup`) آماده است.

## 28. Windows Optimizer + Premium UI (audit 2026-08-18, v0.3.0)

### Windows Optimizer (Rust core — `apps/desktop/src-tauri/src/winopt.rs`)
- **Data-driven catalog** (`catalog()`): every tweak is a `TweakDef` (id, name, description, category, risk, min Windows build, requiresAdmin/Restart, profile bitmask, typed ops). The UI renders from the catalog — no tweak logic in React.
- **Categories implemented**: Startup, Services, Gaming, Power, Visual Effects, Privacy, Cleanup (+ Process/Network/Advanced as catalog categories). 14 tweaks total; HIGH/EXPERIMENTAL (HAGS) is gated by VRAM and never applied automatically.
- **Allowlists by construction**: `RegPath::new` rejects any registry key outside the allowlist (plus hive rules: startup keys are HKCU-only, `..` segments rejected); services are a fixed 4-entry allowlist (DiagTrack/WSearch/SysMain/WMPNetworkSvc — never Defender/Firewall/Update); cleanup targets only `%TEMP%` + `C:\Windows\Temp`, with protected-root canonicalization guard; no arbitrary paths, no arbitrary service names, no arbitrary commands.
- **Transactional engine**: VALIDATE → SNAPSHOT (before-values recorded per op) → APPLY → VERIFY (re-read) → COMMIT; any write/verify failure rolls back every applied op in reverse and clears the marker. Crash marker (`.winopt-active`) written at tx start, removed at commit; `recover_interrupted()` on app startup rolls back any interrupted session automatically.
- **Snapshots**: JSON snapshot per transaction (before-values, tweak ids, verified flag) in the app-data dir; `windows_snapshots`/`windows_restore` commands; restore rolls back all recorded changes and removes the snapshot.
- **OS layer**: `OsBackend` trait — `MockOs` (in-memory, unit tests on every platform) and `RealOs` (Windows-only: allowlisted `reg`/`sc`/`powercfg` invocations + safe fs walk; PowerShell used only for the fixed battery-presence query). Non-Windows builds stub with honest "requires the packaged Windows application" errors.
- **Tauri commands**: `windows_scan`, `windows_apply`, `windows_restore`, `windows_snapshots`, `windows_recover` (+ setup-hook recovery).

### Desktop UI (premium white/crimson)
- Design tokens deepened: primary red `#C1121F`, crimson `#8B0000` accents, soft-red tint `#FDECEC`, white surfaces, `#F7F7F7` secondary, `#111111`/`#6B7280` text. Light mode only; `.bg-crimson-hero` used sparingly.
- **Navigation**: primary = Dashboard / Game Optimizer / Windows Optimizer / History / Settings; secondary = Games / Categories / Favorites / Recently Viewed / Recommended; About in footer. No technical/admin concepts in the primary nav.
- **Dashboard**: real system score (detected hardware + applied optimizations, documented model), Optimized/Needs-Attention status, OPTIMIZE NOW CTA, system overview, optimization-status cards, honest recommendations.
- **Windows Optimizer page**: score, profiles (Safe/Gaming/Competitive), recommendation list with risk/impact/restart/admin badges, categories, Smart Optimize flow (scan→analyze→backup→apply→verify), snapshot restore, recovery banner, honest "Runs on Windows" state in the browser preview.
- **History page**: unified game optimizations (applied packages) + Windows snapshots with restore.
- **i18n**: all new strings in en + fa (dashboard, winopt, history, sidebar).

### Safety / security verification
- Registry injection, arbitrary service names, arbitrary cleanup paths, and security services are all rejected by unit tests (`registry_path_allowlist_rejects_arbitrary_keys`, `service_catalog_is_allowlisted`, `engine_never_touches_security_services`, `protected_roots_are_never_cleanup_targets`).
- No user/API input ever reaches a command line; all command args are catalog constants.
- No fabricated metrics anywhere; browser preview shows honest "requires the Windows app" states.

### Tests
- Rust: **29/29** (15 new winopt tests: catalog integrity, allowlists, version gating, scan detection, transaction apply/verify/commit, failed-write rollback, interrupted-session recovery, snapshot restore round-trip, unknown-id rejection, marker lifecycle).
- API: **79/79** · Desktop: **12/12** · typecheck all 5 workspaces ✓ · production builds API/Desktop/Admin ✓.
- Live preview verified: Dashboard (score 46/Fair from detected hardware), Windows Optimizer (honest unsupported state), History (empty states), nav restructure.

### Version
- 0.2.0 → **0.3.0** (consistent across package.json, Cargo.toml, tauri.conf.json, config.ts) — Windows Optimizer + premium UI release.

### Honest limitations
- **Windows runtime NOT verified here** — this host is Linux. The Windows-only `RealOs` code paths compile and are statically validated, and the engine is fully unit-tested via `MockOs`, but actual registry/service/powercfg changes require the GitHub Actions Windows runner (`build-windows-installer` now also runs `cargo test` on Windows and inspects `PC MAX.exe` metadata — ProductName must equal "PC MAX").
