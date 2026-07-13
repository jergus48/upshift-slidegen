import { useState } from 'react';
import { Sparkles, Loader2, Copy, Check } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { generatePosts } from '../lib/api';

interface WriteViewProps {
  canGenerate: boolean;
  model: string;
}

type Length = 'short' | 'medium' | 'long';
interface Post {
  title: string;
  body: string;
}

export function WriteView({ canGenerate, model }: WriteViewProps) {
  const [topic, setTopic] = useState('');
  const [length, setLength] = useState<Length>('long');
  const [posts, setPosts] = useState<Post[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const generate = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await generatePosts({ topic: topic.trim() || undefined, length, model });
      setPosts(r.posts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (i: number, p: Post) => {
    const text = [p.title, p.body].filter(Boolean).join('\n\n');
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(i);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <>
      <ViewHeader
        title="Write"
        subtitle="Generate posts about self improvement or productivity that sound like a real person wrote them — title + body, no AI voice, no quotes."
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-2xl mx-auto space-y-5">
          <div className="bg-card border border-line rounded-xl p-4 space-y-3">
            <div>
              <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold mb-1.5 block">
                Topic <span className="normal-case font-normal text-ink-6">(optional)</span>
              </label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                rows={3}
                placeholder="e.g. waking up early, beating procrastination, a habit that helped… or leave blank"
                className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-[13px] text-ink resize-none outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
              />
              <span className="text-[10px] text-ink-6">Leave blank to let it pick something.</span>
            </div>

            <div>
              <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold mb-1.5 block">
                Length
              </label>
              <div className="flex gap-1.5">
                {([['short', 'Short'], ['medium', 'Medium'], ['long', 'Long']] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setLength(v)}
                    className={`h-9 px-3.5 rounded-lg border text-[12px] font-medium transition-colors ${
                      length === v ? 'border-ink bg-ink text-bg' : 'border-line bg-card text-ink-5 hover:border-line-2'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-[12px] text-red-600">{error}</p>}

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="primary"
                icon={busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                onClick={generate}
                disabled={busy || !canGenerate}
              >
                {busy ? 'Writing…' : posts.length ? 'Regenerate' : 'Write posts'}
              </Button>
              {!canGenerate && <span className="text-[11px] text-ink-6">Add your OpenRouter key in Settings.</span>}
            </div>
          </div>

          {posts.length > 0 && (
            <div className="space-y-3">
              {posts.map((p, i) => (
                <div key={i} className="bg-card border border-line rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="flex-1 text-[15px] font-semibold text-ink leading-snug">{p.title}</h3>
                    <button
                      onClick={() => copy(i, p)}
                      className="shrink-0 text-[11px] text-ink-5 hover:text-ink flex items-center gap-1"
                    >
                      {copied === i ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                      {copied === i ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-[14px] text-ink-3 leading-relaxed whitespace-pre-wrap mt-2">{p.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
