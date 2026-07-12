import { useState } from 'react';
import { Sparkles, Loader2, Copy, Check, ImagePlus, X } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { generateComments } from '../lib/api';

interface ReplyViewProps {
  canGenerate: boolean;
  model: string;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export function ReplyView({ canGenerate, model }: ReplyViewProps) {
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [comments, setComments] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setImage(await fileToDataUrl(file));
  };

  const generate = async () => {
    setError(null);
    if (!text.trim() && !image) {
      setError('Paste the post text or upload a screenshot.');
      return;
    }
    setBusy(true);
    try {
      const r = await generateComments({ text: text.trim() || undefined, image: image || undefined, model });
      setComments(r.comments);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (i: number, value: string) => {
    await navigator.clipboard.writeText(value).catch(() => {});
    setCopied(i);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <>
      <ViewHeader
        title="Reply"
        subtitle="Paste a post (or a screenshot) and get 3 short viral-style comments that sound like a real person — it answers the question if the post asks one."
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-2xl mx-auto space-y-5">
          <div className="bg-card border border-line rounded-xl p-4 space-y-3">
            <div>
              <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold mb-1.5 block">
                The post
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                placeholder="Paste the post text / title here…"
                className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-[13px] text-ink resize-none outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
              />
            </div>

            {/* Screenshot */}
            {image ? (
              <div className="flex items-start gap-3">
                <img src={image} alt="" className="h-24 rounded-lg border border-line object-cover" />
                <Button variant="secondary" icon={<X size={13} />} onClick={() => setImage(null)}>
                  Remove screenshot
                </Button>
              </div>
            ) : (
              <label className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-line text-[13px] text-ink-3 font-medium cursor-pointer hover:bg-raised">
                <ImagePlus size={13} /> Add screenshot
                <input type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0])} />
              </label>
            )}

            {error && <p className="text-[12px] text-red-600">{error}</p>}

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                icon={busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                onClick={generate}
                disabled={busy || !canGenerate}
              >
                {busy ? 'Writing…' : comments.length ? 'Regenerate' : 'Write comments'}
              </Button>
              {!canGenerate && <span className="text-[11px] text-ink-6">Add your OpenRouter key in Settings.</span>}
            </div>
          </div>

          {comments.length > 0 && (
            <div className="space-y-2">
              {comments.map((c, i) => (
                <div key={i} className="bg-card border border-line rounded-xl p-3 flex items-start gap-3">
                  <p className="flex-1 text-[14px] text-ink leading-snug">{c}</p>
                  <button
                    onClick={() => copy(i, c)}
                    className="shrink-0 text-[11px] text-ink-5 hover:text-ink flex items-center gap-1"
                  >
                    {copied === i ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                    {copied === i ? 'Copied' : 'Copy'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
