"use client";

import { useActionState } from "react";
import { resolveTicket } from "@/app/actions";
import { FormMessage, SubmitButton } from "./Form";

export function ResolveTicketButton({ ticketId }: { ticketId: string }) {
  const [state, action] = useActionState(resolveTicket, null);
  return (
    <form action={action} className="mb-3">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <SubmitButton className="btn btn-ghost w-full text-sm text-ok" pendingText="처리 중…">✅ 해결 완료 (목록에서 지우기)</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
