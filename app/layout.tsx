import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chrome Dinosaur Game',
  description: 'A recreation of the Chrome offline dinosaur game',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
