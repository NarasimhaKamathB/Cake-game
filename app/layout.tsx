import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cake Game — Perishable Supply Chain',
  description: 'A multiplayer supply chain simulation with perishable inventory.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-cake-50">
        <header className="bg-white border-b border-cake-100 px-6 py-3 flex items-center gap-3">
          <span className="text-2xl">🎂</span>
          <div>
            <h1 className="font-bold text-cake-700 leading-none">Cake Game</h1>
            <p className="text-xs text-gray-400">Perishable Supply Chain Simulation</p>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
