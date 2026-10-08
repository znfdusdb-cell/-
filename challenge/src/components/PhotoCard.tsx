import { fmtTimeKo } from "@/lib/time";
import { levelFromXp } from "@/lib/game";
import { linkDomain, youtubeEmbed } from "@/lib/methods";
import type { Checkin, User } from "@/lib/types";
import { ProtectedImage } from "./ProtectedMedia";
import { DeleteCheckinButton } from "./DeleteCheckinButton";
import { CheerButton, type CheerState } from "./CheerButton";

/** 갤러리 카드 1장: 사진·녹음·링크 + 시각 + 사용자. 사진은 저장 못 하게 막는다. */
export type WeightBadge = { targetLoss: number; lost: number; ratio: number; reached: boolean };

export function PhotoCard({ checkin, user, url, caption, canDelete, progress = null, cheer = null }: { checkin: Checkin; user: Pick<User, "display_name" | "xp">; url: string | undefined; caption?: string; canDelete: boolean; progress?: WeightBadge | null; cheer?: CheerState | null }) {
  const kind = checkin.media_type;
  const embed = kind === "link" ? youtubeEmbed(checkin.link_url) : null;
  return (
    <figure className="card overflow-hidden">
      <div className="relative aspect-square bg-bg-3">
        {kind === "audio" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-3">
            <div className="text-xs font-bold text-fg-2">녹음</div>
            {url ? <audio controls controlsList="nodownload" preload="none" src={url} className="w-full" /> : <div className="text-fg-3 text-sm">없음</div>}
          </div>
        ) : kind === "link" ? (
          embed ? (
            <iframe src={embed} title="유튜브" className="absolute inset-0 w-full h-full" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen />
          ) : (
            <a href={checkin.link_url} target="_blank" rel="noreferrer noopener" className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-3 text-center">
              <div className="text-xs font-bold text-fg-2">링크</div>
              <div className="font-extrabold break-all line-clamp-2">{linkDomain(checkin.link_url)}</div>
              <div className="text-[11px] text-fg-3 break-all line-clamp-2">{checkin.link_url.replace(/^https?:\/\//, "")}</div>
            </a>
          )
        ) : url ? (
          <ProtectedImage url={url} alt={`${user.display_name} ${caption ?? ""}`} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-fg-3 text-sm">사진 없음</div>
        )}
        <div className="absolute bottom-1.5 right-1.5 chip bg-black/60 text-white num pointer-events-none">
          {kind === "camera" ? "촬영" : kind === "album" ? "앨범" : kind === "audio" ? "녹음" : "링크"} {fmtTimeKo(checkin.taken_at)}
        </div>
        {caption && <div className="absolute top-1.5 left-1.5 chip bg-white/90 text-fg pointer-events-none">{caption}</div>}
      </div>
      <figcaption className="px-2.5 py-1.5 text-xs">
        <div className="flex items-center justify-between gap-1">
          <span className="font-bold truncate">{user.display_name} <span className="text-red font-bold">Lv.{levelFromXp(user.xp)}</span></span>
          <span className="flex items-center gap-2 shrink-0">
            {cheer && <CheerButton checkinId={checkin.id} cheer={cheer} />}
            {canDelete && <DeleteCheckinButton checkinId={checkin.id} />}
          </span>
        </div>
        {progress && (
          <div className="mt-1">
            <div className="flex justify-between text-[10px] text-fg-2 num">
              <span>−{progress.targetLoss}kg 목표</span>
              <span className={progress.reached ? "text-ok font-bold" : "font-bold text-fg"}>{progress.reached ? "달성" : `${Math.round(progress.ratio * 100)}%`}</span>
            </div>
            <div className="h-1.5 rounded-full bg-bg-3 mt-0.5 overflow-hidden">
              <div className={`h-full rounded-full ${progress.reached ? "bg-ok" : "bg-red"}`} style={{ width: `${Math.max(2, progress.ratio * 100)}%` }} />
            </div>
          </div>
        )}
      </figcaption>
    </figure>
  );
}
