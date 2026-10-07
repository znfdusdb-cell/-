import { redirect } from "next/navigation";
import { currentUser } from "@/lib/current-user";
import { LoginForm } from "@/components/LoginForm";
import { Character } from "@/components/Character";
import { InstallHint } from "@/components/InstallHint";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await currentUser();
  if (user) redirect("/");
  const { next = "/" } = await searchParams;
  return (
    <div className="mx-auto w-full max-w-md min-h-dvh px-5 pt-[max(env(safe-area-inset-top),2rem)] pb-10 flex flex-col gap-5">
      <div className="text-center">
        <div className="flex justify-center"><Character level={3} size={140} className="animate-float" /></div>
        <h1 className="font-display text-3xl mt-2">거너스 챌린지</h1>
        <p className="text-fg-2 text-sm mt-1">아스날 인사이드 톡방 · 다이어트 & 취미 인증</p>
      </div>
      <LoginForm next={next} inviteRequired={Boolean((process.env.INVITE_CODE ?? "").trim())} />
      <InstallHint />
    </div>
  );
}
