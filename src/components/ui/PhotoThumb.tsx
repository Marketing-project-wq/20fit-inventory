/**
 * Small clickable thumbnail for a proof photo. The URL is a short-lived signed
 * URL generated server-side (private bucket), so this stays a plain component.
 */
export function PhotoThumb({ url, alt }: { url: string; alt: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={alt}
      className="shrink-0"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        className="h-10 w-10 rounded border border-border object-cover transition-opacity hover:opacity-80"
      />
    </a>
  );
}
