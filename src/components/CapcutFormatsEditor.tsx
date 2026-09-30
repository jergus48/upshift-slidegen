import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { FormatStrip } from './FormatStrip';
import { getCapcutProjects, importCapcutFormats, type CapcutProject } from '../lib/api';
import {
  FORMAT_LABEL,
  listCapcutFormats,
  ROLE_COLOR,
  ROLE_LABEL,
  ROLES,
  type CapcutFormat,
} from '../lib/capcutFormats';

// Brain → Video formats: the formats collected from CapCut, and the button that
// collects them again. The import replaces the whole set with whatever CapCut
// holds right now, so an edit made there reaches the app in one click.
export function CapcutFormatsEditor() {
  const [formats, setFormats] = useState<CapcutFormat[]>([]);
  const [projects, setProjects] = useState<CapcutProject[] | null>(null);
  const [dir, setDir] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([
        listCapcutFormats().then(setFormats),
        getCapcutProjects()
          .then((r) => {
            setProjects(r.projects);
            setDir(r.dir);
          })
          .catch((e) => {
            setProjects(null);
            setError(`Can't see CapCut from the server — ${e instanceof Error ? e.message : String(e)}`);
          }),
      ]),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const runImport = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const r = await importCapcutFormats();
      const warned = r.imported.filter((i) => i.warnings.length);
      setNote(
        `Imported ${r.imported.length} format${r.imported.length === 1 ? '' : 's'}` +
          (warned.length ? ` — ${warned.length} with notes, see below.` : '.'),
      );
      if (r.errors.length) setError(r.errors.map((e) => `${e.project}: ${e.error}`).join('\n'));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const bySong = useMemo(() => {
    const m = new Map<string, CapcutFormat[]>();
    for (const f of formats) m.set(f.song, [...(m.get(f.song) || []), f]);
    return [...m.entries()];
  }, [formats]);

  // CapCut projects edited after the last import.
  const stale = useMemo(() => {
    if (!projects) return [];
    const at = new Map(formats.map((f) => [f.id, f.importedAt]));
    return projects.filter((p) => !at.has(p.project) || at.get(p.project)! < p.modified);
  }, [projects, formats]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          icon={busy ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
          onClick={runImport}
          disabled={busy}
        >
          {busy ? 'Importing…' : 'Import from CapCut'}
        </Button>
        <span className="text-[11px] text-ink-6">
          {projects
            ? `${projects.length} format project${projects.length === 1 ? '' : 's'} in CapCut` +
              (stale.length ? ` · ${stale.length} new or changed since the last import` : ' · all imported')
            : 'server not reachable'}
        </span>
      </div>
      {dir && <p className="text-[11px] text-ink-6 break-all">Reading {dir}</p>}
      <JsonGuide dir={dir} />
      {note && <p className="text-[12px] text-emerald-600">{note}</p>}
      {error && <p className="text-[12px] text-red-600 whitespace-pre-line">{error}</p>}

      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {ROLES.map((r) => (
          <span key={r} className="flex items-center gap-1 text-[11px] text-ink-5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: ROLE_COLOR[r] }} />
            {ROLE_LABEL[r]}
          </span>
        ))}
        <span className="flex items-center gap-1 text-[11px] text-ink-5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: ROLE_COLOR.asset }} />
          App asset (kept as cut)
        </span>
      </div>

      {formats.length === 0 ? (
        <p className="text-[12px] text-ink-5">
          No formats yet. Name each CapCut project <code>song-scoreboard</code>, <code>song-rating</code> or{' '}
          <code>song-rating-app</code> and import.
        </p>
      ) : (
        <div className="space-y-3">
          {bySong.map(([song, list]) => (
            <div key={song} className="bg-card border border-line rounded-xl p-3 space-y-2">
              <div className="flex items-baseline gap-2">
                <h3 className="text-[13px] font-semibold text-ink">{song}</h3>
                <span className="text-[11px] text-ink-6 truncate">{list[0].audio.name}</span>
              </div>
              {list.map((f) => (
                <div key={f.id} className="space-y-1">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="w-24 shrink-0 font-medium text-ink-2">{FORMAT_LABEL[f.format] ?? f.format}</span>
                    <span className="text-ink-6 tabular-nums">
                      {f.duration.toFixed(1)}s · drop {f.drop.toFixed(2)}s · {f.video.length} cuts
                      {f.filters.length ? ` · ${[...new Set(f.filters.map((x) => x.name))].join(', ')}` : ''}
                      {f.overlays.length ? ` · ${f.overlays.length} overlay` : ''}
                    </span>
                  </div>
                  <FormatStrip format={f} />
                  {f.warnings.length > 0 && (
                    <p className="text-[11px] text-amber-600">{f.warnings.join(' · ')}</p>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Where the file every format is read from lives, for when a format looks
// wrong and the source needs checking. CapCut never shows it itself.
function JsonGuide({ dir }: { dir: string }) {
  const root = dir || '~/Movies/CapCut/User Data/Projects/com.lveditor.draft';
  const code = 'px-1 rounded bg-raised border border-line text-[11px] break-all';
  return (
    <details className="bg-card border border-line rounded-xl px-3 py-2 text-[12px] text-ink-3">
      <summary className="cursor-pointer select-none font-medium text-ink-2">
        Where CapCut keeps a format's JSON
      </summary>
      <div className="space-y-3 pt-2">
        <p>
          CapCut never shows or exports it — it's the project's own file on disk, one per project:
          <br />
          <code className={code}>{root}/&lt;project&gt;/draft_info.json</code>
        </p>
        <div>
          <div className="font-medium text-ink-2 mb-1">Getting to it</div>
          <ol className="list-decimal pl-4 space-y-1">
            <li>
              Finder → <b>⌘⇧G</b> → paste <code className={code}>{root}</code> → Enter. Each folder is one project,
              named like it is in CapCut.
            </li>
            <li>
              Or in Terminal: <code className={code}>open "{root}/wolf-rating-app"</code>
            </li>
            <li>
              Not there? The App Store build keeps projects under{' '}
              <code className={code}>~/Library/Containers/com.lemon.lvoverseas/Data/Movies/CapCut/User Data/Projects/com.lveditor.draft</code>
            </li>
          </ol>
        </div>
        <div>
          <div className="font-medium text-ink-2 mb-1">What's in it</div>
          <ul className="list-disc pl-4 space-y-1">
            <li>
              <code className={code}>tracks</code> — the timeline: video, audio, filter, effect and text tracks. Each
              segment has its place on the timeline (<code className={code}>target_timerange</code>), its in-point in
              the clip (<code className={code}>source_timerange</code>), <code className={code}>speed</code>, and size
              and position (<code className={code}>clip.scale</code>, <code className={code}>clip.transform</code>).
            </li>
            <li>
              <code className={code}>materials</code> — the files used (that's how a placeholder like{' '}
              <code className={code}>clip_chopped.mp4</code> is recognised), filters with their strength (
              <code className={code}>value</code>), effects and beat marks.
            </li>
            <li>
              Every time is in <b>microseconds</b>: 7233333 = 7.233s.
            </li>
            <li>
              <code className={code}>draft_info.json.bak</code> and <code className={code}>template-2.tmp</code> are
              backups of the same thing — ignore them.
            </li>
          </ul>
        </div>
        <p className="text-ink-6">
          Don't edit the file by hand — CapCut rewrites it on the next save. Change the project in CapCut, then Import
          from CapCut here.
        </p>
      </div>
    </details>
  );
}
