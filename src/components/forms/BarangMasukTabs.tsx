"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useTranslations } from "next-intl";
import { PenLine, FileSpreadsheet, QrCode } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { StockInForm } from "@/components/forms/StockInForm";
import { PackingListImport } from "@/components/import/PackingListImport";
import { cn } from "@/lib/utils";

type Opt = { variant_id: string; sku_code: string; product_name: string };
type Loc = { location_id: string; name: string };

const triggerCls = cn(
  "inline-flex items-center gap-2 border-b-2 px-1 pb-2 text-sm font-medium transition-colors",
  "border-transparent text-muted hover:text-fg",
  "data-[state=active]:border-accent data-[state=active]:text-fg",
);

export function BarangMasukTabs({
  skus,
  locations,
}: {
  skus: Opt[];
  locations: Loc[];
}) {
  const tf = useTranslations("form");
  const ti = useTranslations("import");
  const td = useTranslations("dashboard");

  return (
    <Tabs.Root defaultValue="manual">
      <Tabs.List className="mb-5 flex items-center gap-5 border-b border-border">
        <Tabs.Trigger value="manual" className={triggerCls}>
          <PenLine size={15} />
          {tf("manualEntry")}
        </Tabs.Trigger>
        <Tabs.Trigger value="packing" className={triggerCls}>
          <FileSpreadsheet size={15} />
          {ti("tabImport")}
        </Tabs.Trigger>
        <Link
          href="/scan"
          className="ml-auto inline-flex items-center gap-1.5 pb-2 text-sm text-muted transition-colors hover:text-fg"
        >
          <QrCode size={15} />
          {td("scanQR")}
        </Link>
      </Tabs.List>

      <Tabs.Content value="manual" className="max-w-xl focus:outline-none">
        <StockInForm skus={skus} locations={locations} />
      </Tabs.Content>
      <Tabs.Content value="packing" className="focus:outline-none">
        <PackingListImport skus={skus} locations={locations} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
