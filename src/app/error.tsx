"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mt-16 space-y-3 text-center">
      <p className="font-semibold">화면을 못 그렸다.</p>
      <p className="text-sm text-fg-2">서버 로그엔 원인이 있는데 여기선 가려진다. <a className="underline" href="/health">/health</a> 를 열면 DB 연결 상태가 보인다.</p>
      {error.digest && <p className="num text-[11px] text-fg-3">digest {error.digest}</p>}
      <button onClick={reset} className="rounded-lg border border-line px-3 py-2 text-sm">다시 시도</button>
    </div>
  );
}
