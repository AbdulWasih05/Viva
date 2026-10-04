import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Viva: a mock interview about your own project",
  description: "Viva reads your repo, finds the parts an AI agent wrote, and interviews you about it. Powered by Gemma.",
};

// System fonts only: nothing is fetched from a font service, so the app also starts with Wi-Fi off.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
