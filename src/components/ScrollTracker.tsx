"use client";

import { useEffect, useRef } from "react";
import { trackScrollDepth } from "@/lib/analytics";

export default function ScrollTracker() {
  const tracked = useRef(new Set<number>());

  useEffect(() => {
    function handleScroll() {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollHeight <= 0) return;

      const percent = Math.round((window.scrollY / scrollHeight) * 100);

      for (const threshold of [25, 50, 75, 100]) {
        if (percent >= threshold && !tracked.current.has(threshold)) {
          tracked.current.add(threshold);
          trackScrollDepth(threshold);
        }
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return null;
}
