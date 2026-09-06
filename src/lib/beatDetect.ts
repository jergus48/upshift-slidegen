// Automatic beat detection for the music library.
//
// Unlike detectDropOffset() in lib/render.ts — which answers the single question
// "where does the loud part start?" with a 0.5s RMS scan — this builds a full
// BEAT GRID for a track: the tempo, and the second every beat lands on. That's
// what a beat-cut video needs, because each cut has to sit on a beat rather than
// on an arbitrary time.
//
// The method is the standard three stages, all of it plain arithmetic on the
// decoded samples so it runs in the browser with no dependencies:
//
//   1. Onset envelope — short-time FFT, then spectral flux: how much energy
//      APPEARED in each frame versus the one before it. Only rises count, so a
//      sustained pad reads as silence while a kick/snare reads as a spike.
//   2. Tempo — autocorrelate that envelope. A steady 120 BPM track correlates
//      strongly with itself shifted by exactly half a second, so the strongest
//      lag in the plausible range IS the beat period.
//   3. Phase — slide a grid of that period across the envelope and keep the
//      offset whose beats collect the most onset energy. Then snap each grid
//      point to the nearest real onset, so cuts land on an actual transient
//      instead of a mathematically perfect but slightly-off tick.
//
// Honest limits: this is built for the loud, four-on-the-floor, constant-tempo
// tracks the video pools are full of, and it is reliable there. It does not
// follow tempo changes (the grid is one fixed BPM for the whole track), and on
// rubato/live material or something beatless it will return a low `confidence`
// — check that before trusting the grid, and let the user fix it by hand.

// What part of the sound a detection listens to. A kick and a clap almost never
// land on the same set of moments, and cutting to one or the other gives a very
// different edit — so the band is the user's choice, not a fixed constant.
//
//   kick   the low thump that carries the pulse — the safest default
//   clap   snare/clap body, i.e. the backbeat you actually feel
//   hat    hi-hats and other top end, for fast subdivided cutting
//   full   everything, when a track's pulse isn't in one band
export type BeatBand = 'kick' | 'clap' | 'hat' | 'full';

// Frequency window per band, in Hz. Bins outside it are ignored, so a kick
// detection genuinely can't be triggered by a hi-hat.
const BANDS: Record<BeatBand, [number, number]> = {
  kick: [20, 160],
  clap: [900, 4000],
  hat: [6000, 16000],
  full: [20, 20000],
};

// How a detection is run.
export interface DetectOptions {
  band?: BeatBand;
  // Analyse only this window of the track, in seconds. Everything returned is
  // still in absolute track time.
  from?: number;
  to?: number;
}

// One analysed track.
export interface BeatGrid {
  bpm: number;
  // Every beat, in seconds from the start of the track, ascending.
  beats: number[];
  // 0..1, how strongly the track actually held that tempo. Below ~0.15 the
  // grid is a guess and the UI should say so.
  confidence: number;
}

// STFT geometry. 1024 samples @44.1kHz is ~23ms — long enough to resolve a kick
// from a snare, short enough that the 512-sample hop gives ~86 envelope points
// per second, i.e. ~12ms of timing resolution on the detected onsets.
const FFT_SIZE = 1024;
const HOP = 512;

// Tempo search range. Wider than most dance music needs, but half/double-time
// errors are handled by the harmonic scoring below rather than by clamping.
const MIN_BPM = 70;
const MAX_BPM = 180;

// ── FFT ──────────────────────────────────────────────────────────────────────
// Iterative in-place radix-2 Cooley-Tukey. `re`/`im` are overwritten with the
// transform. Size must be a power of two (it always is — FFT_SIZE).
function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;

  // Bit-reversal permutation: reorder the input so the butterflies below can
  // run over neighbouring pairs.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k];
        const ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br;
        im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br;
        im[i + k + len / 2] = ai - bi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

// ── Stage 1: onset envelope ──────────────────────────────────────────────────
// Mono mixdown, so a beat panned to one side isn't half as strong as one in the
// middle.
function mono(buf: AudioBuffer): Float32Array {
  const n = buf.length;
  const out = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += ch[i];
  }
  const k = 1 / Math.max(1, buf.numberOfChannels);
  for (let i = 0; i < n; i++) out[i] *= k;
  return out;
}

// Spectral flux: per frame, the summed RISE in magnitude across all bins since
// the previous frame. Magnitudes are compressed with log1p first so a quiet
// hi-hat in a quiet passage counts comparably to one in a loud chorus —
// otherwise the envelope is dominated by whichever section is mastered louder.
function onsetEnvelope(samples: Float32Array, sampleRate: number, band: BeatBand): Float32Array {
  const frames = Math.max(0, Math.floor((samples.length - FFT_SIZE) / HOP) + 1);
  if (frames < 2) return new Float32Array(0);

  // Hann window, to stop each frame's hard edges smearing energy across bins.
  const win = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
  }

  // Restrict the summed bins to the chosen band. Bin b covers b * sr / FFT_SIZE
  // Hz, so the band edges convert straight into bin indexes.
  const [loHz, hiHz] = BANDS[band];
  const hzPerBin = sampleRate / FFT_SIZE;
  const loBin = Math.max(1, Math.floor(loHz / hzPerBin));
  const hiBin = Math.min(FFT_SIZE / 2 - 1, Math.ceil(hiHz / hzPerBin));

  const bins = FFT_SIZE / 2;
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);
  let prev = new Float32Array(bins);
  let cur = new Float32Array(bins);
  const flux = new Float32Array(frames);

  for (let f = 0; f < frames; f++) {
    const off = f * HOP;
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = samples[off + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);

    let sum = 0;
    for (let b = 0; b < bins; b++) {
      const mag = Math.log1p(Math.hypot(re[b], im[b]));
      cur[b] = mag;
      if (b < loBin || b > hiBin) continue; // outside the chosen band
      const d = mag - prev[b];
      if (d > 0) sum += d; // rises only — decays are not onsets
    }
    flux[f] = sum;

    const swap = prev;
    prev = cur;
    cur = swap;
  }

  return flux;
}

// ── Stage 2: tempo ───────────────────────────────────────────────────────────
// Autocorrelation of the (mean-removed) envelope at one lag, normalised to
// 0..1-ish by the zero-lag energy so different tracks are comparable.
function autocorr(env: Float32Array, lag: number, energy: number): number {
  let sum = 0;
  for (let i = 0; i + lag < env.length; i++) sum += env[i] * env[i + lag];
  return energy > 0 ? sum / energy : 0;
}

// Best beat period, in envelope frames. Each candidate is scored with its own
// correlation plus a weakened share of its double — a track at 150 BPM also
// correlates at 75, and adding the harmonic breaks that tie in favour of the
// tempo whose subdivisions ALSO line up, which is the musically right one.
function detectPeriod(env: Float32Array, fps: number): { period: number; confidence: number } {
  const mean = env.reduce((a, b) => a + b, 0) / Math.max(1, env.length);
  const centred = new Float32Array(env.length);
  for (let i = 0; i < env.length; i++) centred[i] = env[i] - mean;

  let energy = 0;
  for (let i = 0; i < centred.length; i++) energy += centred[i] * centred[i];

  const minLag = Math.max(1, Math.round((60 / MAX_BPM) * fps));
  const maxLag = Math.min(centred.length - 1, Math.round((60 / MIN_BPM) * fps));

  let bestLag = 0;
  let bestScore = -Infinity;
  let bestRaw = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const raw = autocorr(centred, lag, energy);
    const harmonic = lag * 2 < centred.length ? autocorr(centred, lag * 2, energy) : 0;
    const score = raw + 0.5 * harmonic;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
      bestRaw = raw;
    }
  }

  return { period: bestLag, confidence: Math.max(0, Math.min(1, bestRaw)) };
}

// ── Stage 3: phase ───────────────────────────────────────────────────────────
// Which offset within one period makes the grid collect the most onset energy.
function detectPhase(env: Float32Array, period: number): number {
  let bestOff = 0;
  let bestSum = -Infinity;
  for (let off = 0; off < period; off++) {
    let sum = 0;
    for (let i = off; i < env.length; i += period) sum += env[i];
    if (sum > bestSum) {
      bestSum = sum;
      bestOff = off;
    }
  }
  return bestOff;
}

// Pull a grid point onto the nearest genuine onset peak, when there is one
// close enough (within an eighth of a beat). Keeps the grid's steady spacing
// while letting each individual cut sit on the actual transient.
function snap(frame: number, env: Float32Array, tol: number): number {
  const lo = Math.max(0, frame - tol);
  const hi = Math.min(env.length - 1, frame + tol);
  let best = frame;
  let bestVal = -Infinity;
  for (let i = lo; i <= hi; i++) {
    if (env[i] > bestVal) {
      bestVal = env[i];
      best = i;
    }
  }
  return best;
}

// ── Public API ───────────────────────────────────────────────────────────────
// The mono samples for the requested window, plus the second that window starts
// at, so detected frames can be reported back in absolute track time.
function windowOf(buf: AudioBuffer, opts: DetectOptions): { samples: Float32Array; offset: number } {
  const all = mono(buf);
  const sr = buf.sampleRate;
  const a = Math.max(0, Math.floor((opts.from ?? 0) * sr));
  const b = Math.min(all.length, Math.floor((opts.to ?? buf.duration) * sr));
  if (b - a < FFT_SIZE * 2) return { samples: all, offset: 0 };
  return { samples: all.subarray(a, b), offset: a / sr };
}

// Analyse a decoded track into a beat grid. Returns null when there's nothing
// to work with (too short, silent, or no tempo found at all).
export function detectBeats(buf: AudioBuffer, opts: DetectOptions = {}): BeatGrid | null {
  const band = opts.band ?? 'kick';
  const { samples, offset } = windowOf(buf, opts);
  const env = onsetEnvelope(samples, buf.sampleRate, band);
  if (env.length < 16) return null;

  const fps = buf.sampleRate / HOP; // envelope frames per second
  const { period, confidence } = detectPeriod(env, fps);
  if (period <= 0) return null;

  const phase = detectPhase(env, period);
  const tol = Math.max(1, Math.round(period / 8));

  const beats: number[] = [];
  for (let f = phase; f < env.length; f += period) {
    beats.push(offset + snap(f, env, tol) / fps);
  }
  // Snapping can nudge two neighbours onto the same peak; keep the grid strictly
  // ascending so downstream cut lengths are never zero or negative.
  const clean = beats.filter((t, i) => i === 0 || t > beats[i - 1] + 0.01);
  if (clean.length < 2) return null;

  return {
    bpm: Math.round((60 / (period / fps)) * 10) / 10,
    beats: clean.map((t) => Math.round(t * 1000) / 1000),
    confidence: Math.round(confidence * 100) / 100,
  };
}

// Raw transients in the chosen band, WITHOUT forcing them onto a steady grid.
// This is what "cut on the claps" needs: a clap pattern is often syncopated or
// only present in some bars, and a tempo grid would either miss those hits or
// invent beats where nothing was played.
//
// Peak picking is adaptive: a frame counts as an onset when it's the local
// maximum AND stands `sensitivity` standard deviations above the local mean, so
// a quiet verse and a loud chorus are each judged on their own terms.
export function detectOnsets(
  buf: AudioBuffer,
  opts: DetectOptions & { sensitivity?: number } = {}
): number[] {
  const band = opts.band ?? 'clap';
  const sensitivity = opts.sensitivity ?? 1.3;
  const { samples, offset } = windowOf(buf, opts);
  const env = onsetEnvelope(samples, buf.sampleRate, band);
  if (env.length < 8) return [];

  const fps = buf.sampleRate / HOP;
  const local = Math.max(4, Math.round(fps * 0.5)); // ±0.5s of context
  const minGap = Math.round(fps * 0.09); // no two hits closer than ~90ms
  const out: number[] = [];
  let last = -Infinity;

  for (let i = 1; i < env.length - 1; i++) {
    if (env[i] < env[i - 1] || env[i] < env[i + 1]) continue; // not a peak
    const lo = Math.max(0, i - local);
    const hi = Math.min(env.length, i + local);
    let mean = 0;
    for (let k = lo; k < hi; k++) mean += env[k];
    mean /= hi - lo;
    let varr = 0;
    for (let k = lo; k < hi; k++) varr += (env[k] - mean) ** 2;
    const sd = Math.sqrt(varr / (hi - lo));
    if (env[i] < mean + sensitivity * sd) continue;
    if (i - last < minGap) continue;
    last = i;
    out.push(Math.round((offset + i / fps) * 1000) / 1000);
  }
  return out;
}

// Section changes: where the track's overall character shifts — verse into
// chorus, the beat dropping in or out. Instead of frame-to-frame flux this
// compares the AVERAGE spectrum of the seconds before a point with the seconds
// after it, so a sustained change scores high while individual drum hits, which
// look the same on both sides, score near zero.
export function detectChanges(buf: AudioBuffer, opts: DetectOptions = {}): number[] {
  const { samples, offset } = windowOf(buf, opts);
  const sr = buf.sampleRate;
  const frames = Math.max(0, Math.floor((samples.length - FFT_SIZE) / HOP) + 1);
  if (frames < 40) return [];

  const win = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
  }

  // A coarse 16-band spectrum per frame is enough to tell one section from
  // another, and keeps the before/after comparison below cheap.
  const BANDS_N = 16;
  const bins = FFT_SIZE / 2;
  const perBand = Math.floor(bins / BANDS_N);
  const spec: Float32Array[] = [];
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);

  for (let f = 0; f < frames; f++) {
    const off = f * HOP;
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = samples[off + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    const row = new Float32Array(BANDS_N);
    for (let b = 0; b < BANDS_N; b++) {
      let sum = 0;
      for (let k = b * perBand; k < (b + 1) * perBand; k++) sum += Math.hypot(re[k], im[k]);
      row[b] = Math.log1p(sum / perBand);
    }
    spec.push(row);
  }

  const fps = sr / HOP;
  const half = Math.round(fps * 2); // 2s of context each side
  const novelty = new Float32Array(frames);
  for (let f = half; f < frames - half; f++) {
    let d = 0;
    for (let b = 0; b < BANDS_N; b++) {
      let before = 0;
      let after = 0;
      for (let k = 1; k <= half; k++) {
        before += spec[f - k][b];
        after += spec[f + k][b];
      }
      d += Math.abs(after - before) / half;
    }
    novelty[f] = d;
  }

  // Keep only clear peaks, and never two within 4s — sections don't change
  // faster than that, and without the gap one transition reports three times.
  let peak = 0;
  for (let i = 0; i < novelty.length; i++) peak = Math.max(peak, novelty[i]);
  if (peak <= 0) return [];
  const minGap = Math.round(fps * 4);
  const out: number[] = [];
  let last = -Infinity;
  for (let f = half; f < frames - half; f++) {
    if (novelty[f] < peak * 0.45) continue;
    if (novelty[f] < novelty[f - 1] || novelty[f] < novelty[f + 1]) continue;
    if (f - last < minGap) continue;
    last = f;
    out.push(Math.round((offset + f / fps) * 1000) / 1000);
  }
  return out;
}

// Decode a URL once and keep the buffer, so re-analysing the same track with a
// different band or window doesn't re-download and re-decode it.
const bufferCache = new Map<string, AudioBuffer>();

export async function loadTrackBuffer(url: string): Promise<AudioBuffer | null> {
  const cached = bufferCache.get(url);
  if (cached) return cached;

  const Ctor: typeof AudioContext | undefined =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  const ctx = new Ctor();
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    bufferCache.set(url, buf);
    return buf;
  } catch {
    return null;
  } finally {
    void ctx.close();
  }
}

// Fetch + decode a URL and analyse it. Returns null on any failure — a track
// that won't load simply has no grid, exactly as it has no auto-detected drop.
export async function detectBeatsFromUrl(
  url: string,
  opts: DetectOptions = {}
): Promise<BeatGrid | null> {
  const buf = await loadTrackBuffer(url);
  return buf ? detectBeats(buf, opts) : null;
}

// The beat nearest a given second — what the editor uses to turn a scrub
// position into "which beat did they mean".
export function nearestBeat(beats: number[], seconds: number): number | undefined {
  if (!beats.length) return undefined;
  let best = beats[0];
  for (const b of beats) {
    if (Math.abs(b - seconds) < Math.abs(best - seconds)) best = b;
  }
  return best;
}
