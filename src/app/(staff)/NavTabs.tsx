"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/nav";

export function NavTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <div className="mt-2 flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-none whitespace-nowrap rounded-lg px-2.5 py-2 text-[9.5px] font-semibold ${
              active ? "bg-gold text-[#1A140D]" : "text-text-dim"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
