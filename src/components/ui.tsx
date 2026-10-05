/** Small shared building blocks so every screen looks the same. */
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "quiet" }) {
  const styles = {
    primary: "bg-zinc-900 text-white hover:bg-zinc-700 disabled:bg-zinc-200 disabled:text-zinc-400",
    secondary: "border border-zinc-300 bg-white text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50 disabled:text-zinc-400",
    quiet: "text-zinc-600 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-900 disabled:text-zinc-400",
  }[variant];
  const size = variant === "quiet" ? "px-1 py-1" : "rounded-lg px-4 py-2.5";
  return <button {...props} className={`${size} text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles} ${className}`} />;
}

type Tone = "neutral" | "good" | "warn" | "ai" | "accent";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const tones: Record<Tone, string> = {
    neutral: "bg-zinc-100 text-zinc-700",
    good: "bg-emerald-50 text-emerald-800",
    warn: "bg-amber-50 text-amber-800",
    ai: "bg-violet-50 text-violet-800",
    accent: "bg-accent-soft text-accent",
  };
  return <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

/** A titled block of content. `aside` puts a short note on the right of the title. */
export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4 border-b border-zinc-200 pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">{title}</h2>
        {aside ? <span className="text-xs text-zinc-500">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

/** A bordered panel, for things that are separate from the page's main reading flow. */
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-zinc-200 bg-white p-5 ${className}`}>{children}</div>;
}

/** A form field: label above, optional hint below. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium text-zinc-800">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-zinc-500">{hint}</span> : null}
    </label>
  );
}

/** Shared look for text inputs, selects and textareas. */
export const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:bg-zinc-50";

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <span>{message}</span>
      {onRetry ? (
        <button onClick={onRetry} className="shrink-0 font-medium underline underline-offset-4 hover:text-red-950">
          Try again
        </button>
      ) : null}
    </div>
  );
}

/** A file path, shown the same way everywhere. */
export function Path({ children }: { children: ReactNode }) {
  return <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.8em] text-zinc-700">{children}</code>;
}
