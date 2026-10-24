import type { Metadata } from 'next';
import './globals.css';
import { MotionProvider } from './MotionProvider';

export const metadata: Metadata = {
  title: 'Color Match Arena',
  description: 'เกมไพ่ Multiplayer แบบ Real-Time จับคู่สีและตัวเลข',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}