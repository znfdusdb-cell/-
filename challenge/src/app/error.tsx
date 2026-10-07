"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-dvh grid place-items-center p-6 text-center">
      <div className="card p-6 max-w-sm">
        <div className="text-4xl">⚠️</div>
        <p className="mt-2 font-semibold">문제가 생겼어요</p>
        <p className="text-xs text-fg-2 mt-1 break-all">{error.message}</p>
        <button className="btn btn-red mt-4 w-full" onClick={reset}>다시 시도</button>
      </div>
    </div>
  );
}
