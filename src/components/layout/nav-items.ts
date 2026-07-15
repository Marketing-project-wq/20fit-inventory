import {
  LayoutDashboard,
  Package,
  Boxes,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  Repeat,
  ClipboardCheck,
  DoorOpen,
  BarChart3,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  /** key under the `nav` message namespace */
  key:
    | "dashboard"
    | "products"
    | "stock"
    | "goodsIn"
    | "goodsOut"
    | "movements"
    | "transfer"
    | "stockOpname"
    | "warehouseAccess"
    | "reports"
    | "activityLog"
    | "settings";
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", key: "dashboard", icon: LayoutDashboard },
  { href: "/produk", key: "products", icon: Package },
  { href: "/stok", key: "stock", icon: Boxes },
  { href: "/barang-masuk", key: "goodsIn", icon: ArrowDownToLine },
  { href: "/barang-keluar", key: "goodsOut", icon: ArrowUpFromLine },
  { href: "/mutasi", key: "movements", icon: History },
  { href: "/transfer", key: "transfer", icon: Repeat },
  { href: "/stock-opname", key: "stockOpname", icon: ClipboardCheck },
  { href: "/akses-gudang", key: "warehouseAccess", icon: DoorOpen },
  { href: "/laporan", key: "reports", icon: BarChart3 },
  { href: "/log-aktivitas", key: "activityLog", icon: ScrollText },
  { href: "/pengaturan", key: "settings", icon: Settings },
];
