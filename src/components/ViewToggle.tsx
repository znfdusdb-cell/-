import { setViewAction } from "@/app/actions";
import type { ViewMode } from "@/lib/types";

export function ViewToggle({ mode, back }: { mode: ViewMode; back: string }) {
  const next = mode === "easy" ? "detail" : "easy";
  return (
    <form action={setViewAction}>
      <input type="hidden" name="mode" value={next} />
      <input type="hidden" name="back" value={back} />
      <button className="rounded-full border border-line px-2.5 py-1 text-[11px] text-fg-2 hover:text-fg">{mode === "easy" ? "자세히" : "쉽게"}</button>
    </form>
  );
}
