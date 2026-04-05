import type { Metadata } from "next";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import "./globals.css";

export const metadata: Metadata = {
  title: "EUTA KHABAR",
  description:
    "Nepal's boldest news aggregator. Politics, sports, culture — updated every 30 minutes.",
  metadataBase: new URL("https://eutakhabar.com"),
  openGraph: {
    title: "EUTA KHABAR",
    description: "Nepal Ko Khabar. Unfiltered.",
    url: "https://eutakhabar.com",
    siteName: "Euta Khabar",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "EUTA KHABAR",
    description: "Nepal Ko Khabar. Unfiltered.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";

  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">
        <GoogleAnalytics measurementId={gaMeasurementId} />
        <div className="max-w-[700px] mx-auto px-4 py-4">
          {children}
        </div>
      </body>
    </html>
  );
}
