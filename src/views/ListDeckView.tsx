import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, Shuffle, Check, ChevronDown, Film } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { PackPicker } from '../components/PackPicker';
import { SlidePreview } from '../components/SlidePreview';
import { getMergedLibrary } from '../lib/mergedLibrary';
import { getMemeSort } from '../lib/api';
import { modeOfImage } from '../lib/memeSort';
import { poolFor } from '../lib/transformationDeck';
import { buildListDecks, FORMATS, THEMES, type ListTool } from '../lib/listDecks';
import type { LibraryImage, Slideshow } from '../types';

const COPY: Record<ListTool, {
  title: string;
  subtitle: string;
  hero: { label: string; hint: string };
  thumbs: { label: string; hint: string };
}> = {
  brain: {
    title: 'Brain Lists',
    subtitle:
      'White "day 1 to 3: everything feels boring" slides: underlined phrases, a matching photo per stage, a brain-scan cover and an Upshift slide.',
    hero: { label: 'Brain pictures (cover)', hint: 'The big picture on the cover: brain scans, a brain getting better.' },
    thumbs: { label: 'Stage photos (Pinterest)', hint: 'One photo per stage. Subfolders named like the stage (bored, clean, read, walk, calm, gym, cook…) get matched to it, otherwise random from the pack.' },
  },
  meme: {
    title: 'Meme Lists',
    subtitle:
      'Pastel "EASY MODE: / HARD MODE:" slides: a dash list on the right, a meme (or brain) picture on the left, small pictures of the listed things, Upshift inside the lists.',
    hero: { label: 'Meme / troll pictures (or brain)', hint: 'The big picture on each mode. Subfolders named easy, normal, hard, monk, npc, cope pick the right meme per mode.' },
    thumbs: { label: 'Small pictures of list items (Pinterest)', hint: 'Shown small under the list. Subfolders named porn, scroll, gym, read, food, game… match the items.' },
  },
};

const COUNT_OPTIONS = [1, 3, 5, 10];

interface Prefs {
  hero: string[];
  thumbs: string[];
  cta: string[];
  viral: string[];
  cover: boolean;
  bait: boolean;
  format: string;
  theme: string;
  handle: string;
  smallPics: boolean;
  upshift: boolean;
  count: number;
  // Version of the saved choices (see loadPrefs).
  v: number;
}

// The bundled packs (public/library) are pre-selected so the tools work out of the box.
const DEFAULT_PACKS: Record<ListTool, Pick<Prefs, 'hero' | 'thumbs' | 'cta' | 'viral'>> = {
  brain: { hero: ['Brain progress'], thumbs: ['Stage photos'], cta: ['Upshift screenshots'], viral: ['Viral resources'] },
  meme: { hero: ['Meme modes'], thumbs: ['Stage photos'], cta: ['Upshift screenshots'], viral: ['Viral resources'] },
};

// Monkey / Spongebob lists use only their own picture pack.
const VARIANT_HERO: Record<string, string> = { monkey: 'Monkey memes', sponge: 'Spongebob memes' };

const defaultPrefs = (tool: ListTool, variant?: string): Prefs => ({
  ...DEFAULT_PACKS[tool],
  ...(variant ? { hero: [VARIANT_HERO[variant]] } : {}),
  format: '',
  theme: '',
  handle: '',
  smallPics: true,
  upshift: true,
  cover: false,
  bait: true,
  count: 5,
  v: 3,
});

const prefsKey = (tool: ListTool, variant?: string) => `slidesmith:listdeck:${tool}${variant ? `:${variant}` : ''}`;

// Meme Lists locked to one format (own sidebar entry, own saved settings).
const VARIANTS: Record<string, { title: string; subtitle: string }> = {
  monkey: { title: 'Monkey Lists', subtitle: 'The Meme Lists slides, but every mode is a monkey doing human stuff (suit, gym, money, phone...).' },
  sponge: { title: 'Spongebob Lists', subtitle: 'The Meme Lists slides with Patrick, Squidward, the office fish and real Spongebob as the modes.' },
};

function loadPrefs(tool: ListTool, variant?: string): Prefs {
  try {
    const def = { ...defaultPrefs(tool, variant), ...(variant ? { format: variant } : {}) };
    const saved = JSON.parse(localStorage.getItem(prefsKey(tool, variant)) || '{}') as Partial<Prefs>;
    const merged = { ...def, ...saved };
    // An empty picture choice saved by an older version (before the bundled packs
    // existed) would hide the pictures for good — an empty pick means "use the defaults".
    if (!merged.hero?.length) merged.hero = def.hero;
    // The monkey pack arrived later: add it to older saved picks.
    // Earlier versions mixed the monkey / spongebob packs into plain Meme Lists: drop them there,
    // and keep the variants on their own pack.
    if (variant) merged.hero = [VARIANT_HERO[variant]];
    else if (tool === 'meme') merged.hero = merged.hero.filter((p) => p !== 'Monkey memes' && p !== 'Spongebob memes');
    if (!merged.hero.length) merged.hero = def.hero;
    if (!merged.thumbs?.length) merged.thumbs = def.thumbs;
    if (!merged.cta?.length) merged.cta = def.cta;
    if (!merged.viral?.length) merged.viral = def.viral;
    // v3: Upshift became a subtle mention (on by default); drop an older saved 'off'.
    if (saved.v !== 3) merged.upshift = def.upshift;
    merged.v = 3;
    if (variant) merged.format = variant;
    return merged;
  } catch {
    return { ...defaultPrefs(tool, variant), ...(variant ? { format: variant } : {}) };
  }
}

function Section({ title, hint, children, defaultOpen = false }: { title: string; hint?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-line rounded-lg">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <span className="text-[12px] font-medium text-ink">{title}</span>
        {hint && <span className="text-[11px] text-ink-6 truncate">{hint}</span>}
        <ChevronDown size={13} className={`ml-auto text-ink-5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

const selectCls =
  'w-full h-9 bg-card border border-line rounded-lg px-2.5 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10 disabled:opacity-50';
const labelCls = 'text-[11px] text-ink-5 uppercase tracking-widest font-semibold mb-1.5 block';

export function ListDeckView({
  tool,
  variant,
  onAdd,
  onVideos,
}: {
  tool: ListTool;
  variant?: 'monkey' | 'sponge';
  onAdd: (tool: ListTool, shows: Slideshow[], subtitle: string) => void;
  // Renders the decks straight to video (no queue): paced per slide, male Characters music.
  onVideos: (shows: Slideshow[], onProgress: (done: number, total: number) => void) => Promise<void>;
}) {
  const copy = { ...COPY[tool], ...(variant ? VARIANTS[variant] : {}) };
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs(tool, variant));
  const [library, setLibrary] = useState<LibraryImage[] | null>(null);
  const [sort, setSort] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState<{ done: number; total: number } | null>(null);
  const [videosDone, setVideosDone] = useState(0);

  const patch = (p: Partial<Prefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      try { localStorage.setItem(prefsKey(tool, variant), JSON.stringify(next)); } catch { /* storage full/blocked */ }
      return next;
    });
    setDone(false);
  };

  useEffect(() => {
    let alive = true;
    // Hidden packs included: the bundled screenshot packs are hidden from the
    // background pickers but are exactly what a CTA pack wants.
    getMergedLibrary(true).then((l) => { if (alive) setLibrary(l); }).catch(() => { if (alive) setLibrary([]); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    getMemeSort().then((r) => { if (alive) setSort(r.overrides || {}); }).catch(() => { /* no sorting saved */ });
    return () => { alive = false; };
  }, []);

  const pools = useMemo(() => {
    const lib = library ?? [];
    return {
      // Pictures put in the trash on the Sort Memes page never show up.
      hero: poolFor(lib, prefs.hero).filter((i) => modeOfImage(i.url, sort) !== 'trash'),
      thumbs: poolFor(lib, prefs.thumbs),
      cta: poolFor(lib, prefs.cta),
      viral: poolFor(lib, prefs.viral),
    };
  }, [library, prefs.hero, prefs.thumbs, prefs.cta, prefs.viral, sort]);

  const { format, theme, handle, smallPics, upshift, cover, bait } = prefs;
  const formats = FORMATS[tool].filter((f) => !['monkey', 'sponge'].includes(f.key) || f.key === variant);
  const themes = THEMES[tool];
  const build = useCallback(
    (count: number) =>
      buildListDecks({
        tool,
        count,
        format: format || undefined,
        themeName: theme || undefined,
        handle: handle.trim() || undefined,
        smallPics,
        upshift,
        cover,
        bait,
        viral: pools.viral,
        heroTag: tool === 'meme' ? (img) => modeOfImage(img.url, sort) : undefined,
        hero: pools.hero,
        thumbs: pools.thumbs,
        cta: pools.cta,
        // The bundled "blocked" screenshot, so the CTA card works with no pack at all.
        ctaFallback: '/app-shots/corn-men.jpg',
      }).shows,
    [tool, format, theme, handle, smallPics, upshift, cover, bait, pools, sort],
  );

  // A sample deck that re-rolls whenever a setting changes (or on "New preview").
  const [seed, setSeed] = useState(0);
  const preview = useMemo(
    () => (library && seed >= 0 ? build(1)[0] ?? null : null),
    [library, build, seed],
  );
  const rollPreview = () => setSeed((s) => s + 1);

  const submit = () => {
    setBusy(true);
    setError(null);
    try {
      const shows = build(prefs.count);
      const bits = [
        prefs.format ? formats.find((f) => f.key === prefs.format)?.label : 'mixed formats',
        prefs.theme || 'random colours',
      ];
      onAdd(tool, shows, bits.join(' · '));
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const submitVideos = async () => {
    setError(null);
    setDone(false);
    setVideosDone(0);
    const n = prefs.count;
    setVideoProgress({ done: 0, total: n });
    try {
      await onVideos(build(n), (d, total) => setVideoProgress({ done: d, total }));
      setVideosDone(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setVideoProgress(null);
    }
  };

  const noHero = pools.hero.length === 0;

  return (
    <>
      <ViewHeader
        title={copy.title}
        subtitle={copy.subtitle}
        right={
          <Button variant="secondary" size="sm" icon={<Shuffle size={12} />} onClick={rollPreview} disabled={!library}>
            New preview
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Live sample of a deck, drawn by the same renderer as the export. */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] text-ink-5 uppercase tracking-widest font-semibold">Sample deck</label>
              <span className="text-[11px] text-ink-6">{preview ? preview.rationale : 'loading…'}</span>
            </div>
            {preview ? (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {preview.slides.map((s) => (
                  <div key={s.id} className="w-[150px] sm:w-[170px] shrink-0 bg-card border border-line rounded-xl p-1.5">
                    <SlidePreview slide={s} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-40 grid place-items-center text-ink-6"><Loader2 size={16} className="animate-spin" /></div>
            )}
            {preview && <p className="text-[12px] text-ink-4 mt-1">“{preview.hook}”</p>}
          </div>

          <div className="bg-card border border-line rounded-xl p-4 space-y-5 max-w-xl">
            <div>
              <label className={labelCls}>How many decks?</label>
              <div className="flex items-center gap-2">
                {COUNT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    onClick={() => patch({ count: n })}
                    className={`w-12 h-9 rounded-lg border text-[13px] font-medium transition-colors ${
                      prefs.count === n ? 'border-ink bg-ink text-bg' : 'border-line bg-card text-ink-5 hover:border-line-2'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={prefs.count}
                  onChange={(e) => patch({ count: Math.max(1, Math.min(30, Math.round(Number(e.target.value) || 1))) })}
                  className="flex-1 h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink text-center tabular-nums outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
                />
              </div>
              <p className="text-[11px] text-ink-6 mt-1">Every deck rolls its own format, colours, items, pictures and caption.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {!variant && (
              <div>
                <label className={labelCls}>Format</label>
                <select value={prefs.format} onChange={(e) => patch({ format: e.target.value })} className={selectCls}>
                  <option value="">Mix it up</option>
                  {formats.map((f) => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
                <p className="text-[11px] text-ink-6 mt-1">
                  {prefs.format ? formats.find((f) => f.key === prefs.format)?.hint : 'A different format for each deck.'}
                </p>
              </div>
              )}
              <div>
                <label className={labelCls}>Background colour</label>
                <select value={prefs.theme} onChange={(e) => patch({ theme: e.target.value })} className={selectCls}>
                  <option value="">Random per deck</option>
                  {themes.map((t) => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {themes.map((t) => (
                    <button
                      key={t.name}
                      title={t.name}
                      onClick={() => patch({ theme: prefs.theme === t.name ? '' : t.name })}
                      className={`w-6 h-6 rounded-full border-2 ${prefs.theme === t.name ? 'border-ink' : 'border-line'}`}
                      style={{ background: t.bg }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {tool === 'meme' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>@handle <span className="normal-case font-normal text-ink-6">(bottom-left, optional)</span></label>
                  <input
                    value={prefs.handle}
                    onChange={(e) => patch({ handle: e.target.value })}
                    placeholder="@yourpage"
                    className={selectCls}
                  />
                </div>
                <label className="flex items-center gap-2 text-[13px] text-ink-3 sm:self-end h-9">
                  <input
                    type="checkbox"
                    checked={prefs.smallPics}
                    onChange={(e) => patch({ smallPics: e.target.checked })}
                    className="accent-ink"
                  />
                  Small pictures of the list items
                </label>
              </div>
            )}

            <label className="flex items-center gap-2 text-[13px] text-ink-3">
              <input type="checkbox" checked={prefs.upshift} onChange={(e) => patch({ upshift: e.target.checked })} className="accent-ink" />
              Mention Upshift subtly (a “Blocked P*rn (Upshift productivity app)” line + one app screenshot among the mini pictures)
            </label>

            <label className="flex items-center gap-2 text-[13px] text-ink-3">
              <input type="checkbox" checked={prefs.bait} onChange={(e) => patch({ bait: e.target.checked })} className="accent-ink" />
              Ragebait / engagement bait ({tool === 'brain' ? 'a comment-bait last slide, spicy captions, odd small pictures' : 'goon overlord / simp / mogged modes, spicy captions, odd small pictures'})
            </label>
            {tool === 'brain' && (
              <label className="flex items-center gap-2 text-[13px] text-ink-3">
                <input type="checkbox" checked={prefs.cover} onChange={(e) => patch({ cover: e.target.checked })} className="accent-ink" />
                Add the brain comparison cover slide (off by default)
              </label>
            )}

            <div className="space-y-2">
              <label className={labelCls}>Pictures</label>
              <Section title={copy.hero.label} hint={prefs.hero.length ? `${pools.hero.length} photos` : 'none picked'} defaultOpen={!prefs.hero.length}>
                <p className="text-[11px] text-ink-6 mb-2">{copy.hero.hint}</p>
                <PackPicker selected={prefs.hero} onChange={(hero) => patch({ hero })} />
              </Section>
              <Section title={copy.thumbs.label} hint={prefs.thumbs.length ? `${pools.thumbs.length} photos` : 'none picked'}>
                <p className="text-[11px] text-ink-6 mb-2">{copy.thumbs.hint}</p>
                <PackPicker selected={prefs.thumbs} onChange={(thumbs) => patch({ thumbs })} />
              </Section>
              <Section title="Viral small pictures (WTF food, burnt chicken...)" hint={prefs.viral.length ? `${pools.viral.length} photos` : 'none picked'}>
                <p className="text-[11px] text-ink-6 mb-2">Odd, shocking little pictures scattered among the mini pictures when ragebait is on.</p>
                <PackPicker selected={prefs.viral} onChange={(viral) => patch({ viral })} />
              </Section>
              <Section title="Upshift screenshots (mini picture)" hint={prefs.cta.length ? `${pools.cta.length} photos` : 'default · bundled “blocked” screenshot'}>
                <p className="text-[11px] text-ink-6 mb-2">One of these is shown small among the mini pictures where Upshift is mentioned.</p>
                <PackPicker selected={prefs.cta} onChange={(cta) => patch({ cta })} />
              </Section>
            </div>

            {(noHero || pools.thumbs.length === 0) && (
              <p className="text-[12px] text-amber-600">
                {noHero ? 'No big pictures picked' : 'No small pictures picked'}: slides are drawn without them. Make a pack in Library
                (upload, or scrape Pinterest), then pick it above. Subfolders named after the things in it match each line.
              </p>
            )}
            {error && <p className="text-[12px] text-red-600">{error}</p>}
            {done && (
              <p className="text-[12px] text-emerald-600 flex items-center gap-1">
                <Check size={13} /> Added to the Queue.
              </p>
            )}

            {videosDone > 0 && !videoProgress && (
              <p className="text-[12px] text-emerald-600 flex items-center gap-1">
                <Check size={13} /> {videosDone} video{videosDone === 1 ? '' : 's'} exported.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                icon={videoProgress ? <Loader2 size={13} className="animate-spin" /> : <Film size={13} />}
                onClick={submitVideos}
                disabled={busy || !library || !!videoProgress}
                title="Render the decks straight to video (3-6s per slide, male Characters music), skipping the queue. Keep this tab open."
              >
                {videoProgress ? `Rendering ${videoProgress.done}/${videoProgress.total}…` : `Generate ${prefs.count} video${prefs.count === 1 ? '' : 's'}`}
              </Button>
              <Button
                variant="primary"
                icon={busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                onClick={submit}
                disabled={busy || !library}
              >
                {`Generate ${prefs.count} deck${prefs.count === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
