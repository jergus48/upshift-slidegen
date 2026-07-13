import { useState } from 'react';
import { Wand2, Loader2, Copy, Check } from 'lucide-react';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { generateFlowPrompts } from '../lib/api';

interface PromptViewProps {
  canGenerate: boolean;
  model: string;
}

const ENVIRONMENTS = [
  'Modern kitchen', 'Home gym', 'Commercial gym', 'Bedroom', 'Bathroom mirror', 'Living room',
  'Home office / desk', 'Library', 'Cafe', 'Office', 'Car interior', 'City street', 'Park / outdoors',
  'Rooftop', 'Beach', 'Hotel room', 'Closet / mirror', 'Locker room',
];

const ACTIVITIES = [
  // Selfies / posing
  'POV front-facing selfie', 'Mirror selfie in gym', 'Bathroom mirror selfie', 'Gym workout selfie',
  'Post-workout selfie', 'Full-body mirror outfit check', 'Getting ready', 'Coffee in hand',
  'Sitting on kitchen counter', 'Lounging on bed',
  // Productivity / self-improvement
  'Studying at a desk', 'Deep focus on laptop', 'Journaling in a notebook', 'Meditating calmly',
  'Reading a book', 'Morning routine', 'Planning the day / to-do list', 'After a cold shower',
  'Stretching / yoga', 'Making the bed', 'Drinking water', 'Walking outdoors', 'Cooking a healthy meal',
  // Quitting-habit situations
  'Throwing cigarettes in the trash', 'Snapping a cigarette in half', 'Pouring out alcohol',
  'Throwing away a vape', 'Holding phone showing an app blocker', 'Checking a streak on phone',
  'Resisting a craving, hand raised', 'Motivated after a workout', 'Fresh and focused, no phone',
  'Calm and in control, empty hands',
];

const ASPECT_RATIOS = ['4:5', '3:4', '9:16', '1:1'];

export function PromptView({ canGenerate, model }: PromptViewProps) {
  const [gender, setGender] = useState<'man' | 'woman'>('woman');
  const [environment, setEnvironment] = useState('Modern kitchen');
  const [activity, setActivity] = useState('POV front-facing selfie');
  const [aspectRatio, setAspectRatio] = useState('4:5');
  const [count, setCount] = useState(1);
  const [prompts, setPrompts] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const generate = async () => {
    setError(null);
    if (!environment.trim() || !activity.trim()) {
      setError('Pick an environment and an activity.');
      return;
    }
    setBusy(true);
    try {
      const r = await generateFlowPrompts({ gender, environment: environment.trim(), activity: activity.trim(), aspectRatio, count, model });
      setPrompts(r.prompts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (i: number, value: Record<string, unknown>) => {
    await navigator.clipboard.writeText(JSON.stringify(value, null, 2)).catch(() => {});
    setCopied(i);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <>
      <ViewHeader
        title="Prompt"
        subtitle="Generate structured JSON image prompts for Google Flow with your anchored character — pick a subject, environment and shot."
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        <div className="max-w-3xl mx-auto space-y-5">
          <div className="bg-card border border-line rounded-xl p-4 space-y-4">
            {/* Subject */}
            <div>
              <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold mb-1.5 block">Subject</label>
              <div className="flex gap-1.5">
                {(['woman', 'man'] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGender(g)}
                    className={`h-9 px-4 rounded-lg border text-[13px] font-medium capitalize transition-colors ${
                      gender === g ? 'border-ink bg-ink text-bg' : 'border-line bg-card text-ink-5 hover:border-line-2'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* Environment */}
            <div>
              <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold mb-1.5 block">Environment</label>
              <input
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                placeholder="e.g. modern kitchen, home gym…"
                className="w-full h-9 bg-surface border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {ENVIRONMENTS.map((e) => (
                  <button
                    key={e}
                    onClick={() => setEnvironment(e)}
                    className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                      environment === e ? 'border-ink bg-raised text-ink' : 'border-line text-ink-5 hover:text-ink hover:border-line-2'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {/* Activity */}
            <div>
              <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold mb-1.5 block">Activity / shot</label>
              <input
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                placeholder="type your own, or pick below…"
                className="w-full h-9 bg-surface border border-line rounded-lg px-3 text-[13px] text-ink outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {ACTIVITIES.map((a) => (
                  <button
                    key={a}
                    onClick={() => setActivity(a)}
                    className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                      activity === a ? 'border-ink bg-raised text-ink' : 'border-line text-ink-5 hover:text-ink hover:border-line-2'
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {/* Aspect + count */}
            <div className="flex gap-5 flex-wrap">
              <div>
                <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold mb-1.5 block">Aspect ratio</label>
                <div className="flex gap-1.5">
                  {ASPECT_RATIOS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setAspectRatio(r)}
                      className={`h-9 px-3 rounded-lg border text-[12px] font-medium transition-colors ${
                        aspectRatio === r ? 'border-ink bg-ink text-bg' : 'border-line bg-card text-ink-5 hover:border-line-2'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold mb-1.5 block">How many</label>
                <div className="flex gap-1.5">
                  {[1, 3, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setCount(n)}
                      className={`h-9 w-10 rounded-lg border text-[13px] font-medium transition-colors ${
                        count === n ? 'border-ink bg-ink text-bg' : 'border-line bg-card text-ink-5 hover:border-line-2'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error && <p className="text-[12px] text-red-600">{error}</p>}

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="primary"
                icon={busy ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                onClick={generate}
                disabled={busy || !canGenerate}
              >
                {busy ? 'Generating…' : prompts.length ? 'Regenerate' : 'Generate prompts'}
              </Button>
              {!canGenerate && <span className="text-[11px] text-ink-6">Add your OpenRouter key in Settings.</span>}
            </div>
          </div>

          {prompts.map((p, i) => (
            <div key={i} className="bg-card border border-line rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
                <span className="text-[11px] text-ink-6 uppercase tracking-widest font-semibold">Prompt {i + 1}</span>
                <button
                  onClick={() => copy(i, p)}
                  className="text-[11px] text-ink-5 hover:text-ink flex items-center gap-1"
                >
                  {copied === i ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                  {copied === i ? 'Copied' : 'Copy JSON'}
                </button>
              </div>
              <pre className="text-[11px] leading-relaxed text-ink-3 p-4 overflow-x-auto whitespace-pre">
                {JSON.stringify(p, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
