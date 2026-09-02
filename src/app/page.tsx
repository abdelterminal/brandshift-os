import Link from "next/link";

/**
 * Placeholder. The real entry point is the app shell in M3, which is
 * locale-scoped and lands people on Today.
 */
export default function Home() {
  return (
    <main className="bg-surface-base flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <h1 className="text-display font-display text-fg-default">BrandShift OS</h1>
        <p className="text-fg-muted mt-3 text-body-lg">
          Foundation and design system are in place. The shell, auth, and the first vertical
          slice come next.
        </p>
        <Link
          href="/design"
          className="bg-accent text-accent-fg text-label hover:bg-accent-hover active:bg-accent-active focus-visible:outline-focus-ring mt-6 inline-flex rounded-control px-3.5 py-2.5 transition-colors duration-[var(--duration-fast)] focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Design system reference
        </Link>
      </div>
    </main>
  );
}
