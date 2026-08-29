import Link from 'next/link';
import { Shield } from 'lucide-react';

export function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="border-b border-neutral-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="flex items-center gap-2 flex-shrink-0 group focus-visible:ring-2 focus-visible:ring-neutral-900 rounded-md"
          >
            <div className="bg-neutral-900 p-1.5 rounded-md group-hover:bg-neutral-800 transition-colors">
              <Shield className="h-4 w-4 text-white" aria-hidden="true" />
            </div>
            <span className="font-bold tracking-tight text-neutral-900 hidden sm:inline">ATTEST</span>
          </Link>
          {children}
        </div>
        <div className="flex items-center gap-4 sm:gap-5 text-sm font-medium text-neutral-500 flex-shrink-0">
          <a
            href="https://github.com/Kartikinfinity/attest"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-neutral-900 transition-colors"
          >
            GitHub
          </a>
          <span className="text-neutral-300 hidden sm:inline">|</span>
          <span className="text-neutral-400 text-xs hidden md:inline">Powered by TrueForge</span>
        </div>
      </div>
    </header>
  );
}
