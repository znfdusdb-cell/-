"use client";

import { useState } from "react";
import { TERMS } from "@/lib/constants";

/** 쉬운 말 용어. 누르면 한 줄 설명이 열린다. */
export function Term({ k, children }: { k: keyof typeof TERMS; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const t = TERMS[k];
  return (
    <span className="relative inline">
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline border-b border-dotted border-warn text-inherit">
        {children ?? t.easy}
      </button>
      {open && (
        <span className="absolute left-0 top-full z-20 mt-1 block w-64 rounded-lg border border-line bg-bg-3 p-2 text-left text-xs font-normal text-fg shadow-lg">
          <span className="block text-warn">{t.easy} <span className="text-fg-3">= {t.pro}</span></span>
          <span className="mt-0.5 block text-fg-2">{t.desc}</span>
        </span>
      )}
    </span>
  );
}
