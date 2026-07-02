import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getOpnameSession } from "@/lib/data";
import { approveOpname } from "@/lib/actions";
import { OpnameCountForm } from "@/components/forms/OpnameCountForm";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OpnameDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const to = await getTranslations("opname");
  const tp = await getTranslations("product");
  const data = await getOpnameSession(id);
  if (!data) notFound();

  const { session, lines } = data;
  const completed = session.status === "completed";
  const variances = lines.filter(
    (l) => l.counted_qty != null && l.variance !== 0,
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/stock-opname" className="text-muted hover:text-fg">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-fg">
            {to("title")} — {session.location_name}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {completed ? to("completed") : to("inProgress")} ·{" "}
            {session.counted_count}/{session.line_count} · {variances}{" "}
            {to("variance").toLowerCase()}
          </p>
        </div>
      </div>

      {completed ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">{tp("skuCode")}</th>
                <th className="px-4 py-3 font-medium">{tp("productName")}</th>
                <th className="px-4 py-3 text-right font-medium">{to("expected")}</th>
                <th className="px-4 py-3 text-right font-medium">{to("counted")}</th>
                <th className="px-4 py-3 text-right font-medium">{to("variance")}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.line_id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <span className="sku">{l.sku_code}</span>
                  </td>
                  <td className="px-4 py-2 text-muted">{l.product_name}</td>
                  <td className="px-4 py-2 text-right font-mono">{l.expected_qty}</td>
                  <td className="px-4 py-2 text-right font-mono">
                    {l.counted_qty ?? "—"}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2 text-right font-mono",
                      (l.variance ?? 0) === 0
                        ? "text-muted"
                        : (l.variance ?? 0) > 0
                          ? "text-success"
                          : "text-danger",
                    )}
                  >
                    {l.counted_qty == null
                      ? "—"
                      : (l.variance ?? 0) > 0
                        ? `+${l.variance}`
                        : l.variance}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <OpnameCountForm sessionId={id} lines={lines} />
          <form
            action={approveOpname}
            className="rounded-xl border border-border bg-surface p-4"
          >
            <input type="hidden" name="session_id" value={id} />
            <input type="hidden" name="locale" value={locale} />
            <p className="mb-3 text-sm text-muted">{to("approveHint")}</p>
            <button
              type="submit"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90"
            >
              {to("approve")}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
