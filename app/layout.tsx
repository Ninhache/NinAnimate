import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nin-Animate App",
  description: "Nin-Animate",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Keep the root layout free of client components: a client/ESM reference here
  // lands in every page's graph — including the auto-generated /_not-found —
  // which makes the static export worker flakily fail ("e[o] is not a
  // function"). The Toaster is rendered inside the client page tree instead.
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
