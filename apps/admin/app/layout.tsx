import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  title: 'Game Optimization Hub — Admin',
  description: 'Admin panel for the Game Optimization Hub platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        {children}
        <Toaster position="bottom-right" theme="dark" />
      </body>
    </html>
  );
}
