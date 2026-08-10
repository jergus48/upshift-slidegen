// The sidebar's tool list — the single source of truth for both the Sidebar
// (which renders it, with icons + badges) and Settings → Sidebar (which renders
// a show/hide toggle per entry). Kept in a plain module (not Sidebar.tsx) so the
// Sidebar file stays component-only for React Fast Refresh.
import {
  LayoutGrid,
  CalendarClock,
  LineChart,
  Brain,
  Images,
  MessageSquare,
  MessagesSquare,
  Eraser,
  PenLine,
  Wand2,
  Target,
  LayoutTemplate,
  MonitorPlay,
  TrendingUp,
} from 'lucide-react';
import type { ViewKey } from '../types';

export interface NavItem {
  key: ViewKey;
  label: string;
  icon: typeof LayoutGrid;
  badge?: 'queue' | 'scheduled';
  // Items sharing a group id are rendered together inside one collapsible pack
  // in the sidebar, so they take up a single row when collapsed.
  group?: string;
}

// Labels for the collapsible groups, keyed by the `group` id used on NavItems.
export const NAV_GROUPS: Record<string, { label: string; icon: typeof LayoutGrid }> = {
  reddit: { label: 'Reddit', icon: MessagesSquare },
};

export const NAV: NavItem[] = [
  { key: 'queue', label: 'Queue', icon: LayoutGrid, badge: 'queue' },
  { key: 'photopack', label: 'Photo Packs', icon: LayoutTemplate },
  { key: 'library', label: 'Library', icon: Images },
  { key: 'reddit', label: 'Reddit', icon: MessagesSquare, group: 'reddit' },
  { key: 'reply', label: 'Reply', icon: MessageSquare, group: 'reddit' },
  { key: 'write', label: 'Write', icon: PenLine, group: 'reddit' },
  { key: 'subreddit', label: 'Subreddit', icon: Target, group: 'reddit' },
  { key: 'prompt', label: 'Prompt', icon: Wand2 },
  { key: 'clean', label: 'Clean', icon: Eraser },
  { key: 'schedule', label: 'Schedule', icon: CalendarClock, badge: 'scheduled' },
  { key: 'results', label: 'Results', icon: LineChart },
  { key: 'channels', label: 'Channels', icon: MonitorPlay },
  { key: 'stocks', label: 'Stocks', icon: TrendingUp },
  { key: 'brain', label: 'Brain', icon: Brain },
];

// The tools that can be hidden from the sidebar (Settings → Sidebar). Settings
// itself is never hideable — it's the fixed button at the bottom of the sidebar.
export const SIDEBAR_TOOLS: { key: ViewKey; label: string }[] = NAV.map(({ key, label }) => ({ key, label }));
