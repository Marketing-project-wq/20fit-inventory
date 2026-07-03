"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useTranslations } from "next-intl";
import { Package, MapPin, UserCog, Users } from "lucide-react";
import { SkuManager } from "./SkuManager";
import { LocationManager } from "./LocationManager";
import { StaffManager } from "./StaffManager";
import { AccountPanel } from "./AccountPanel";
import type { SkuAdmin, LocationAdmin, StaffMember, StaffRole } from "@/lib/data";
import { cn } from "@/lib/utils";

type Opt = { id: string; name: string };

const triggerCls = cn(
  "inline-flex items-center gap-2 border-b-2 px-1 pb-2 text-sm font-medium transition-colors",
  "border-transparent text-muted hover:text-fg",
  "data-[state=active]:border-accent data-[state=active]:text-fg",
);

export function SettingsTabs({
  skus,
  locations,
  categories,
  brands,
  staff,
  canManageStaff,
  email,
  role,
}: {
  skus: SkuAdmin[];
  locations: LocationAdmin[];
  categories: Opt[];
  brands: Opt[];
  staff: StaffMember[];
  canManageStaff: boolean;
  email: string;
  role: StaffRole | null;
}) {
  const t = useTranslations("settings");

  return (
    <Tabs.Root defaultValue="sku">
      <Tabs.List className="mb-5 flex flex-wrap gap-5 border-b border-border">
        <Tabs.Trigger value="sku" className={triggerCls}>
          <Package size={15} />
          {t("tabSku")}
        </Tabs.Trigger>
        <Tabs.Trigger value="location" className={triggerCls}>
          <MapPin size={15} />
          {t("tabLocation")}
        </Tabs.Trigger>
        <Tabs.Trigger value="staff" className={triggerCls}>
          <Users size={15} />
          {t("tabStaff")}
        </Tabs.Trigger>
        <Tabs.Trigger value="account" className={triggerCls}>
          <UserCog size={15} />
          {t("tabAccount")}
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="sku" className="focus:outline-none">
        <SkuManager skus={skus} categories={categories} brands={brands} />
      </Tabs.Content>
      <Tabs.Content value="location" className="focus:outline-none">
        <LocationManager locations={locations} />
      </Tabs.Content>
      <Tabs.Content value="staff" className="focus:outline-none">
        <StaffManager staff={staff} canManage={canManageStaff} />
      </Tabs.Content>
      <Tabs.Content value="account" className="focus:outline-none">
        <AccountPanel email={email} role={role} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
