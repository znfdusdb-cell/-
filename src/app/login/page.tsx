import { loginAction } from "@/app/actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ err?: string; next?: string }> }) {
  const sp = await searchParams;
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
        {sp.err && <p className="text-sm text-stop">틀렸다.</p>}
        <button className="w-full rounded-lg bg-fg px-3 py-3 text-base font-semibold text-bg">열기</button>
      </form>
    </div>
  );
}
