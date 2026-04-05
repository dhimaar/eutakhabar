"use client";

import { useEffect } from "react";

export default function AutoRefresh() {
  useEffect(() => {
    // Refresh page every 30 minutes
    const timeout = setTimeout(() => {
      window.location.reload();
    }, 30 * 60 * 1000);

    return () => clearTimeout(timeout);
  }, []);

  return null;
}
