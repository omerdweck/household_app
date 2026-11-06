# משק הבית

אפליקציה לניהול משק בית זוגי: הוצאות משני הבנקים וכרטיסי האשראי, חלוקת הוצאות בין בני הזוג, תקציב חודשי, חשבונות דירה, לו״ז משותף ורשימת קניות.
רצה כ-PWA על הטלפון (מותקנת מהדפדפן, בלי App Store).

**Stack:** Next.js 15 (App Router, TypeScript, Tailwind) · Supabase (PostgreSQL + Auth + RLS) · Vercel · AWS (Worker, משלב 3)

מעקב אחר הפרויקט: [`docs/PROJECT_TRACKER.md`](docs/PROJECT_TRACKER.md)

---

## מבנה

```
src/
  app/
    (app)/                 כל הדפים שדורשים התחברות, עם ניווט תחתון
      page.tsx             דף הבית
      accounts/            "החשבונות שלי": בנקים וכרטיסי אשראי
      transactions/        הוצאות: רשימה חודשית, הוספה, עריכה וחלוקה
      import/              ייבוא קבצי Excel מהבנק / מקס, עם ביטול ייבוא
      summary/             סיכום חודשי: מי נושא במה, דירה מול אישי, קטגוריות, מגמה
    login/                 התחברות עם Google
    auth/callback/         Google מחזיר לכאן → יצירת session
    auth/signout/          יציאה (POST בלבד)
    not-allowed/           חשבון שלא ברשימת בני הבית
    manifest.ts            PWA manifest
  lib/supabase/            לקוחות Supabase: דפדפן, שרת, middleware
  lib/money.ts             חישובי חלוקה באגורות שלמות (עם בדיקות)
  lib/import/              קריאת קבצי ייצוא, סיווג, טביעות אצבע (עם בדיקות)
  lib/stats.ts             חישובי הדשבורד (עם בדיקות)
  components/charts/       גרפים (SVG/HTML, בלי ספרייה חיצונית)
  lib/household.ts         המשתמש המחובר ובן/בת הזוג
  middleware.ts            רענון session + הפניה ל-/login
supabase/
  migrations/              שינויי מסד נתונים, לפי הסדר
  tests/                   בדיקות SQL ל-RLS ולכללי החלוקה
scripts/test-db.sh         מריץ את המיגרציות והבדיקות על PostgreSQL מקומי
```

---

## הקמה (פעם אחת)

### 1. Supabase

1. ב-[supabase.com](https://supabase.com) ← New project. אזור: **Central EU (Frankfurt)** (אין אזור בישראל).
2. SQL Editor ← להריץ לפי הסדר את הקבצים ב-`supabase/migrations/`. כל מיגרציה חדשה שנוספת ל-repo צריך להריץ שם לפני שדוחפים את הקוד שמשתמש בה.
3. להוסיף את שני בני הבית (רק מי שכאן יוכל להתחבר):
   ```sql
   insert into public.members (email, display_name) values
     ('omer.example@gmail.com', 'עומר'),
     ('partner.example@gmail.com', 'שם בת הזוג');
   ```
   המייל באותיות קטנות, בדיוק כמו חשבון ה-Google.

### 2. התחברות עם Google

1. [Google Cloud Console](https://console.cloud.google.com) ← APIs & Services ← Credentials ← **OAuth client ID** (Web application).
2. Authorized redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`
3. ב-Supabase: Authentication ← Sign In / Providers ← **Google** ← להדביק Client ID ו-Client Secret.
4. Authentication ← URL Configuration:
   - Site URL: כתובת האתר ב-Vercel
   - Redirect URLs: `http://localhost:3000/auth/callback` ו-`https://<your-app>.vercel.app/auth/callback`

> **"Allow new users to sign up" נשאר מופעל.** השער הוא trigger במסד הנתונים שדוחה כל מייל שלא בטבלת `members`. אם מכבים הרשמה, גם בני הבית לא יוכלו להתחבר בפעם הראשונה דרך Google.

### 3. הרצה מקומית

```bash
cp .env.example .env.local     # למלא URL ו-Publishable key מ-Supabase → Project Settings → API Keys
npm install
npm run dev                    # http://localhost:3000
```

### 4. פריסה ל-Vercel

1. [vercel.com](https://vercel.com) ← Add New Project ← לבחור את ה-repo.
2. Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Deploy. כל push ל-`main` יפרוס מחדש אוטומטית.

### 5. התקנה בטלפון

- **iPhone:** Safari ← לפתוח את האתר ← שיתוף ← "הוסף למסך הבית".
- **Android:** Chrome ← תפריט ← "התקן אפליקציה".

---

## בדיקות

```bash
npm run lint
npm run typecheck
npm test             # בדיקות יחידה (חישובי חלוקה, תאריכים)
npm run test:db      # מיגרציות + בדיקות RLS וחלוקה על PostgreSQL מקומי (דורש PostgreSQL 15+)
```

אותן בדיקות רצות ב-GitHub Actions על כל push.

---

## אבטחה בקצרה

- **RLS על כל טבלה.** רק משתמש מחובר שנמצא ב-`members` רואה שורות. טבלה בלי policy חסומה.
- **שער הרשמה במסד.** חשבון Google שלא ברשימה נדחה לפני שנוצר משתמש.
- **המפתח הציבורי (publishable) חשוף בכוונה.** מפתח ה-`service_role` לא נכנס לאתר לעולם.
- **לא נשמרים** מספרי כרטיס, מספרי חשבון, תעודות זהות או סיסמאות לבנקים.
