import { getTranslations } from "next-intl/server";
import { format } from "date-fns";
import { Info, DoorOpen, LogOut, Clock } from "lucide-react";
import { getAccessLogs, getLocations } from "@/lib/data";
import { checkOutAccess } from "@/lib/actions";
import { CheckInForm } from "@/components/access/CheckInForm";

export const dynamic = "force-dynamic";

function fmtDuration(ms: number, h: string, m: string): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  if (totalMin < 1) return `<1${m}`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return hours === 0 ? `${mins}${m}` : `${hours}${h} ${mins}${m}`;
}

export default async function AksesGudangPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("access");
  const td = await getTranslations("dashboard");

  const logs = await getAccessLogs(100);
  const locations = (await getLocations()) ?? [];
  const now = Date.now();
  const hShort = t("hoursShort");
  const mShort = t("minutesShort");

  const open = logs?.filter((l) => !l.check_out_at) ?? [];
  const history = logs?.filter((l) => l.check_out_at) ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-fg">
        {t("warehouseAccessLog")}
      </h1>

      {!logs ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-accent-dim/40 p-4">
          <Info className="mt-0.5 shrink-0 text-accent" size={18} />
          <p className="text-sm text-fg/90">{td("connectNotice")}</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
          {/* Check-in */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-muted">{t("newVisit")}</h2>
            <CheckInForm locations={locations} />
          </div>

          {/* Currently inside + history */}
          <div className="space-y-6">
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted">
                <DoorOpen size={15} className="text-accent" />
                {t("currentlyInside")}
                {open.length > 0 && (
                  <span className="rounded-full bg-accent-dim px-2 py-0.5 text-xs font-medium text-accent">
                    {open.length}
                  </span>
                )}
              </h2>

              {open.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {open.map((l) => (
                    <div
                      key={l.log_id}
                      className="rounded-xl border border-border bg-surface p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-fg">
                            {l.visitor_name ?? "—"}
                          </div>
                          {l.purpose && (
                            <div className="truncate text-xs text-muted">
                              {l.purpose}
                            </div>
                          )}
                        </div>
                        <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
                          {t("inside")}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                        <Clock size={12} className="shrink-0" />
                        <span>{format(new Date(l.check_in_at), "dd MMM HH:mm")}</span>
                        <span className="text-dim">·</span>
                        <span>
                          {fmtDuration(
                            now - new Date(l.check_in_at).getTime(),
                            hShort,
                            mShort,
                          )}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-dim">{l.location_name}</div>
                      <form action={checkOutAccess} className="mt-3">
                        <input type="hidden" name="log_id" value={l.log_id} />
                        <input type="hidden" name="locale" value={locale} />
                        <button className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-sm font-medium text-fg transition-colors hover:border-accent hover:bg-surface-2">
                          <LogOut size={14} />
                          {t("checkOut")}
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-surface py-8 text-center text-sm text-muted">
                  {t("noneInside")}
                </div>
              )}
            </div>

            {/* History */}
            <div>
              <h2 className="mb-3 text-sm font-semibold text-muted">{t("history")}</h2>
              <div className="overflow-x-auto rounded-xl border border-border">
                {history.length > 0 ? (
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="bg-surface-2 text-left text-xs text-muted">
                      <tr>
                        <th className="px-3 py-2 font-medium">{t("visitor")}</th>
                        <th className="px-3 py-2 font-medium">{t("purpose")}</th>
                        <th className="px-3 py-2 font-medium">{t("enterTime")}</th>
                        <th className="px-3 py-2 font-medium">{t("exitTime")}</th>
                        <th className="px-3 py-2 text-right font-medium">
                          {t("duration")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((l) => (
                        <tr key={l.log_id} className="border-t border-border">
                          <td className="px-3 py-2 text-fg">
                            {l.visitor_name ?? "—"}
                            <span className="ml-2 text-xs text-dim">
                              {l.location_name}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-muted">{l.purpose ?? "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-muted">
                            {format(new Date(l.check_in_at), "dd MMM HH:mm")}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-muted">
                            {l.check_out_at
                              ? format(new Date(l.check_out_at), "dd MMM HH:mm")
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs">
                            {l.check_out_at
                              ? fmtDuration(
                                  new Date(l.check_out_at).getTime() -
                                    new Date(l.check_in_at).getTime(),
                                  hShort,
                                  mShort,
                                )
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-8 text-center text-sm text-muted">
                    {t("noHistory")}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
