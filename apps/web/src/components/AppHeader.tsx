import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

export function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="bg-chrome text-chrome-foreground sticky top-0 z-50 border-b border-chrome-border">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="flex items-center gap-2.5 flex-shrink-0 group focus-visible:ring-2 focus-visible:ring-accent rounded-md"
          >
            <div className="bg-accent p-1.5 rounded-md group-hover:bg-accent-hover transition-colors">
              <ShieldCheck className="h-4 w-4 text-white" aria-hidden="true" />
            </div>
            <span className="font-bold tracking-tight text-white hidden sm:inline">ATTEST</span>
          </Link>
          {children}
        </div>
        <div className="flex items-center gap-4 sm:gap-5 text-sm font-medium text-neutral-400 flex-shrink-0">
          <a
            href="https://github.com/Kartikinfinity/attest"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            GitHub
          </a>
          <span className="text-neutral-700 hidden sm:inline">|</span>
          <span className="text-neutral-500 text-xs hidden md:inline">Powered by TrueForge</span>
        </div>
      </div>
    </header>
  );
}
