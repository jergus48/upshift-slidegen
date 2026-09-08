import { useEffect, useState } from 'react';
import { Plus, HardDrive, Trash2 } from 'lucide-react';
import {
  listServerFolders,
  addServerFolder,
  removeServerFolder,
  renameServerFolder,
  subscribeServerFolders,
  type ServerFolder,
} from '../lib/serverFolders';
import { Button } from './Button';

// Manage the named output folders a server render job can write into. Typed
// paths, not picked handles — the folder lives on the machine running the
// server, which the browser can't browse. Characters then pick one by name.
export function ServerFoldersEditor() {
  const [folders, setFolders] = useState<ServerFolder[]>(listServerFolders);
  const [name, setName] = useState('');
  const [path, setPath] = useState('');

  useEffect(() => subscribeServerFolders(() => setFolders(listServerFolders())), []);

  const add = () => {
    if (!path.trim()) return;
    addServerFolder(name, path);
    setName('');
    setPath('');
  };

  return (
    <div className="space-y-3">
      {folders.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {folders.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-line bg-card"
            >
              <HardDrive size={14} className="shrink-0 text-ink-4" />
              <input
                defaultValue={f.name}
                onBlur={(e) => renameServerFolder(f.id, e.target.value)}
                className="w-32 shrink-0 h-7 bg-transparent border border-transparent hover:border-line rounded-md px-1.5 text-[13px] font-medium text-ink outline-none focus:border-ink-7"
              />
              <span className="text-[12px] text-ink-6 font-mono flex-1 truncate" title={f.path}>
                {f.path}
              </span>
              <button
                onClick={() => removeServerFolder(f.id)}
                className="text-ink-6 hover:text-red-600 transition-colors p-1"
                title="Remove this folder"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          className="w-40 shrink-0 h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink placeholder:text-ink-6 outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
        />
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="C:\Users\you\Videos\Characters"
          spellCheck={false}
          className="flex-1 h-9 bg-card border border-line rounded-lg px-3 text-[13px] font-mono text-ink placeholder:text-ink-6 outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
        />
        <Button variant="secondary" icon={<Plus size={13} />} onClick={add} disabled={!path.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}
