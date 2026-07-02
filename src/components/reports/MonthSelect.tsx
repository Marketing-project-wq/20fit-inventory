"use client";

import { useSearchParams } from "next/navigation";
import { useRouter, usePathname } from "@/i18n/navigation";
import { inputCls } from "@/components/forms/ui";

export function MonthSelect({
  months,
  value,
}: {
  months: string[];
  value: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  return (
    <select
      value={value}
      onChange={(e) => {
        const params = new URLSearchParams(sp.toString());
        params.set("month", e.target.value);
        params.set("tab", "monthly");
        router.push(`${pathname}?${params.toString()}`);
      }}
      className={`${inputCls} max-w-[170px]`}
    >
      {months.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </select>
  );
}
