import { useState } from 'react';
import { LayoutGrid, CalendarClock, LineChart, Brain, Settings, ChevronsUpDown, Plus, Check, Images, ImagePlus, MessageSquare, MessagesSquare, Eraser, PenLine } from 'lucide-react';
import type { ViewKey, Project } from '../types';

interface SidebarProps {
  activeView: ViewKey;
  onSelectView: (view: ViewKey) => void;
  queueCount: number;
  scheduledCount: number;
  projects: Project[];
  activeProjectId: string;
  onSwitchProject: (id: string) => void;
  onNewProject: () => void;
  // On phones the sidebar is an off-canvas drawer toggled from the top bar.
  mobileOpen?: boolean;
  onClose?: () => void;
}

const nav: { key: ViewKey; label: string; icon: typeof LayoutGrid; badge?: 'queue' | 'scheduled' }[] = [
  { key: 'queue', label: 'Queue', icon: LayoutGrid, badge: 'queue' },
  { key: 'create', label: 'Create', icon: ImagePlus },
  { key: 'library', label: 'Library', icon: Images },
  { key: 'reddit', label: 'Reddit', icon: MessagesSquare },
  { key: 'reply', label: 'Reply', icon: MessageSquare },
  { key: 'write', label: 'Write', icon: PenLine },
  { key: 'clean', label: 'Clean', icon: Eraser },
  { key: 'schedule', label: 'Schedule', icon: CalendarClock, badge: 'scheduled' },
  { key: 'results', label: 'Results', icon: LineChart },
  { key: 'brain', label: 'Brain', icon: Brain },
];

function initials(name: string) {
  return (name || 'P').slice(0, 2).toUpperCase();
}

export function Sidebar({
  activeView,
  onSelectView,
  queueCount,
  scheduledCount,
  projects,
  activeProjectId,
  onSwitchProject,
  onNewProject,
  mobileOpen = false,
  onClose,
}: SidebarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const active = projects.find((p) => p.id === activeProjectId) ?? projects[0];

  return (
    <>
      {/* Backdrop (mobile only, when the drawer is open) */}
      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} />}

      <aside
        className={`w-[220px] shrink-0 flex-col bg-bg border-r border-line h-full
          fixed inset-y-0 left-0 z-40 md:static md:z-auto
          ${mobileOpen ? 'flex' : 'hidden'} md:flex`}
      >
      {/* Brand */}
      <div className="px-4 py-4 border-b border-line">
        <div className="flex items-center gap-2.5">
          <img src="/android-chrome-192x192.png" alt="Slidesmith" className="w-7 h-7 rounded-[7px] shrink-0" />
          <div className="flex flex-col leading-none">
            <span className="text-[14px] font-semibold text-ink">Upshift SlideGen</span>
            <span className="text-[11px] text-ink-5 mt-0.5">Slideshows Generator</span>
          </div>
        </div>
      </div>

      {/* Project switcher */}
      <div className="px-3 py-3 border-b border-line relative">
        <span className="text-[11px] font-medium text-ink-6 uppercase tracking-widest px-1">Project</span>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="mt-2 w-full flex items-center gap-2.5 px-2 py-2 rounded-lg bg-raised hover:bg-line transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ink/10"
        >
          <div className="w-5 h-5 rounded-[5px] bg-ink text-bg flex items-center justify-center text-[10px] font-bold shrink-0">
            {initials(active.name)}
          </div>
          <span className="text-[13px] font-medium text-ink truncate flex-1 text-left">{active.name}</span>
          <ChevronsUpDown size={13} className="text-ink-5 shrink-0" />
        </button>

        {menuOpen && (
          <>
            {/* click-away */}
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute left-3 right-3 top-[72px] z-20 bg-card border border-line rounded-lg shadow-lg overflow-hidden py-1">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setMenuOpen(false);
                    if (p.id !== activeProjectId) onSwitchProject(p.id);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-raised transition-colors"
                >
                  <span className="text-[13px] text-ink truncate flex-1">{p.name}</span>
                  {p.id === activeProjectId && <Check size={13} className="text-ink shrink-0" />}
                </button>
              ))}
              <div className="border-t border-line mt-1 pt-1">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onNewProject();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-ink-4 hover:bg-raised hover:text-ink transition-colors"
                >
                  <Plus size={13} className="shrink-0" />
                  <span className="text-[13px]">New project</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-3 px-2">
        <div className="flex flex-col gap-0.5">
          {nav.map(({ key, label, icon: Icon, badge }) => {
            const isActive = activeView === key;
            const count = badge === 'queue' ? queueCount : badge === 'scheduled' ? scheduledCount : undefined;
            return (
              <button
                key={key}
                onClick={() => onSelectView(key)}
                className={`w-full h-9 flex items-center gap-2.5 rounded-lg px-2 text-left border border-transparent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ink/10 ${isActive ? 'bg-raised text-ink' : 'text-ink-4 hover:bg-raised hover:text-ink-3'
                  }`}
              >
                <Icon size={14} className="shrink-0" />
                <span className="text-[13px] font-medium flex-1 truncate">{label}</span>
                {count !== undefined && count > 0 && (
                  <span className={`text-[10px] font-medium leading-none px-1.5 h-[18px] inline-flex items-center rounded-md border ${isActive ? 'bg-ink text-bg border-ink' : 'bg-raised text-ink-5 border-line'
                    }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom */}
      <div className="border-t border-line p-2">
        <button
          onClick={() => onSelectView('settings')}
          className={`w-full h-9 flex items-center gap-2.5 rounded-lg px-2 border border-transparent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ink/10 ${activeView === 'settings' ? 'bg-raised text-ink' : 'text-ink-6 hover:text-ink-4 hover:bg-raised'
            }`}
        >
          <Settings size={14} className="shrink-0" />
          <span className="text-[13px]">Settings</span>
        </button>
      </div>
      </aside>
    </>
  );
}
