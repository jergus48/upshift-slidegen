import { useEffect, useState } from 'react';
import { FolderPlus, Folder, Trash2, Check, Loader2 } from 'lucide-react';
import {
  listFolderPresets,
  addFolderPreset,
  removeFolderPreset,
  getDefaultFolderId,
  setDefaultFolderId,
  type FolderPreset,
} from '../lib/downloadFolders';
import { Button } from './Button';

// Manage the folder presets that downloads can be saved straight into. Only
// rendered where the browser supports it (BrainView checks supportsFolderPresets
// before mounting this). Each preset is a real folder on disk the user picked;
// one can be marked the default destination for downloads.
export function DownloadFoldersEditor() {
  const [presets, setPresets] = useState<FolderPreset[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(getDefaultFolderId());
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    listFolderPresets().then(setPresets).catch(() => setPresets([]));
  }, []);

  const add = async () => {
    setAdding(true);
    try {
      const preset = await addFolderPreset();
      if (preset) {
        setPresets(await listFolderPresets());
        // First folder added becomes the default automatically.
        if (!getDefaultFolderId()) {
          setDefaultFolderId(preset.id);
          setDefaultId(preset.id);
        }
      }
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    await removeFolderPreset(id);
    setPresets(await listFolderPresets());
    setDefaultId(getDefaultFolderId());
  };

  const makeDefault = (id: string) => {
    const next = defaultId === id ? null : id;
    setDefaultFolderId(next);
    setDefaultId(next);
  };

  return (
    <div className="space-y-3">
      {presets.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {presets.map((p) => {
            const isDefault = defaultId === p.id;
            return (
              <div
                key={p.id}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-line bg-card"
              >
                <Folder size={14} className="shrink-0 text-ink-4" />
                <span className="text-[13px] text-ink font-medium flex-1 truncate">{p.name}</span>
                <button
                  onClick={() => makeDefault(p.id)}
                  className={`text-[11px] px-2 h-6 rounded-md border transition-colors flex items-center gap-1 ${
                    isDefault
                      ? 'border-ink-7 bg-raised text-ink'
                      : 'border-line text-ink-5 hover:text-ink hover:border-line-2'
                  }`}
                  title={isDefault ? 'This is where downloads go' : 'Make this the download folder'}
                >
                  {isDefault && <Check size={11} />}
                  {isDefault ? 'Default' : 'Set default'}
                </button>
                <button
                  onClick={() => remove(p.id)}
                  className="text-ink-6 hover:text-red-600 transition-colors p-1"
                  title="Remove this folder"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Button
        variant="secondary"
        icon={adding ? <Loader2 size={13} className="animate-spin" /> : <FolderPlus size={13} />}
        onClick={add}
        disabled={adding}
      >
        Add folder
      </Button>

      {presets.length > 0 && !defaultId && (
        <p className="text-[11px] text-ink-6">
          No default set — downloads still go to your browser's Downloads folder. Pick one above to
          send them straight to that folder instead.
        </p>
      )}
    </div>
  );
}
