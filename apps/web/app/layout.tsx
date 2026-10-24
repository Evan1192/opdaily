import type { Metadata } from 'next';
import { Inter, Pirata_One } from 'next/font/google';
import './globals.css';

const body = Inter({ subsets: ['latin'], variable: '--font-body' });
const display = Pirata_One({ weight: '400', subsets: ['latin'], variable: '--font-display' });

export const metadata: Metadata = {
  title: 'OPDaily — daily lethal puzzle',
  description: 'Find lethal in the One Piece Card Game. One puzzle a day.',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="0.9em" font-size="90">\u2620\uFE0F</text></svg>',
  },
  openGraph: {
    title: 'OPDaily — daily lethal puzzle',
    description: 'Find lethal in the One Piece Card Game. One puzzle a day, one best line.',
    siteName: 'OPDaily',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body className="min-h-screen font-body text-slate-100 antialiased">{children}</body>
    </html>
  );
}
