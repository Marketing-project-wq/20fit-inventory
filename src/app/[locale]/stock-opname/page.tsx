import { getTranslations } from "next-intl/server";
import { format } from "date-fns";
import { Info, ClipboardCheck } from "lucide-react";
import { getSnapshot, getOpnameSessions } from "@/lib/data";
import { createOpname } from "@/lib/actions";
import { Link } from "@/i18n/navigation";
import { inputCls } from "@/components/forms/ui";

export const dynamic = "force-dynamic";

export default async function StockOpnamePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("nav");
  const to = await getTranslations("opname");
  const tc = await getTranslations("common");
  const td = await getTranslations("dashboard");
  const snap = await getSnapshot();
  const sessions = (await getOpnameSessions()) ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-fg">{t("stockOpname")}</h1>

      {!snap ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-accent-dim/40 p-4">
          <Info className="mt-0.5 shrink-0 text-accent" size={18} />
          <p className="text-sm text-fg/90">{td("connectNotice")}</p>
        </div>
      ) : (
        <>
          {/* Start a new opname */}
          <form
            action={createOpname}
            className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-5"
          >
            <input type="hidden" name="locale" value={locale} />
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">
                {tc("location")}
              </span>
              <select
                name="location_id"
                defaultValue={snap.locations[0]?.location_id ?? ""}
                className={inputCls}
              >
                {snap.locations.map((l) => (
                  <option key={l.location_id} value={l.location_id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              <ClipboardCheck size={16} />
              {to("startOpname")}
            </button>
          </form>

          {/* Sessions */}
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            {sessions.length > 0 ? (
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="px-4 py-3 font-medium">{tc("location")}</th>
                    <th className="px-4 py-3 font-medium">{tc("status")}</th>
                    <th className="px-4 py-3 font-medium">{to("progress")}</th>
                    <th className="px-4 py-3 font-medium">{tc("date")}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.session_id} className="border-b border-border last:border-0 hover:bg-surface-2">
                      <td className="px-4 py-3 text-fg">{s.location_name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            s.status === "completed"
                              ? "rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success"
                              : "rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning"
                          }
                        >
                          {s.status === "completed" ? to("completed") : to("inProgress")}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-muted">
                        {s.counted_count}/{s.line_count}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {s.started_at ? format(new Date(s.started_at), "dd MMM yyyy") : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/stock-opname/${s.session_id}`}
                          className="text-sm font-medium text-accent hover:underline"
                        >
                          {to("open")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-12 text-center text-sm text-muted">{to("noSessions")}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
