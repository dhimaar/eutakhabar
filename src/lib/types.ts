export type ContentCategory = "politics" | "sports" | "culture" | "finance" | "general";

export type SourceType = "rss" | "scrape" | "scrape-headless" | "youtube" | "twitter" | "tiktok";

export type HeadlineStyle = "breaking" | "top" | "major" | "normal";

export type Language = "en" | "ne";

export interface SourceConfig {
  id: string;
  name: string;
  type: SourceType;
  url?: string;
  selector?: string;
  channelId?: string;
  handle?: string;
  categories: ContentCategory[];
  weight: number;
  enabled: boolean;
}

export interface RawContentItem {
  id: string;
  title: string;
  url: string;
  source: string;
  category: ContentCategory;
  timestamp: string;
  engagement: {
    views?: number;
    likes?: number;
    shares?: number;
    comments?: number;
  };
  summary?: string;
  transcript?: string;
  newsworthiness?: number;
  imageUrl?: string;
  expiresAt?: string;
  alwaysInclude?: boolean;
  clusterId?: string;
}

export interface SourceLink {
  source: string;
  url: string;
  title: string;
}

export interface Headline {
  id: string;
  text: {
    en: string;
    ne: string;
  };
  url: string;
  source: string;
  category: ContentCategory;
  style: HeadlineStyle;
  position: number;
  score: number;
  imageUrl?: string;
  createdAt: string;
  sourceLinks?: SourceLink[];
  expiresAt?: string;
  clusterId?: string;
}

export interface SiteContent {
  breaking: Headline | null;
  topStories: Headline[];
  headlines: Headline[];
  lastUpdated: string;
}

export interface ManualOverride {
  pin?: {
    headlineId: string;
    position: number;
    style: HeadlineStyle;
  }[];
  block?: string[];
  inject?: {
    text: { en: string; ne: string };
    url: string;
    category: ContentCategory;
    style: HeadlineStyle;
    position: number;
  }[];
  forceBreaking?: {
    text: { en: string; ne: string };
    url: string;
  } | null;
}

export interface AnalysisResult {
  summary: string;
  newsworthiness: number;
  category: ContentCategory;
  keyTopics: string[];
}

export interface GeneratedHeadline {
  id: string;
  en: string;
  ne: string;
  style: HeadlineStyle;
  isBreaking: boolean;
}
