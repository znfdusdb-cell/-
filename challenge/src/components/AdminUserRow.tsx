"use client";

import { useActionState, useState } from "react";
import { adminDeleteUser, adminUpdateUser } from "@/app/actions";
import { FormMessage, SubmitButton } from "./Form";

type Row = { id: string; username: string; display_name: string; role: string; xp: number; level: number; pushCount: number; lastLogin: string };

export function AdminUserRow({ user }: { user: Row }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(adminUpdateUser, null);
  const [delState, delAction] = useActionState(adminDeleteUser, null);
  const [confirmDel, setConfirmDel] = useState(false);
  return (
    <div className="card p-3">
      <button type="button" className="w-full flex items-center gap-3 text-left" onClick={() => setOpen((o) => !o)}>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{user.display_name} <span className="text-fg-3 text-xs">@{user.username}</span> {user.role === "admin" && <span className="chip bg-gold-soft text-gold">관리자</span>}</div>
          <div className="text-xs text-fg-2">Lv.{user.level} · {user.xp} XP · 알림 {user.pushCount} · 마지막 로그인 {user.lastLogin}</div>
        </div>
        <span className="text-fg-3">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-3 pt-3 border-t border-line space-y-3">
          <form action={action} className="flex gap-2 items-center">
            <input type="hidden" name="user_id" value={user.id} />
            <input type="hidden" name="op" value="xp" />
            <input name="delta" type="number" className="input" placeholder="경험치 ±(예: 100, -50)" required />
            <SubmitButton className="btn btn-ghost text-sm shrink-0">적용</SubmitButton>
          </form>
          <form action={action} className="flex gap-2 items-center">
            <input type="hidden" name="user_id" value={user.id} />
            <input type="hidden" name="op" value="reset_password" />
            <input name="password" className="input" placeholder="새 비밀번호 (4자 이상)" required />
            <SubmitButton className="btn btn-ghost text-sm shrink-0">초기화</SubmitButton>
          </form>
          {user.username !== "비움" && (
            <form action={action} className="flex gap-2 items-center">
              <input type="hidden" name="user_id" value={user.id} />
              <input type="hidden" name="op" value="role" />
              <input type="hidden" name="role" value={user.role === "admin" ? "member" : "admin"} />
              <SubmitButton className="btn btn-ghost text-sm w-full">{user.role === "admin" ? "관리자 해제" : "관리자로 지정"}</SubmitButton>
            </form>
          )}
          {user.username !== "비움" && (
            <form action={delAction} className="flex items-center gap-2 flex-wrap pt-2 border-t border-line">
              <input type="hidden" name="user_id" value={user.id} />
              {confirmDel ? (
                <>
                  <span className="text-xs text-bad">계정·인증·기록이 전부 지워져요. 되돌릴 수 없어요.</span>
                  <SubmitButton className="btn text-xs py-1.5 px-3 bg-bad text-white">퇴출 확정</SubmitButton>
                  <button type="button" className="text-xs text-fg-3" onClick={() => setConfirmDel(false)}>취소</button>
                </>
              ) : (
                <button type="button" className="text-xs text-bad underline" onClick={() => setConfirmDel(true)}>멤버 퇴출</button>
              )}
              <FormMessage state={delState} />
            </form>
          )}
          <FormMessage state={state} />
        </div>
      )}
    </div>
  );
}
