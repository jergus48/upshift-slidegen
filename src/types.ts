export type ViewKey = 'queue' | 'create' | 'photopack' | 'characters' | 'library' | 'reddit' | 'reply' | 'write' | 'subreddit' | 'prompt' | 'clean' | 'schedule' | 'results' | 'channels' | 'stocks' | 'brain' | 'settings';

// ── YouTube channel dashboard (public data, no API key) ──────────────────────
export interface YtVideo {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  views: number;
  likes: number;
  publishedAt: string;
  // Real views gained per time window, measured against the server's snapshot
  // history (see server/viewSnapshots.js). `exact: false` means we don't yet
  // have a baseline old enough to cover the window — the value is a partial
  // lower bound while tracking accumulates. Absent until the server has run.
  gained?: Partial<Record<'24h' | 'week' | 'month' | 'year', { value: number; exact: boolean }>>;
}

// One tracked channel's result. `ok: false` carries an `error` instead of data,
// so a single bad link renders as an error card rather than failing the page.
export interface YtChannel {
  input: string; // the link the user pasted (stable key for add/remove)
  ok: boolean;
  error?: string;
  id?: string;
  title?: string;
  avatar?: string;
  subscribers?: number;
  url?: string;
  videos?: YtVideo[];
}

// How many comments one video has, for the channel grid's badge. `count` is
// null when YouTube's page didn't carry the field — comments off, or simply not
// readable — so the UI can show nothing instead of a misleading 0.
export interface YtCommentCount {
  input: string;
  ok: boolean;
  error?: string;
  videoId?: string;
  count?: number | null;
}

// ── YouTube comments (public scrape, no API key — see server/ytComments.js) ──
// One top-level comment on a video. `url` deep-links to the comment on YouTube,
// which is where replying actually happens (posting needs a logged-in account).
export interface YtComment {
  id: string;
  author: string;
  authorUrl: string;
  avatar: string;
  text: string;
  publishedText: string; // YouTube's own relative label, e.g. "4 minutes ago"
  likes: number;
  replyCount: number;
  isOwner: boolean; // the channel owner's own comment
  isHearted: boolean; // hearted by the creator
  url: string;
}

// One video's comment fetch. `ok: false` carries an `error`; `sort` says which
// ordering YouTube served ('newest' when the sort menu was available, 'top' as
// a fallback, 'none' when comments are turned off).
export interface YtVideoComments {
  input: string; // the video url/id we asked for (stable key)
  ok: boolean;
  error?: string;
  videoId?: string;
  sort?: 'newest' | 'top' | 'none';
  comments?: YtComment[];
}

// ── Non-YouTube social profiles (best-effort public scrape, no API key) ──────
// One tracked account's result. Like YtChannel, `ok: false` carries an `error`
// instead of data. All stat fields are optional — login-walled platforms often
// expose only some (or none) of them.
export interface SocialProfile {
  input: string; // the link/handle the user pasted (stable key for add/remove)
  ok: boolean;
  platform: string;
  error?: string;
  handle?: string;
  title?: string;
  avatar?: string;
  url?: string;
  followers?: number | null;
  following?: number | null;
  posts?: number | null;
  likes?: number | null; // total likes/hearts (TikTok)
}

export interface Slide {
  id: string;
  text: string;
  // Generated slides have no source image — they're rendered from text over a
  // gradient. `imageUrl` is kept optional for backwards-compat / future use.
  imageUrl?: string;
  bgFrom?: string;
  bgTo?: string;
  // Caption font look ('app' default vs 'tiktok'); undefined = app default.
  captionStyle?: import('./lib/captionStyle').CaptionStyle;
}

export interface Slideshow {
  id: string;
  hook: string;
  caption: string;
  hashtags: string[];
  slides: Slide[];
  createdAt: string;
  rationale: string;
  // Marks a Characters before/after deck (lib/transformationDeck.ts). The video
  // exporter treats these differently: the after slides linger 50% longer per
  // word, and the soundtrack is aligned so its DROP lands on the before→after
  // cut instead of opening the clip. Absent on every other kind of slideshow.
  kind?: 'characters';
  // How many leading slides are the "before" half. Only meaningful with
  // kind: 'characters'; it's what the drop alignment counts back from.
  beforeSlides?: number;
  // Which generation batch produced this show (see lib/localBatches.ts). Lets the
  // Batch queue panel re-select a whole finished batch for export. Absent for
  // manually-created or pre-batch slideshows.
  batchId?: string;
}

export interface BrainState {
  niche: string;
  appName: string;
  appDescription: string;
  audience: string;
  styleMemory: string;
}

export interface ProjectDefaults {
  socialAccountIds: number[];
  mode: 'draft' | 'schedule';
}

export interface Project {
  id: string;
  name: string;
  brain: BrainState;
  defaults: ProjectDefaults;
  imagePacks: string[]; // background packs generation draws from ([] = gradients only)
  // POV background packs for the app ("Upshift") slide, chosen per gender. When
  // set, generation drops one random image from the matching pack onto the slide
  // that mentions the app, so it never has to be swapped in by hand. Empty/unset
  // = the app slide just keeps its normal background.
  povPackMen?: string;
  povPackWomen?: string;
}

// Which API keys are set. Never the real values — only whether each one is
// set, so Settings can show "already set" without ever exposing the secret.
// This is the only part of "config" that lives server-side.
export interface KeyStatus {
  postbridge: boolean;
  openrouter: boolean;
  apify: boolean;
  fmp: boolean;
}

// The rest of the app's configuration — projects, Brain, model choice — lives
// entirely in the browser (localStorage; see lib/localWorkspace.ts), so it
// survives reloads without depending on any server storage.
export interface Workspace {
  model: string;
  pinterestActor: string;
  projects: Project[];
  activeProjectId: string;
  // Sidebar tools the user has hidden. Global (not per-project); Settings toggles
  // them and the Sidebar filters them out. Empty = everything visible.
  hiddenViews: ViewKey[];
}

// What the app works with internally: server key-status merged with the local
// workspace. Assembled in App.tsx.
export interface AppConfig extends Workspace {
  keys: KeyStatus;
}

// Write-only: real secret values, sent up to replace a key. Settings only
// includes a field here if the user actually typed something new.
export type KeysPatch = Partial<{ postbridge: string; openrouter: string; apify: string; fmp: string }>;

// ── Stock analyzer ───────────────────────────────────────────────────────────
// A holding the user entered by hand (persisted in localStorage; see
// lib/localPortfolio.ts). `symbol` is the FMP ticker (US-listed), chosen via
// symbol search so market data resolves.
export interface Holding {
  symbol: string;
  name: string;
  shares: number;
  avgPrice: number; // average cost per share, in the listing's trading currency
  // Trading currency of the picked ticker (e.g. EUR for OMV.VI, USD for AAPL).
  // Captured from the search result so avg cost renders correctly before the
  // live quote loads. Optional for backwards-compat with older saved holdings.
  currency?: string;
}

// Live quote as normalized by the server (server/stocks.js). Numeric fields can
// be null when FMP omits them.
export interface StockQuote {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  yearLow: number | null;
  yearHigh: number | null;
  open: number | null;
  previousClose: number | null;
  marketCap: number | null;
  volume: number | null;
  exchange: string;
  currency: string;
  timestamp: number | null;
  source: 'fmp' | 'yahoo';
}

export interface StockNews {
  title: string;
  site: string;
  url: string;
  image: string;
  publishedDate: string;
  snippet: string;
}

export interface StockAnalysis {
  symbol: string;
  quote: StockQuote | null;
  profile: {
    companyName: string;
    sector: string;
    industry: string;
    image: string;
    description: string;
    website: string;
    beta: number | null;
    range: string;
  } | null;
  target: { high: number | null; low: number | null; consensus: number | null; median: number | null } | null;
  ratings: {
    consensus: string;
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
  } | null;
  earnings: {
    upcoming: { date: string; epsActual: number | null; epsEstimated: number | null; revenueActual: number | null; revenueEstimated: number | null } | null;
    lastReported: { date: string; epsActual: number | null; epsEstimated: number | null; revenueActual: number | null; revenueEstimated: number | null } | null;
  };
  news: StockNews[];
}

export interface SymbolSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
}

export interface PortfolioSummary {
  overview: string;
  positions: { symbol: string; stance: string; reason: string; confidence: string }[];
  watch: string[];
  disclaimer: string;
}

// Fact-screened buy ideas. The figures come from the data screener; `thesis` is
// the model's phrasing of them.
export interface StockIdea {
  symbol: string;
  name: string;
  price: number | null;
  currency: string;
  targetConsensus: number | null;
  upsidePct: number | null;
  rating: string;
  pos52: number | null; // 0 = at 52-week low, 1 = at 52-week high
  epsBeat: number | null; // last-quarter EPS actual − estimate (>0 = beat)
  theme?: string; // screening theme/sector bucket (e.g. 'semis', 'consumer')
  marketCap?: number | null; // used to flag smaller-cap "niche" names
  headline: string;
  headlineUrl: string;
  headlineSite: string;
  thesis: string;
}

export interface StockIdeas {
  ideas: StockIdea[];
  disclaimer: string;
}

export interface WhyMoved {
  explanation: string;
  drivers: string[];
  disclaimer: string;
  news: StockNews[];
}

export interface LibraryImage {
  id: string;
  url: string;
  pack: string;
  // Sub-group inside the pack (local images only). Absent = Unfiled. See
  // src/lib/subfolders.ts.
  subfolder?: string;
  source: 'bundled' | 'scraped' | 'uploaded';
}

export interface LibraryPack {
  name: string;
  source: 'bundled' | 'scraped' | 'uploaded';
  count: number;
  covers: string[];
  // Subfolders declared for this pack (registry names, even empty ones) with a
  // live image count and cover thumbnails. Only local packs can have these.
  subfolders?: { name: string; count: number; covers: string[] }[];
  // Images in the pack not assigned to any subfolder.
  unfiledCount?: number;
}

export interface ModelOption {
  id: string;
  name: string;
}

export interface SocialAccount {
  id: number;
  platform: string;
  username: string;
}

// Shapes returned by post-bridge (mapped in lib/api.ts).
export interface ScheduledPost {
  id: string;
  caption: string;
  status: string; // scheduled | processing | posted | draft
  scheduledAt: string | null;
  mediaUrls: string[];
  socialAccounts: number[];
  isDraft: boolean;
}

export interface PostResult {
  id: string;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  coverImageUrl: string | null;
  shareUrl: string | null;
  description: string | null;
  lastSyncedAt: string | null;
}
