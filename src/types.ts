export type ViewKey = 'queue' | 'create' | 'library' | 'reddit' | 'reply' | 'write' | 'clean' | 'schedule' | 'results' | 'brain' | 'settings';

export interface Slide {
  id: string;
  text: string;
  // Generated slides have no source image — they're rendered from text over a
  // gradient. `imageUrl` is kept optional for backwards-compat / future use.
  imageUrl?: string;
  bgFrom?: string;
  bgTo?: string;
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
