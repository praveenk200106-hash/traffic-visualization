import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mount Mary · Fair Traffic Comparison',
  description:
    'Compare 11–12 Jul 2026 measured traffic with 13–14 Sep 2025 fair-weekend conditions around Mount Mary Basilica, Bandra, on a satellite map.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
