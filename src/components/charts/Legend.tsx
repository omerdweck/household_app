import type { SeriesMember } from "./series";

// Names only, in text ink; the swatch carries the color.
export function Legend({ series }: { series: SeriesMember[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {series.map((s) => (
        <li key={s.id} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
          {s.name}
        </li>
      ))}
    </ul>
  );
}
