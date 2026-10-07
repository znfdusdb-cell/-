"use client";

import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/app/actions";

export function SubmitButton({ children, className = "btn btn-red w-full", pendingText = "처리 중…" }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingText : children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  if (state.error) return <p className="text-sm text-bad mt-2">{state.error}</p>;
  if (state.message) return <p className="text-sm text-ok mt-2">{state.message}</p>;
  return null;
}
