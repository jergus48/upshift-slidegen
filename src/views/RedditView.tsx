import { useEffect, useState } from 'react';
import { Plus, Link2, RefreshCw, Loader2, Trash2, Copy, Check, Download } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { redditFetch, redditRewrite } from '../lib/api';
import { loadRedditPosts, saveRedditPosts, newRedditPost, type RedditPost } from '../lib/localReddit';
import { downloadDataUrl } from '../lib/stripMetadata';
import { scrubImage } from '../lib/scrubImage';

interface RedditViewProps {
  canGenerate: boolean;
  model: string;
}

export function RedditView({ canGenerate, model }: RedditViewProps) {
  const [posts, setPosts] = useState<RedditPost[]>(() => loadRedditPosts());
  const [link, setLink] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { saveRedditPosts(posts); }, [posts]);

  const patch = (id: string, p: Partial<RedditPost>) =>
    setPosts((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const addManual = () => setPosts((prev) => [...prev, newRedditPost()]);
  const remove = (id: string) => setPosts((prev) => prev.filter((x) => x.id !== id));

  const importLink = async () => {
    if (!link.trim()) return;
    setError(null);
    setImporting(true);
    try {
      const r = await redditFetch(link.trim());
      setPosts((prev) => [...prev, newRedditPost({ title: r.title, body: r.body, images: r.images })]);
      setLink('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <ViewHeader
        title="Reddit"
        subtitle="Drop in existing Reddit posts and get a fresh human-sounding rewrite of each — same idea, different words. Regenerate for a new take."
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-3xl mx-auto space-y-5">
          {/* Import bar */}
          <div className="bg-card border border-line rounded-xl p-3">
            <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold mb-1.5 block">
              Add a post
            </label>
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <input
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && importLink()}
                  placeholder="Paste a Reddit post link…"
                  className="w-full h-9 bg-surface border border-line rounded-lg px-3 text-[13px] text-ink placeholder:text-ink-6 outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
                />
              </div>
              <Button
                variant="primary"
                icon={importing ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                onClick={importLink}
                disabled={importing || !link.trim()}
              >
                {importing ? 'Importing…' : 'Import link'}
              </Button>
              <Button variant="secondary" icon={<Plus size={13} />} onClick={addManual}>
                Add manually
              </Button>
            </div>
            {error && <p className="text-[12px] text-red-600 mt-2">{error}</p>}
            <p className="text-[11px] text-ink-6 mt-2">
              Link import pulls the title, body and images. If Reddit blocks it, add the post manually.
            </p>
          </div>

          {posts.length === 0 ? (
            <div className="text-center py-16 text-[13px] text-ink-5">
              No posts yet. Import a Reddit link or add one manually to get started.
            </div>
          ) : (
            posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                canGenerate={canGenerate}
                model={model}
                onPatch={(p) => patch(post.id, p)}
                onRemove={() => remove(post.id)}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}

function PostCard({
  post,
  canGenerate,
  model,
  onPatch,
  onRemove,
}: {
  post: RedditPost;
  canGenerate: boolean;
  model: string;
  onPatch: (p: Partial<RedditPost>) => void;
  onRemove: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'title' | 'body' | null>(null);

  const rewrite = async () => {
    setError(null);
    if (!post.title.trim() && !post.body.trim()) {
      setError('Add a title or body first.');
      return;
    }
    setBusy(true);
    try {
      onPatch({ rewrite: await redditRewrite(post.title, post.body, model) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (which: 'title' | 'body', text: string) => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(which);
    setTimeout(() => setCopied(null), 1200);
  };

  const downloadImage = async (url: string, i: number) => {
    // Scrub: strip metadata AND make near-invisible pixel changes so Reddit
    // sees it as a new image (not a repost). See the Clean tool.
    try {
      const clean = await scrubImage(url);
      downloadDataUrl(clean, `reddit-image-${i + 1}.jpg`);
    } catch {
      setError('Could not clean/download that image (it may block cross-origin access).');
    }
  };

  return (
    <div className="bg-card border border-line rounded-xl overflow-hidden">
      <div className="p-4 space-y-3">
        {/* Original */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold">Original</span>
          <button onClick={onRemove} aria-label="Remove post" className="text-ink-6 hover:text-red-600">
            <Trash2 size={13} />
          </button>
        </div>
        <input
          value={post.title}
          onChange={(e) => onPatch({ title: e.target.value })}
          placeholder="Post title"
          className="w-full h-9 bg-surface border border-line rounded-lg px-3 text-[13px] font-medium text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
        />
        <textarea
          value={post.body}
          onChange={(e) => onPatch({ body: e.target.value })}
          placeholder="Post body (optional)"
          rows={4}
          className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-[13px] text-ink resize-none outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
        />

        {post.images.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {post.images.map((url, i) => (
              <div key={i} className="relative group">
                <img src={url} alt="" className="h-20 rounded-lg object-cover border border-line" />
                <button
                  onClick={() => downloadImage(url, i)}
                  title="Download without metadata"
                  className="absolute top-1 right-1 w-6 h-6 rounded-md bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Download size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            icon={busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            onClick={rewrite}
            disabled={busy || !canGenerate}
          >
            {busy ? 'Writing…' : post.rewrite ? 'Regenerate' : 'Generate rewrite'}
          </Button>
          {!canGenerate && <span className="text-[11px] text-ink-6">Add your OpenRouter key in Settings.</span>}
        </div>
        {error && <p className="text-[12px] text-red-600">{error}</p>}
      </div>

      {/* Rewrite */}
      {post.rewrite && (
        <div className="border-t border-line bg-surface p-4 space-y-2">
          <span className="text-[11px] text-emerald-600 uppercase tracking-widest font-semibold">Rewrite</span>
          <FieldWithCopy
            label="Title"
            value={post.rewrite.title}
            copied={copied === 'title'}
            onCopy={() => copy('title', post.rewrite!.title)}
          />
          {post.rewrite.body && (
            <FieldWithCopy
              label="Body"
              value={post.rewrite.body}
              multiline
              copied={copied === 'body'}
              onCopy={() => copy('body', post.rewrite!.body)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function FieldWithCopy({
  label,
  value,
  multiline,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-ink-6 uppercase tracking-wide">{label}</span>
        <button onClick={onCopy} className="text-[11px] text-ink-5 hover:text-ink flex items-center gap-1">
          {copied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className={`bg-card border border-line rounded-lg px-3 py-2 text-[13px] text-ink whitespace-pre-wrap ${multiline ? '' : 'font-medium'}`}>
        {value}
      </div>
    </div>
  );
}
