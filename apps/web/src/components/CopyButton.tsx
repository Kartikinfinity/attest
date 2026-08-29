'use client';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) -- fail silently,
      // nothing else meaningful to do here.
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : label}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors focus-visible:ring-2 focus-visible:ring-accent"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-600" /> Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" /> {label}
        </>
      )}
    </button>
  );
}
