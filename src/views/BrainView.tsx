import { useState } from 'react';
import type { BrainState } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { GENDERS, getQuitPresets, type Gender } from '../lib/quitPresets';

interface BrainViewProps {
  brain: BrainState;
  onChange: (brain: BrainState) => void;
}

const inputClass =
  'w-full h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink ' +
  'placeholder:text-ink-6 outline-none transition-colors ' +
  'focus:border-ink-7 focus:ring-2 focus:ring-ink/10';

const textareaClass =
  'w-full bg-card border border-line rounded-lg px-3 py-2.5 text-[13px] text-ink ' +
  'placeholder:text-ink-6 outline-none transition-colors resize-none ' +
  'focus:border-ink-7 focus:ring-2 focus:ring-ink/10';

export function BrainView({ brain, onChange }: BrainViewProps) {
  const [gender, setGender] = useState<Gender>('men');
  const presets = getQuitPresets(gender);

  return (
    <>
      <ViewHeader
        title="Brain"
        subtitle="What the AI knows about this project. Edits apply to all future generations."
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-8">
          {/* Quit-habit presets */}
          <Section
            title="Quick presets"
            description="One click fills the Audience and Style memory below for a quit-habit niche. You can still tweak everything after."
          >
            {/* Men / Women pack — same niche, gender-matched persona, hooks and hobbies */}
            <div className="inline-flex p-0.5 rounded-lg border border-line bg-card mb-1">
              {GENDERS.map((gnd) => (
                <button
                  key={gnd.key}
                  onClick={() => setGender(gnd.key)}
                  className={`text-[12px] px-3 h-7 rounded-md transition-colors ${
                    gender === gnd.key ? 'bg-raised text-ink' : 'text-ink-4 hover:text-ink'
                  }`}
                >
                  {gnd.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.key}
                  onClick={() =>
                    onChange({ ...brain, niche: p.niche, audience: p.audience, styleMemory: p.styleMemory })
                  }
                  className="text-[12px] px-3 h-8 rounded-lg border border-line text-ink-3 hover:text-ink hover:border-line-2 hover:bg-raised transition-colors"
                >
                  {p.label} <span className="text-ink-6">({p.slides} slides)</span>
                </button>
              ))}
            </div>
          </Section>

          {/* Niche & app */}
          <Section title="Account context" description="Rarely changes. Defines who the AI is writing for.">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Niche">
                <input
                  value={brain.niche}
                  onChange={(e) => onChange({ ...brain, niche: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="App name">
                <input
                  value={brain.appName}
                  onChange={(e) => onChange({ ...brain, appName: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="App description">
              <textarea
                value={brain.appDescription}
                onChange={(e) => onChange({ ...brain, appDescription: e.target.value })}
                rows={2}
                className={textareaClass}
              />
            </Field>
            <Field label="Audience">
              <input
                value={brain.audience}
                onChange={(e) => onChange({ ...brain, audience: e.target.value })}
                className={inputClass}
              />
            </Field>
          </Section>

          {/* Style memory */}
          <Section
            title="Style memory"
            description="The voice and patterns that work for you. Describe your hooks, slide structure, and CTAs — the AI follows this closely."
          >
            <textarea
              value={brain.styleMemory}
              onChange={(e) => onChange({ ...brain, styleMemory: e.target.value })}
              rows={16}
              className={`${textareaClass} font-mono text-[12px] leading-relaxed`}
            />
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[13px] font-semibold text-ink uppercase tracking-widest">{title}</h2>
        <p className="text-[12px] text-ink-5 mt-1">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-ink-5 mb-1 block">{label}</label>
      {children}
    </div>
  );
}
