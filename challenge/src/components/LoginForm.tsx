"use client";

import { useActionState, useState } from "react";
import { login, signup } from "@/app/actions";
import { FormMessage, SubmitButton } from "./Form";

export function LoginForm({ next, inviteRequired }: { next: string; inviteRequired: boolean }) {
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [loginState, loginAction] = useActionState(login, null);
  const [signupState, signupAction] = useActionState(signup, null);

  return (
    <div className="card p-5">
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-bg-3 mb-4">
        {(["login", "signup"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`py-2 rounded-lg text-sm font-semibold ${tab === t ? "bg-fg text-white" : "text-fg-2"}`}>
            {t === "login" ? "로그인" : "처음이에요"}
          </button>
        ))}
      </div>

      {tab === "login" ? (
        <form action={loginAction} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <div>
            <label className="label" htmlFor="l-username">아이디</label>
            <input id="l-username" name="username" className="input" autoComplete="username" autoCapitalize="off" required />
          </div>
          <div>
            <label className="label" htmlFor="l-password">비밀번호</label>
            <input id="l-password" name="password" type="password" className="input" autoComplete="current-password" required />
          </div>
          <FormMessage state={loginState} />
          <SubmitButton className="btn btn-red w-full">들어가기</SubmitButton>
        </form>
      ) : (
        <form action={signupAction} className="space-y-3">
          <div>
            <label className="label" htmlFor="s-username">아이디 (톡방 닉네임 추천 · 2~16자)</label>
            <input id="s-username" name="username" className="input" autoComplete="username" autoCapitalize="off" required />
          </div>
          <div>
            <label className="label" htmlFor="s-password">비밀번호 (4자 이상)</label>
            <input id="s-password" name="password" type="password" className="input" autoComplete="new-password" required />
          </div>
          <div>
            <label className="label" htmlFor="s-password2">비밀번호 확인</label>
            <input id="s-password2" name="password2" type="password" className="input" autoComplete="new-password" required />
          </div>
          {inviteRequired && (
            <div>
              <label className="label" htmlFor="s-invite">초대 코드 (톡방 공지)</label>
              <input id="s-invite" name="invite" className="input" required />
            </div>
          )}
          <FormMessage state={signupState} />
          <SubmitButton className="btn btn-red w-full">가입하고 시작</SubmitButton>
        </form>
      )}
    </div>
  );
}
