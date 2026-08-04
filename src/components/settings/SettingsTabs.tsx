"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { useTranslations } from "next-intl";
import { Package, MapPin, UserCog, Users, Contact } from "lucide-react";
import { SkuManager } from "./SkuManager";
import { LocationManager } from "./LocationManager";
import { UserManagement } from "./UserManagement";
import { SalesStaffManager } from "./SalesStaffManager";
import { AccountPanel } from "./AccountPanel";
import type {
  SkuAdmin,
  LocationAdmin,
  StaffMember,
  StaffRole,
  SalesStaff,
} from "@/lib/data";
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
  salesStaff,
  canManageStaff,
  email,
  nickname,
  role,
}: {
  skus: SkuAdmin[];
  locations: LocationAdmin[];
  categories: Opt[];
  brands: Opt[];
  staff: StaffMember[];
  salesStaff: SalesStaff[];
  canManageStaff: boolean;
  email: string;
  nickname: string | null;
  role: StaffRole | null;
}) {
  const t = useTranslations("settings");

  // Admins manage catalog / locations / users / sales staff. Everyone else only
  // gets their own Account tab (self-service: nickname + password).
  const isAdmin = canManageStaff;

  if (!isAdmin) {
    return (
      <Tabs.Root defaultValue="account">
        <Tabs.List className="mb-5 flex flex-wrap gap-5 border-b border-border">
          <Tabs.Trigger value="account" className={triggerCls}>
            <UserCog size={15} />
            {t("tabAccount")}
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="account" className="focus:outline-none">
          <AccountPanel email={email} nickname={nickname} role={role} />
        </Tabs.Content>
      </Tabs.Root>
    );
  }

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
          {t("tabUsers")}
        </Tabs.Trigger>
        <Tabs.Trigger value="salesStaff" className={triggerCls}>
          <Contact size={15} />
          {t("salesStaff")}
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
        <UserManagement staff={staff} currentUserRole={role} />
      </Tabs.Content>
      <Tabs.Content value="salesStaff" className="focus:outline-none">
        <SalesStaffManager staff={salesStaff} />
      </Tabs.Content>
      <Tabs.Content value="account" className="focus:outline-none">
        <AccountPanel email={email} nickname={nickname} role={role} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
