/**
 * Persian labels for browse-category slugs.
 *
 * Kept out of i18n.ts because that module touches `document` at import time
 * (it paints the initial direction), which makes it unloadable in a plain
 * node test — and these labels are exactly the thing worth testing.
 *
 * Category names come from the database in English, so a fully Persian, RTL
 * Games page still listed "Action / Adventure / Racing" in its genre filter
 * and on every card. Keyed on slug rather than name so renaming a category in
 * the admin panel cannot silently break the translation.
 *
 * Unknown slugs fall back to the database name, so adding a genre server-side
 * degrades to English rather than to a blank label.
 */
const GENRE_NAMES: Record<string, Record<string, string>> = {
  fa: {
    action: 'اکشن',
    adventure: 'ماجراجویی',
    'open-world': 'جهان‌باز',
    rpg: 'نقش‌آفرینی',
    fps: 'اول‌شخص',
    shooter: 'تیراندازی',
    horror: 'ترسناک',
    platformer: 'سکوبازی',
    comedy: 'طنز',
    racing: 'مسابقه‌ای',
    sports: 'ورزشی',
    strategy: 'استراتژی',
    simulation: 'شبیه‌ساز',
    fighting: 'مبارزه‌ای',
    stealth: 'مخفی‌کاری',
    survival: 'بقا',
    'battle-royale': 'بتل رویال',
    soulslike: 'سول‌لایک',
    metroidvania: 'متروید‌ونیا',
    puzzle: 'معمایی',
  },
};

/** Descriptions for the same slugs — shown on the Categories page tiles. */
const GENRE_DESCRIPTIONS: Record<string, Record<string, string>> = {
  fa: {
    action: 'گیم‌پلی سریع با تمرکز بر مبارزه و واکنش',
    adventure: 'داستان‌محور، با کاوش و حل معما',
    'open-world': 'دنیای بزرگ و آزاد با پیشروی غیرخطی',
    rpg: 'رشد شخصیت، آمار و انتخاب‌های داستانی',
    fps: 'شوترهای اول‌شخص',
    shooter: 'بازی‌های با محوریت تیراندازی',
    horror: 'فضاسازی ترسناک و بقا',
    platformer: 'گیم‌پلی پرش و دویدن',
    comedy: 'لحن و نوشتار طنز',
    racing: 'ماشین، موتور و مسابقات حرفه‌ای',
    sports: 'فوتبال، کشتی‌کج و دیگر شبیه‌سازی‌های ورزشی',
    strategy: 'تاکتیک، ساخت‌وساز و مدیریت نیرو',
    simulation: 'شبیه‌سازی دقیق وسایل، زندگی و سیستم‌ها',
    fighting: 'مبارزه‌ی تن‌به‌تن در رینگ',
    stealth: 'دور ماندن از دید به‌جای درگیری مستقیم',
    survival: 'ساخت و ساز و زنده ماندن در شرایط سخت',
    'battle-royale': 'مسابقات چندنفره‌ی آخرین بازمانده',
    soulslike: 'مبارزه‌ی سخت مبتنی بر استقامت و طراحی دقیق مراحل',
    metroidvania: 'نقشه‌های به‌هم‌پیوسته که با توانایی‌ها باز می‌شوند',
    puzzle: 'حل مسئله‌ی منطقی و محیطی',
  },
};

/** Localized name for a browse category, falling back to the server's name. */
export function genreName(slug: string, fallback: string, lng: string): string {
  return GENRE_NAMES[lng]?.[slug] ?? fallback;
}

/** Localized description for a browse category, falling back to the server's. */
export function genreDescription(slug: string, fallback: string | null, lng: string): string | null {
  return GENRE_DESCRIPTIONS[lng]?.[slug] ?? fallback;
}
