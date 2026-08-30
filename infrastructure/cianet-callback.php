<?php
/**
 * Payment-callback bridge for a cPanel host.
 *
 * Only needed when the gateway insists the callback lives on the domain its
 * merchant was verified against, while the API lives somewhere else. Shared
 * hosting has no nginx to configure and often no mod_proxy either, so this
 * does the same job in the one language such a host always has.
 *
 * Install: upload as  public_html/pcmax/api/v1/payments/zibal/callback/index.php
 * and set on the API server:
 *
 *   PAYMENT_CALLBACK_BASE_URL=https://cianet.ir/pcmax
 *
 * The API then builds .../pcmax/api/v1/payments/zibal/callback and the gateway
 * returns the user here.
 *
 * This calls the API server-side rather than redirecting the browser, for two
 * reasons: the subscription is activated even if the user closes the tab the
 * moment they are redirected, and the person never sees a raw JSON body.
 */

// Must match the provider segment this file is installed under.
const PROVIDER = 'zibal';
const API_BASE = 'https://pc-maxapp.rixy.ir/api/v1';

$query = $_SERVER['QUERY_STRING'] ?? '';
$target = API_BASE . '/payments/' . PROVIDER . '/callback' . ($query !== '' ? '?' . $query : '');

// A POST callback (IDPay) carries its result in the body; a GET one (Zibal)
// in the query string. Forward whichever arrived, unchanged.
$isPost = ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';
$rawBody = $isPost ? file_get_contents('php://input') : null;

$ch = curl_init($target);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
]);
if ($isPost) {
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $rawBody);
}
$body = curl_exec($ch);
$netError = curl_error($ch);
curl_close($ch);

$result = $body === false ? null : json_decode($body, true);
$ok = is_array($result) && !empty($result['ok']);

// The gateway has already taken the money by this point. If the API could not
// be reached, saying "payment failed" would be wrong and would send the user
// to complain about a charge that did go through — so the two cases are
// worded differently on purpose.
$unreachable = $body === false || $result === null;

http_response_code($ok ? 200 : ($unreachable ? 502 : 400));
header('Content-Type: text/html; charset=utf-8');
?>
<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PC MAX — نتیجهٔ پرداخت</title>
<style>
  body { font-family: system-ui, "Segoe UI", Tahoma, sans-serif; background:#0f1115; color:#e6e8ee;
         display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
  .card { background:#171a21; border:1px solid #262a35; border-radius:14px; padding:32px 28px;
          max-width:440px; width:calc(100% - 32px); text-align:center; }
  h1 { font-size:1.15rem; margin:0 0 10px; }
  p { color:#9aa3b2; line-height:1.9; margin:0; font-size:.95rem; }
  .ok { color:#34d399; } .bad { color:#f87171; } .warn { color:#fbbf24; }
  .mark { font-size:2.4rem; line-height:1; margin-bottom:14px; }
</style>
</head>
<body>
  <div class="card">
<?php if ($ok): ?>
    <div class="mark ok">✓</div>
    <h1 class="ok">پرداخت انجام شد</h1>
    <p>اشتراک شما فعال شد. به برنامهٔ PC MAX برگردید؛ اگر بلافاصله فعال ندیدید،
       یک بار خارج و دوباره وارد شوید.</p>
<?php elseif ($unreachable): ?>
    <div class="mark warn">!</div>
    <h1 class="warn">نتیجه هنوز مشخص نیست</h1>
    <p>پرداخت شما ثبت شده ولی تأییدش به سرور نرسید. مبلغ کم نمی‌شود یا برمی‌گردد.
       لطفاً چند دقیقه بعد برنامه را باز کنید و اگر اشتراک فعال نشده بود با
       پشتیبانی تماس بگیرید.</p>
<?php else: ?>
    <div class="mark bad">✕</div>
    <h1 class="bad">پرداخت تأیید نشد</h1>
    <p><?= htmlspecialchars($result['message'] ?? 'تراکنش کامل نشد.', ENT_QUOTES, 'UTF-8') ?></p>
    <p>اگر مبلغی از حساب شما کسر شده، طی ۷۲ ساعت به‌صورت خودکار برمی‌گردد.</p>
<?php endif; ?>
  </div>
</body>
</html>
