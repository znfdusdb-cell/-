import type { Checkin } from "./types";

export type Method = Exclude<Checkin["media_type"], never>;

export const METHOD_LABEL: Record<Method, string> = { camera: "촬영", album: "앨범", audio: "녹음", link: "링크" };
export const ALL_METHODS: Method[] = ["camera", "album", "audio", "link"];

const RULES: { re: RegExp; methods: Method[] }[] = [
  { re: /소설|글쓰기|글 쓰기|에세이|일기|블로그|시 쓰기|집필|작문|독서|책|독후감|공부|영어|코딩|개발|영상|유튜브|편집|강의/, methods: ["link", "camera", "album"] },
  { re: /음악|노래|기타|피아노|악기|드럼|베이스|보컬|작곡|연주|바이올린|우쿨렐레|랩|비트/, methods: ["audio", "camera", "link"] },
  { re: /러닝|달리기|조깅|마라톤|헬스|운동|등산|자전거|라이딩|수영|요가|필라테스|산책|걷기|만보|축구|풋살|클라이밍|테니스|배드민턴|골프/, methods: ["camera", "album", "link"] },
  { re: /그림|드로잉|수채화|유화|만화|일러스트|사진|공예|뜨개|자수|요리|베이킹|커피|식물|가드닝|레고|프라모델|캘리/, methods: ["camera", "album"] },
];

/** 취미 텍스트로 어울리는 인증 방식을 고른다. 참여 때 저장되고 사용자가 바꿀 수 있다. */
export function inferMethods(hobby: string): Method[] {
  const h = hobby.replace(/\s+/g, "");
  for (const r of RULES) if (r.re.test(h)) return r.methods;
  return ["camera", "album", "link"];
}

export function normalizeMethods(list: unknown): Method[] {
  if (!Array.isArray(list)) return [];
  const out = list.filter((m): m is Method => ALL_METHODS.includes(m as Method));
  return [...new Set(out)];
}

/** YouTube 링크면 임베드 주소, 아니면 null */
export function youtubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    let id: string | null = null;
    if (u.hostname === "youtu.be") id = u.pathname.slice(1);
    else if (/(^|\.)youtube\.com$/.test(u.hostname)) {
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else if (u.pathname.startsWith("/shorts/")) id = u.pathname.split("/")[2];
      else if (u.pathname.startsWith("/embed/")) id = u.pathname.split("/")[2];
    }
    return id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  } catch {
    return null;
  }
}

export function linkDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
