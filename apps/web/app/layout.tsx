import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OPDaily — daily lethal puzzle',
  description: 'Find lethal in the One Piece Card Game. One puzzle a day.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
