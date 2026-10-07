"use client";

import { useActionState } from "react";
import { changePassword, updateDisplayName, updateGender } from "@/app/actions";
import { FormMessage, SubmitButton } from "./Form";

export function ProfileForms({ displayName, gender }: { displayName: string; gender: "m" | "f" }) {
  const [nameState, nameAction] = useActionState(updateDisplayName, null);
  const [genderState, genderAction] = useActionState(updateGender, null);
  const [pwState, pwAction] = useActionState(changePassword, null);
  return (
    <section className="card p-4 mt-3 space-y-4">
      <form action={genderAction} className="space-y-2">
        <label className="label">캐릭터</label>
        <div className="flex gap-2">
          <select name="gender" className="input" defaultValue={gender}>
            <option value="f">여</option>
            <option value="m">남</option>
          </select>
          <SubmitButton className="btn btn-ghost text-sm shrink-0">바꾸기</SubmitButton>
        </div>
        <FormMessage state={genderState} />
      </form>
      <form action={nameAction} className="space-y-2">
        <label className="label">닉네임 (갤러리·리더보드에 표시)</label>
        <div className="flex gap-2">
          <input name="display_name" className="input" defaultValue={displayName} maxLength={12} required />
          <SubmitButton className="btn btn-ghost text-sm shrink-0">바꾸기</SubmitButton>
        </div>
        <FormMessage state={nameState} />
      </form>
      <form action={pwAction} className="space-y-2">
        <label className="label">비밀번호 변경</label>
        <input name="current" type="password" className="input" placeholder="현재 비밀번호" autoComplete="current-password" required />
        <input name="next" type="password" className="input" placeholder="새 비밀번호 (4자 이상)" autoComplete="new-password" required />
        <FormMessage state={pwState} />
        <SubmitButton className="btn btn-ghost w-full text-sm">비밀번호 바꾸기</SubmitButton>
      </form>
    </section>
  );
}
