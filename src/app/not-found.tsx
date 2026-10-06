import Link from "next/link";
export default function NotFound() {
  return (
    <div className="mt-16 text-center">
      <p className="text-fg-2">없는 종목이다.</p>
      <Link href="/" className="mt-3 inline-block text-sm underline">관제탑으로</Link>
    </div>
  );
}
