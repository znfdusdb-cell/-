import type { MarketEvent } from "@/lib/types";
import { EVENT_TYPE_LABEL } from "@/lib/constants";
import { daysBetween, todayKST } from "@/lib/format";

export function UpcomingEvents({ events, names }: { events: MarketEvent[]; names: Record<string, string> }) {
  if (!events.length) return null;
  const t = todayKST();
  return (
    <section className="scroll-x -mx-4 flex gap-2 px-4">
      {events.map((e) => {
        const d = daysBetween(t, e.event_date);
        return (
          <div key={e.id} className="shrink-0 rounded-lg border border-line bg-bg-2 px-3 py-2 text-xs">
            <span className={`num font-semibold ${d <= 2 ? "text-warn" : "text-fg"}`}>D-{d}</span>
            <span className="ml-1.5 text-fg-3">{EVENT_TYPE_LABEL[e.event_type]}</span>
            <div className="text-fg-2">{e.code && !e.title.includes(names[e.code] ?? "") ? `${names[e.code] ?? e.code} · ` : ""}{e.title}</div>
          </div>
        );
      })}
    </section>
  );
}
