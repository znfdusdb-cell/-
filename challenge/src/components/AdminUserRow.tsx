"use client";

import { useActionState, useState } from "react";
import { adminUpdateUser } from "@/app/actions";
import { FormMessage, SubmitButton } from "./Form";

type Row = { id: string; username: string; display_name: string; role: string; xp: number; level: number; pushCount: number; lastLogin: string };

export function AdminUserRow({ user }: { user: Row }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(adminUpdateUser, null);
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
          <FormMessage state={state} />
        </div>
      )}
    </div>
  );
}
