# استقرار روی سرور (VPS + aaPanel)

مهاجرت از کامپیوتر خانگی به سرور اختصاصی. دامنه: `pc-maxapp.rixy.ir`

> ⚠️ **رمزهای فعلی را دوباره استفاده نکن.** رمزهای سرور قدیمی و پنل در گفتگو رد و بدل
> شده‌اند. برای سرور جدید همه را از نو بساز (دستورش در گام ۳ هست).

---

## معماری

```
اینترنت → Nginx (aaPanel, SSL)  →  127.0.0.1:4000  →  کانتینر api
                                                        ├─ postgres (127.0.0.1:5432)
                                                        └─ redis    (127.0.0.1:6379)
```
هیچ‌کدام از سرویس‌ها مستقیم روی اینترنت باز نیستند؛ فقط Nginx بیرون را می‌بیند.

> `docker-compose.yml` سرویس `minio` هم دارد، ولی `STORAGE_DRIVER=local` است و
> استفاده نمی‌شود. برای صرفه‌جویی در رم می‌توانی با
> `docker compose up -d --build api` فقط سرویس‌های لازم را بالا بیاوری.

---

## گام ۱ — DNS

در پنل دامنه (rixy.ir) یک رکورد بساز:

| نوع | نام | مقدار |
|-----|-----|-------|
| A | `pc-maxapp` | `31.57.63.253` |

قبل از ادامه صبر کن تا پخش شود:
```bash
dig +short pc-maxapp.rixy.ir
```
باید IP سرور را برگرداند.

---

## گام ۲ — نصب Docker روی سرور

از طریق SSH یا ترمینال aaPanel:
```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker compose version
```

---

## گام ۳ — کد و رمزها

```bash
mkdir -p /www/pcmax && cd /www/pcmax
git clone https://github.com/DLSDT/pc-max.git .
cd infrastructure
```

رمزهای **جدید** بساز (هیچ‌کدام را جایی کپی نکن):
```bash
cat > .env <<EOF
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
DOWNLOAD_SIGNING_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)

ADMIN_BOOTSTRAP_EMAIL=admin@pc-maxapp.rixy.ir
ADMIN_BOOTSTRAP_PASSWORD=$(openssl rand -base64 18)

PUBLIC_API_URL=https://pc-maxapp.rixy.ir
RESET_LINK_BASE_URL=https://pc-maxapp.rixy.ir
CORS_ORIGINS=https://pc-maxapp.rixy.ir,tauri://localhost,http://tauri.localhost,https://tauri.localhost

EMAIL_PROVIDER=smtp
EMAIL_FROM=PC MAX <YOUR_GMAIL@gmail.com>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=YOUR_GMAIL@gmail.com
SMTP_PASSWORD=YOUR_NEW_APP_PASSWORD

ZARINPAL_CALLBACK_BASE_URL=https://pc-maxapp.rixy.ir
RATE_LIMIT_MAX=1500
EOF
chmod 600 .env
```
سپس مقادیر `YOUR_...` را با ایمیل و App Password جدید جایگزین کن.

رمز ادمین را یک‌بار ببین و جای امن ذخیره کن:
```bash
grep ADMIN_BOOTSTRAP_PASSWORD .env
```

---

## گام ۴ — بالا آوردن سرویس‌ها

```bash
docker compose up -d --build
docker compose ps
curl -s localhost:4000/api/v1/health
```
باید `{"status":"ok",...}` بدهد.

---

## گام ۵ — Nginx و SSL در aaPanel

1. **Website → Add site** → دامنه: `pc-maxapp.rixy.ir` (بدون PHP/دیتابیس)
2. روی سایت → **SSL** → **Let's Encrypt** → صادر کن و **Force HTTPS** را روشن کن
3. روی سایت → **Reverse proxy** → افزودن:
   - Proxy name: `api`
   - Target URL: `http://127.0.0.1:4000`
   - Send domain: `$host`

در تنظیمات پیشرفته‌ی همان reverse proxy این‌ها را اضافه کن (برای آپلود فایل پکیج‌ها):
```nginx
client_max_body_size 200m;
proxy_read_timeout 300s;
```

تست از بیرون:
```bash
curl -s https://pc-maxapp.rixy.ir/api/v1/health
```

---

## گام ۶ — انتقال داده‌ها

**روی کامپیوتر خانگی** (سرور قدیم) خروجی بگیر:
```bash
cd ~/Desktop/game-optimization-hub/infrastructure
sg docker -c "docker compose exec api node apps/api/dist/scripts/backup-db.js /tmp/migrate.json"
sg docker -c "docker cp goh-api:/tmp/migrate.json ~/pcmax-migrate.json"

# فایل‌های آپلودشده
sg docker -c "docker cp goh-api:/app/uploads ~/pcmax-uploads"
tar -czf ~/pcmax-uploads.tar.gz -C ~ pcmax-uploads
```

به سرور جدید منتقل کن:
```bash
scp ~/pcmax-migrate.json ~/pcmax-uploads.tar.gz root@31.57.63.253:/www/pcmax/
```

**روی سرور جدید** بازیابی کن. اسکریپت‌ها داخل خود ایمیج هستند، پس نیازی به
نصب Node روی سرور نیست:
```bash
cd /www/pcmax
docker cp pcmax-migrate.json goh-api:/tmp/migrate.json
docker compose exec api node apps/api/dist/scripts/restore-db.js /tmp/migrate.json --force

tar -xzf pcmax-uploads.tar.gz
docker cp pcmax-uploads/. goh-api:/app/uploads/
```

بررسی:
```bash
curl -s "https://pc-maxapp.rixy.ir/api/v1/games?limit=1" | head -c 120
```
باید `"total":313` را ببینی.

---

## گام ۷ — سوئیچ کردن برنامه به دامنه‌ی جدید

**فقط بعد از اینکه گام ۶ جواب داد.** در گیت‌هاب:

`Settings → Secrets and variables → Actions` → مقدار `VITE_API_URL` را بگذار:
```
https://pc-maxapp.rixy.ir/api/v1
```

سپس در کد (من انجام می‌دهم، فقط بگو):
- `apps/desktop/src/lib/config.ts` — آدرس پیش‌فرض
- `apps/desktop/src-tauri/tauri.conf.json` — آدرس به‌روزرسانی خودکار
- `.github/workflows/build-windows.yml` — پیش‌فرض

بعد یک بیلد جدید ویندوز بگیر.

> نسخه‌های نصب‌شده‌ی قبلی همچنان به دامنه‌ی قدیمی وصل می‌شوند. تا وقتی همه
> آپدیت نشده‌اند، سرور خانگی را خاموش نکن — یا روی همان دامنه‌ی قدیمی یک
> ریدایرکت به سرور جدید بگذار.

---

## گام ۸ — بکاپ خودکار

```bash
mkdir -p /www/pcmax-backups
crontab -e
```
این خط را اضافه کن (هر شب ساعت ۳):
```
0 3 * * * cd /www/pcmax/apps/api && DATABASE_URL="postgres://goh:NEW_PASSWORD@127.0.0.1:5432/goh" /usr/bin/npx tsx src/scripts/backup-db.ts /www/pcmax-backups/db-$(date +\%F).json && find /www/pcmax-backups -name 'db-*.json' -mtime +30 -delete
```

---

## گام ۹ — سخت‌سازی

```bash
# فقط SSH و وب باز باشد
ufw allow OpenSSH && ufw allow 80 && ufw allow 443
ufw allow 31585   # پنل aaPanel
ufw --force enable
```

در aaPanel: **Security** → رمز پنل را عوض کن (رمز فعلی در گفتگو لو رفته).

---

## راه برگشت

اگر چیزی خراب شد، سرور خانگی هنوز کار می‌کند — فقط DNS را برگردان.
داده‌ها هم در فایل `pcmax-migrate.json` سالم هستند.
