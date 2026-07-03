import { Logo20FIT } from "@/components/layout/Logo20FIT";

/**
 * Centered card layout shared by the sign-in, forgot-password and reset-password
 * screens. Sits on the app's gradient background (from globals.css) with the
 * 20FIT wordmark as the hero and a glass surface for the form.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 flex flex-col items-center text-center">
          <Logo20FIT height={38} />
          {title && (
            <h1 className="mt-6 text-xl font-bold tracking-tight text-fg">
              {title}
            </h1>
          )}
          {subtitle && (
            <p className="mt-1.5 max-w-xs text-sm text-muted">{subtitle}</p>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6">
          {children}
        </div>

        {footer && (
          <div className="mt-5 text-center text-sm text-muted">{footer}</div>
        )}
      </div>
    </div>
  );
}
