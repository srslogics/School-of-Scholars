import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const siteUrl =
  new URL(
    process.env.SITE_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      'http://127.0.0.1:3010/',
  ).origin + '/';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'School of Scholars | Katol ERP',
  description:
    'School of Scholars, Katol. School admissions, student records, attendance and fee collections.',
  alternates: { canonical: siteUrl },
  openGraph: {
    title: 'School of Scholars | Katol ERP',
    description: 'Connected school admissions, attendance and fee collections.',
    url: siteUrl,
    siteName: 'School of Scholars',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'School of Scholars | Katol ERP',
    description: 'Connected school admissions, attendance and fee collections.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
