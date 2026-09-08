import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Temptasians · Audition Council',
  description: 'Independent listening. Thoughtful deliberation.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
