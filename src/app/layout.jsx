import { Inter } from 'next/font/google';
import '../styles/globals.css'; 

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Leads Magician Map',
  description: 'Interactive map visualization for call-based lead traffic data',
};

export default function RootLayout({
  children,
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
