/** Small shared building blocks so every screen looks the same. */
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  const styles =
    variant === "primary"
      ? "bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-400"
      : "border border-zinc-700 text-zinc-200 hover:bg-zinc-800 disabled:text-zinc-600";
  return <button {...props} className={`rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${styles} ${className}`} />;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "amber" | "violet" }) {
  const tones = {
    neutral: "border-zinc-700 text-zinc-300",
    green: "border-emerald-700 text-emerald-300",
    amber: "border-amber-700 text-amber-300",
    violet: "border-violet-700 text-violet-300",
  };
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5">
      {title ? <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">{title}</h2> : null}
      {children}
    </section>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-4 rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200">
      <span>{message}</span>
      {onRetry ? (
        <button onClick={onRetry} className="shrink-0 underline underline-offset-2 hover:text-white">
          Try again
        </button>
      ) : null}
    </div>
  );
}
