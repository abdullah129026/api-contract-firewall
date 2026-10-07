// Copy-to-clipboard button. Client component: clipboard needs the browser.
'use client';

import { useState } from 'react';

export default function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API can fail on non-secure origins; fall back silently.
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button className="btn" type="button" onClick={copy}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
