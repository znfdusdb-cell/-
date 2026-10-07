import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-dvh grid place-items-center p-6 text-center">
      <div>
        <div className="text-5xl">🙈</div>
        <p className="mt-2 text-fg-2">없는 페이지예요</p>
        <Link href="/" className="btn btn-red mt-4">홈으로</Link>
      </div>
    </div>
  );
}
