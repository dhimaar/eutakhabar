declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackEvent(
  eventName: string,
  params: Record<string, string | number | boolean>
): void {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", eventName, params);
}

export function trackHeadlineClick(
  headlineId: string,
  position: number,
  category: string,
  style: string
): void {
  trackEvent("headline_click", {
    headline_id: headlineId,
    position,
    category,
    style,
  });
}

export function trackCategoryFilter(category: string): void {
  trackEvent("category_filter", { category });
}

export function trackScrollDepth(depth: number): void {
  trackEvent("scroll_depth", { depth_percent: depth });
}

export function trackLanguageSwitch(from: string, to: string): void {
  trackEvent("language_switch", { from_lang: from, to_lang: to });
}

export function trackBreakingClick(headlineId: string): void {
  trackEvent("breaking_click", { headline_id: headlineId });
}
