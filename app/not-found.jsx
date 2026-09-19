import Link from "next/link";

export const metadata = {
  title: "Page Not Found",
  description: "The page you're looking for doesn't exist or may have moved.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <section className="relative overflow-hidden bg-ink text-paper">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-blueprint-grid bg-grid opacity-50"
        style={{
          maskImage: "linear-gradient(to bottom, black, transparent 92%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black, transparent 92%)",
        }}
      />
      <div className="relative mx-auto flex min-h-[70vh] max-w-shell flex-col items-start justify-center gap-6 px-5 py-20 sm:px-8 sm:py-28">
        <span className="inline-flex w-fit items-center rounded-full border border-brass/40 bg-brass/10 px-4 py-1.5 font-serif font-semibold text-[1.14rem] text-brassdark">
          404
        </span>
        <h1 className="max-w-[18ch] text-[clamp(2rem,4.4vw,3.2rem)]">
          This page doesn&apos;t exist.
        </h1>
        <p className="max-w-[48ch] text-[1.18rem] text-paper/80">
          The link may be broken, or the page may have moved. Let&apos;s get
          you back to something real.
        </p>
        <div className="mt-4 flex flex-wrap gap-4">
          <Link href="/" className="inline-flex items-center gap-2 rounded-full bg-brass px-6 py-3.5 text-[1.09rem] font-semibold text-ink no-underline shadow-lg shadow-brass/20 transition-colors hover:bg-[#c79549]">
            Back to Home
          </Link>
          <Link href="/#contact" className="inline-flex items-center gap-2 rounded-full border border-paper/25 px-6 py-3.5 text-[1.09rem] font-semibold text-paper no-underline transition-colors hover:border-paper hover:bg-paper/5">
            Contact Us
          </Link>
        </div>
      </div>
    </section>
  );
}
