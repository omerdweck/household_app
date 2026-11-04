"use client";

import { useState } from "react";

// Two taps instead of a browser confirm() dialog.
export function DeleteButton({ action }: { action: () => Promise<void> }) {
  const [armed, setArmed] = useState(false);
  return (
    <form action={action}>
      {armed ? (
        <div className="flex gap-2">
          <button className="flex-1 rounded-xl bg-danger py-2.5 font-semibold text-white">כן, למחוק</button>
          <button type="button" onClick={() => setArmed(false)} className="rounded-xl border border-border px-4">
            ביטול
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setArmed(true)} className="w-full py-2 text-sm text-danger">
          מחיקת ההוצאה
        </button>
      )}
    </form>
  );
}
