import { getTranslations } from "next-intl/server";
import { QrScanner } from "@/components/scan/QrScanner";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const t = await getTranslations("scan");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </div>
      <QrScanner />
    </div>
  );
}
