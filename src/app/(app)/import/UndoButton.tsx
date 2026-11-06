"use client";

import { useState } from "react";

// Two taps, no browser dialog. Undo deletes every row this import added.
export function UndoButton({ action, count }: { action: () => Promise<void>; count: number }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button onClick={() => setArmed(true)} className="shrink-0 text-xs text-muted underline">
        ביטול ייבוא
      </button>
    );
  }
  return (
    <form action={action} className="flex shrink-0 gap-2">
      <button className="rounded-lg bg-danger px-2 py-1 text-xs font-semibold text-white">למחוק {count}</button>
      <button type="button" onClick={() => setArmed(false)} className="text-xs text-muted">
        לא
      </button>
    </form>
  );
}
