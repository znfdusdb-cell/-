import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser, isAdmin, toPublic } from "@/lib/current-user";
import { getRepo } from "@/lib/repo";
import { Shell } from "@/components/Shell";
import { ChallengeForm } from "@/components/ChallengeForm";

export default async function EditChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const ch = await getRepo().getChallenge(id);
  if (!ch) notFound();
  if (!isAdmin(user) && ch.created_by !== user.id) redirect(`/challenges/${id}`);
  return (
    <Shell user={toPublic(user)} title="챌린지 수정" right={<Link href={`/challenges/${id}`}>← 돌아가기</Link>}>
      <ChallengeForm challenge={ch} />
      <p className="text-xs text-fg-3 mt-3">규칙(시간대·횟수)을 바꾸면 이미 참여 중인 사람에게도 바로 적용돼요. 지난 기록은 새 규칙으로 다시 계산돼요.</p>
    </Shell>
  );
}
