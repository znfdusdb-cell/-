/** 페이지 전환 중 즉시 보이는 자리표시자 (체감 속도) */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-md px-4 pt-6 space-y-3">
      <div className="skeleton h-7 w-40" />
      <div className="skeleton h-36 w-full" />
      <div className="skeleton h-44 w-full" />
      <div className="skeleton h-44 w-full" />
    </div>
  );
}
