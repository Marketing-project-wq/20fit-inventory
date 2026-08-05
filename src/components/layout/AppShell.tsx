"use client";

import { useState } from "react";
import { usePathname } from "@/i18n/navigation";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Auth screens render full-bleed, without the sidebar/header chrome.
  const bareLayout = [
    "/login",
    "/daftar",
    "/lupa-sandi",
    "/reset-sandi",
    "/ganti-sandi",
    "/pending",
  ].includes(pathname);
  if (bareLayout) return <>{children}</>;

  return (
    <div className="flex min-h-screen">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenu={() => setOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-screen-2xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
