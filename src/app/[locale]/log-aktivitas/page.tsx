import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { getAuditLogs, AUDIT_PAGE_SIZE, type AuditLogFilters } from "@/lib/data";
import { ActivityLogView } from "@/components/activity-log/ActivityLogView";

export const dynamic = "force-dynamic";

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    module?: string;
    user?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const td = await getTranslations("dashboard");

  const filters: AuditLogFilters = {
    search: sp.search?.trim() || undefined,
    module: sp.module || undefined,
    user: sp.user?.trim() || undefined,
    from: sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : undefined,
    to: sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : undefined,
  };
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);

  const result = await getAuditLogs(filters, page);

  if (!result) {
    const t = await getTranslations("activityLog");
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight text-fg">{t("title")}</h1>
        <div className="flex items-start gap-3 rounded-xl border border-border bg-accent-dim/40 p-4">
          <Info className="mt-0.5 shrink-0 text-accent" size={18} />
          <p className="text-sm text-fg/90">{td("connectNotice")}</p>
        </div>
      </div>
    );
  }

  return (
    <ActivityLogView
      rows={result.rows}
      total={result.total}
      page={page}
      pageSize={AUDIT_PAGE_SIZE}
      filters={filters}
    />
  );
}
