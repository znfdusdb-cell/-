import { loginAction, sendMagicLinkAction } from "@/app/actions";
import { authMode, allowedEmail } from "@/lib/auth";

const ERR: Record<string, string> = {
  "1": "틀렸다.",
  notallowed: "허용된 이메일이 아니다. 이 사이트는 비움 한 사람만 들어온다.",
  nocode: "링크가 깨졌다. 다시 받아라.",
  exchange: "링크가 만료됐거나 이미 썼다. 다시 받아라.",
  send: "메일 발송 실패.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ err?: string; next?: string; sent?: string; msg?: string }> }) {
  const sp = await searchParams;
  const mode = authMode();
  const mask = (e: string) => e.replace(/^(.{2}).*(@.*)$/, "$1***$2");

  if (mode === "magic") {
    return (
      <div className="mx-auto mt-16 max-w-sm">
        <h1 className="mb-1 text-lg font-semibold">잠금</h1>
        <p className="mb-5 text-sm text-fg-2">허용된 이메일({mask(allowedEmail()!)})로 로그인 링크를 보낸다. 메일의 링크를 누르면 열린다.</p>
        {sp.sent ? (
          <div className="rounded-lg border border-go/50 bg-go/10 p-3 text-sm text-go">메일을 보냈다. 받은편지함(스팸함도)에서 링크를 눌러라. 링크는 한 번만 쓸 수 있다.</div>
        ) : (
          <form action={sendMagicLinkAction} className="space-y-3">
            <input type="hidden" name="next" value={sp.next ?? "/"} />
            <input
              name="email"
              type="email"
              autoFocus
              autoComplete="email"
              className="w-full rounded-lg border border-line bg-bg-2 px-3 py-3 text-base outline-none focus:border-fg-3"
              placeholder="이메일"
            />
            {sp.err && <p className="text-sm text-stop">{ERR[sp.err] ?? sp.err}{sp.msg ? ` (${sp.msg})` : ""}</p>}
            <button className="w-full rounded-lg bg-fg px-3 py-3 text-base font-semibold text-bg">링크 보내기</button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="mb-1 text-lg font-semibold">잠금</h1>
      <p className="mb-5 text-sm text-fg-2">관제탑은 비움만 본다. 비밀번호를 넣어라.</p>
      <form action={loginAction} className="space-y-3">
        <input type="hidden" name="next" value={sp.next ?? "/"} />
        <input
          name="passcode"
          type="password"
          autoFocus
          className="w-full rounded-lg border border-line bg-bg-2 px-3 py-3 text-base outline-none focus:border-fg-3"
          placeholder="비밀번호"
        />
        {sp.err && <p className="text-sm text-stop">{ERR[sp.err] ?? sp.err}</p>}
        <button className="w-full rounded-lg bg-fg px-3 py-3 text-base font-semibold text-bg">열기</button>
      </form>
    </div>
  );
}
