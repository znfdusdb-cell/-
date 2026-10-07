import { fmtTimeKo } from "@/lib/time";
import { levelFromXp } from "@/lib/game";
import type { Checkin, User } from "@/lib/types";

/** 갤러리 사진 1장: 사진 + 촬영 시각 + 사용자 */
export function PhotoCard({ checkin, user, url, caption }: { checkin: Checkin; user: Pick<User, "display_name" | "xp">; url: string | undefined; caption?: string }) {
  return (
    <figure className="card overflow-hidden">
      <div className="relative aspect-square bg-bg-3">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${user.display_name} ${caption ?? ""}`} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-fg-3 text-sm">사진 없음</div>
        )}
        <div className="absolute bottom-1 right-1 chip bg-black/60 text-white num">🕒 {fmtTimeKo(checkin.taken_at)}</div>
        {caption && <div className="absolute top-1 left-1 chip bg-red text-white">{caption}</div>}
      </div>
      <figcaption className="px-2.5 py-1.5 flex items-center justify-between text-xs">
        <span className="font-semibold truncate">{user.display_name}</span>
        <span className="text-gold">Lv.{levelFromXp(user.xp)}</span>
      </figcaption>
    </figure>
  );
}
