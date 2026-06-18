"use client";

import { useEffect, useState } from "react";

// ponytail: no IP geolocation — Intl already uses the browser's locale + timezone.
// SSR renders the server's locale (en-US/UTC); we reformat on mount to the user's.
export function DateTime({ iso }: { iso: string }) {
  const [text, setText] = useState(() => new Date(iso).toLocaleString());
  useEffect(() => {
    setText(new Date(iso).toLocaleString());
  }, [iso]);
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}
