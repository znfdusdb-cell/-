import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, toPublic } from "@/lib/current-user";
import { Shell } from "@/components/Shell";
import { SupportChat } from "@/components/SupportChat";

export const dynamic = "force-dynamic";

/** 사용자: 개발자에게 문의·오류 신고 */
export default async function SupportPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <Shell user={toPublic(user)} title="개발자 문의" right={<Link href="/me">내 정보</Link>}>
      <SupportChat isAdmin={false} />
    </Shell>
  );
}
