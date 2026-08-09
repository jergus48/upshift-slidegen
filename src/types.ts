export type ViewKey = 'queue' | 'create' | 'photopack' | 'library' | 'reddit' | 'reply' | 'write' | 'subreddit' | 'prompt' | 'clean' | 'schedule' | 'results' | 'channels' | 'brain' | 'settings';

// ── YouTube channel dashboard (public data, no API key) ──────────────────────
export interface YtVideo {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  views: number;
  likes: number;
  publishedAt: string;
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
  url?: string;
  videos?: YtVideo[];
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
export type KeysPatch = Partial<{ postbridge: string; openrouter: string; apify: string }>;

export interface LibraryImage {
  id: string;
  url: string;
  pack: string;
  source: 'bundled' | 'scraped' | 'uploaded';
}

export interface LibraryPack {
  name: string;
  source: 'bundled' | 'scraped' | 'uploaded';
  count: number;
  covers: string[];
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
