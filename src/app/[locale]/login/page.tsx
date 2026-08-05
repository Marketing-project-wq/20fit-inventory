import { setRequestLocale } from "next-intl/server";
import { LoginForm } from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; verified?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next, verified } = await searchParams;
  return (
    <LoginForm locale={locale} next={next ?? ""} verified={verified === "1"} />
  );
}
