import Link from "next/link";

export default function NotAllowedPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">אין גישה</h1>
      <p className="text-muted">
        החשבון הזה לא ברשימת בני משק הבית. אם זו טעות, צריך להוסיף את כתובת המייל
        לטבלת <code>members</code>.
      </p>
      <Link href="/login" className="text-accent underline">
        חזרה להתחברות
      </Link>
    </main>
  );
}
