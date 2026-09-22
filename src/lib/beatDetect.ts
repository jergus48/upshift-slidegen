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
  // Cut density relative to the detected beat: 0.5 cuts on every other beat,
  // 2 on eighths, 4 on sixteenths.
  subdivision?: number;
  // Analyse only this window of the track, in seconds. Everything returned is
  // still in absolute track time.
  from?: number;
  to?: number;
  // Track at THIS tempo instead of the detected one, still finding the phase
  // and the individual beats from the audio.
  //
  // This is the single most valuable knob in the file. Measured against the 35
  // tracks in the music library, choosing the tempo is where detection actually
  // fails — the tracker itself is good. Handing it the right tempo lifts beat
  // agreement from 0.53 to 0.61 overall, and rescues the worst cases outright
  // (Monëy Twerk 0.35 → 0.97, Lex Amarni 0.29 → 0.87, Memory Reboot 0.62 →
  // 0.95). Usually the correction needed is just half or double — see the note
  // on octave errors in detectPeriod.
  bpm?: number;
}

// One analysed track.
export interface BeatGrid {
  bpm: number;
  // Every beat, in seconds from the start of the track, ascending.
  beats: number[];
  // 0..1: the lower of "does this track have a clear tempo" and "did the beats
  // land on actual transients". Below ~0.6 the grid is worth checking by hand,
  // and the editor says so. Calibrated against librosa over the music library —
  // it correlates with real grid quality at r=0.43, up from r=0.24 for the raw
  // correlation this used to report, though it is a hint and not a verdict.
  confidence: number;
}

// STFT geometry. 1024 samples @44.1kHz is ~23ms — long enough to resolve a kick
// from a snare, short enough that the 512-sample hop gives ~86 envelope points
// per second, i.e. ~12ms of timing resolution on the detected onsets.
const FFT_SIZE = 1024;
const HOP = 512;

// Frame f is computed from samples [f*HOP, f*HOP+FFT_SIZE), so a transient
// anywhere inside that window first shows up as flux at frame f — which puts a
// beat reported at f*HOP consistently EARLY. Measured against a synthetic click
// track the bias is one hop (-12.3ms at 44.1kHz), so beats are reported one hop
// later than the frame index suggests. Without this every cut lands a frame
// ahead of the drum it was meant to sit on.
const FRAME_LATENCY = 1;

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
// Autocorrelation of the (mean-removed) envelope at one lag.
//
// Normalised by the energy of the OVERLAPPING span only. Dividing every lag by
// the whole track's zero-lag energy, as this did before, gave a longer lag a
// structurally smaller sum simply because fewer terms overlap — which made the
// number incomparable between tracks, and so useless as a confidence.
function autocorr(env: Float32Array, lag: number): number {
  const n = env.length - lag;
  if (n <= 0) return 0;
  let sum = 0;
  let ea = 0;
  let eb = 0;
  for (let i = 0; i < n; i++) {
    const a = env[i];
    const b = env[i + lag];
    sum += a * b;
    ea += a * a;
    eb += b * b;
  }
  const denom = Math.sqrt(ea * eb);
  return denom > 0 ? sum / denom : 0;
}

// Best beat period, in envelope frames. Each candidate is scored with its own
// correlation plus a weakened share of its double — a track at 150 BPM also
// correlates at 75, and adding the harmonic breaks that tie in favour of the
// tempo whose subdivisions ALSO line up, which is the musically right one.
function detectPeriod(env: Float32Array, fps: number): { period: number; confidence: number } {
  const mean = env.reduce((a, b) => a + b, 0) / Math.max(1, env.length);
  const centred = new Float32Array(env.length);
  for (let i = 0; i < env.length; i++) centred[i] = env[i] - mean;

  const minLag = Math.max(1, Math.round((60 / MAX_BPM) * fps));
  const maxLag = Math.min(centred.length - 1, Math.round((60 / MIN_BPM) * fps));

  let bestLag = 0;
  let bestScore = -Infinity;
  let worstScore = Infinity;
  let sum = 0;
  let count = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const raw = autocorr(centred, lag);
    const harmonic = lag * 2 < centred.length ? autocorr(centred, lag * 2) : 0;
    const score = raw + 0.5 * harmonic;
    sum += score;
    count++;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
    if (score < worstScore) worstScore = score;
  }

  // How far the winning lag stands out from the average candidate, as a fraction
  // of the whole spread of scores. A track with a real pulse peaks far above its
  // own baseline; noise scores about the same at every lag.
  //
  // The raw correlation used to be reported instead, and it was not a usable
  // number: its size depends on the track's own envelope statistics rather than
  // on whether the tempo is right, so it read 0.04 on tracks whose grid was
  // fine. Measured against the spread it is comparable between tracks.
  const avg = sum / Math.max(1, count);
  const spread = bestScore - worstScore;
  const salience = spread > 1e-9 ? (bestScore - avg) / spread : 0;

  // OCTAVE ERRORS are this file's real weakness, and they are not solved here.
  // Checked against librosa over the 35 library tracks, the tempo is right on
  // 18 of 35 and right-up-to-an-octave on 21 — and forcing the correct tempo is
  // worth far more than any other change tried (see DetectOptions.bpm). Both a
  // log-normal prior around 125 BPM and an octave-only arbitration were written
  // and measured here, and BOTH were reverted: each fixed some tracks and broke
  // others, for no net gain (the prior moved Runaway 91 → 131.5 and The Hills
  // 83 → 180, and dropped overall agreement). Half-time locks are genuine —
  // when the kick only plays on 1 and 3, half-time IS a defensible reading of
  // the track. So the octave is left to the user, who can hear it: the editor
  // offers ½× and 2× and re-tracks at that tempo.
  return { period: bestLag, confidence: Math.max(0, Math.min(1, salience)) };
}

// ── Stage 3: beat tracking ───────────────────────────────────────────────────
// Laying a perfectly even grid over the track and snapping each point to the
// nearest peak is what the first version did, and it's why cuts drifted: real
// tracks breathe a few milliseconds either way, the error accumulates over a
// couple of minutes, and snapping then yanks individual beats onto whatever
// happened to be loud nearby — sometimes an off-beat.
//
// This is the dynamic-programming tracker instead (Ellis, 2007): find the chain
// of onset peaks through the WHOLE track that maximises
//
//     sum of onset strength  −  tightness × (how much each gap deviates from
//                                            the expected beat period)²
//
// Because it's scored globally, one weak or missing beat can't derail the grid,
// and a tempo that drifts slightly is followed rather than fought. The penalty
// is on the LOG of the ratio, so being 10% early costs the same as 10% late.
function trackBeats(env: Float32Array, period: number, tightness = 100): number[] {
  const n = env.length;
  if (n < 2 || period < 2) return [];

  // Normalise, so `tightness` means the same thing on a quiet track as a loud
  // one, and clamp negatives away — only positive evidence should attract beats.
  let mean = 0;
  for (let i = 0; i < n; i++) mean += env[i];
  mean /= n;
  let sd = 0;
  for (let i = 0; i < n; i++) sd += (env[i] - mean) ** 2;
  sd = Math.sqrt(sd / n) || 1;
  const local = new Float32Array(n);
  for (let i = 0; i < n; i++) local[i] = Math.max(0, (env[i] - mean) / sd);

  const score = new Float32Array(n);
  const prev = new Int32Array(n).fill(-1);

  // Candidate previous beats sit roughly one period back: half to double, which
  // is wide enough for real drift and narrow enough to stay cheap.
  const lo = Math.max(1, Math.round(period * 0.5));
  const hi = Math.max(lo + 1, Math.round(period * 2));

  // Precompute the transition penalty per gap — it depends only on the gap.
  const penalty = new Float32Array(hi + 1);
  for (let d = lo; d <= hi; d++) {
    penalty[d] = -tightness * Math.log(d / period) ** 2;
  }

  for (let i = 0; i < n; i++) {
    let best = 0; // starting a fresh chain here
    let bestJ = -1;
    const from = Math.max(0, i - hi);
    const to = i - lo;
    for (let j = from; j <= to; j++) {
      const cand = score[j] + penalty[i - j];
      if (cand > best) {
        best = cand;
        bestJ = j;
      }
    }
    score[i] = best + local[i];
    prev[i] = bestJ;
  }

  // Start the backtrace from the best score in the last stretch of the track,
  // not from the global maximum, so the chain reaches the end.
  let endIdx = n - 1;
  let endBest = -Infinity;
  for (let i = Math.max(0, n - hi); i < n; i++) {
    if (score[i] > endBest) {
      endBest = score[i];
      endIdx = i;
    }
  }

  const out: number[] = [];
  for (let i = endIdx; i >= 0; i = prev[i]) {
    out.push(i);
    if (prev[i] < 0) break;
  }
  return out.reverse();
}

// Turn a tracked beat list into the cut points the user asked for: halve it for
// slow, half-time cutting, or fill in evenly spaced points between beats for
// fast cutting on eighths or sixteenths.
function subdivide(beats: number[], factor: number): number[] {
  if (factor === 1 || beats.length < 2) return beats;
  if (factor < 1) {
    const every = Math.round(1 / factor);
    return beats.filter((_, i) => i % every === 0);
  }
  const out: number[] = [];
  for (let i = 0; i < beats.length - 1; i++) {
    const a = beats[i];
    const step = (beats[i + 1] - a) / factor;
    for (let k = 0; k < factor; k++) out.push(a + k * step);
  }
  out.push(beats[beats.length - 1]);
  return out;
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
  const detected = detectPeriod(env, fps);
  // An overridden tempo is trusted, so it reports full confidence in the tempo
  // itself; `support` below still judges whether the beats landed on anything.
  const period = opts.bpm && opts.bpm > 0 ? (60 / opts.bpm) * fps : detected.period;
  const confidence = opts.bpm && opts.bpm > 0 ? 1 : detected.confidence;
  if (period <= 0) return null;

  const frames = trackBeats(env, period);
  if (frames.length < 2) return null;

  // Sub-frame refinement. A frame is ~12ms wide, so a beat reported at frame
  // resolution can sit up to ~19ms off the actual transient — audible as a
  // slightly loose cut. Fitting a parabola through the envelope either side of
  // the peak recovers the true maximum between frames.
  //
  // Only valid AT A PEAK. The tracker below picks the chain that scores best
  // over the whole track, so it sometimes lands on a frame that isn't a local
  // maximum — and there the parabola is convex, its apex is a MINIMUM, and the
  // correction pushed the beat the wrong way by up to a full frame. Measured
  // against the music library that was 7% of beats on Mask Off and 4% on POWER.
  const refine = (f: number): number => {
    if (f <= 0 || f >= env.length - 1) return f;
    const a = env[f - 1];
    const b = env[f];
    const c = env[f + 1];
    if (b < a || b < c) return f; // not a peak — nothing to interpolate
    const denom = a - 2 * b + c;
    if (denom >= 0) return f; // flat, or convex: the apex would be a minimum
    const delta = (0.5 * (a - c)) / denom;
    return f + Math.max(-1, Math.min(1, delta));
  };

  const tracked = frames.map((f) => offset + (refine(f) + FRAME_LATENCY) / fps);
  const beats = subdivide(tracked, opts.subdivision ?? 1)
    .map((t) => Math.round(t * 1000) / 1000)
    .filter((t, i, a) => i === 0 || t > a[i - 1] + 0.01);
  if (beats.length < 2) return null;

  // Report the tempo the tracker actually held, not the autocorrelation's
  // estimate — after tracking they can differ slightly, and this is the one the
  // beats were built from. Averaged rather than taken from the median gap: a
  // median lands on one quantised span, which reads a beat or two per minute off.
  const spans = tracked.slice(1).map((t, i) => t - tracked[i]);
  const avg = spans.reduce((a, b) => a + b, 0) / Math.max(1, spans.length) || period / fps;

  // Two different things can go wrong independently, so confidence needs both.
  // `confidence` from detectPeriod says whether the track HAS a clear tempo;
  // `support` says whether the beats we placed actually landed on transients —
  // the onset envelope at the beats, against its level everywhere. A grid can
  // hold a perfectly steady tempo while sitting in the gaps, and that scores
  // high on the first and low on the second, so the lower of the two is the
  // honest number to show.
  let atBeats = 0;
  for (const f of frames) {
    let peak = 0;
    for (let k = Math.max(0, f - 1); k <= Math.min(env.length - 1, f + 1); k++) {
      if (env[k] > peak) peak = env[k];
    }
    atBeats += peak;
  }
  atBeats /= Math.max(1, frames.length);
  let overall = 0;
  for (let i = 0; i < env.length; i++) overall += env[i];
  overall /= Math.max(1, env.length);
  const support = atBeats > 0 ? Math.max(0, Math.min(1, 1 - overall / atBeats)) : 0;

  return {
    bpm: Math.round((60 / avg) * 10) / 10,
    beats,
    confidence: Math.round(Math.min(confidence, support) * 100) / 100,
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
    out.push(Math.round((offset + (i + FRAME_LATENCY) / fps) * 1000) / 1000);
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

// ── HITS: the loud moments, with no tempo model at all ───────────────────────
//
// Everything above this point builds a metronomic GRID: one tempo, evenly
// spaced beats. That is the wrong tool for "cut on the big hits". A grid puts a
// cut where the metronome says, not where the track actually punches, so when
// the tempo is even slightly off — and measured against the library it is wrong
// on nearly half the tracks — the cuts land on nothing. It also can't represent
// what people actually hear: the kick that's twice as loud as the others, the
// bar where the bass drops out, the hit right on the drop.
//
// detectHits answers the direct question instead: WHERE DOES THIS TRACK GET
// SUDDENLY LOUD? No tempo, no band choice, no assumption that hits are evenly
// spaced. A hit is a moment that is both
//
//   sudden — the energy jumped sharply against the instant before it, which is
//            what separates a kick from a sustained bass note holding the same
//            level, and
//   loud   — it's near the track's own peak, not a small tick in a quiet gap.
//
// Both matter, and either alone gives the wrong answer: scoring only suddenness
// promotes tiny clicks in silence, and scoring only loudness smears across
// whole loud sections without finding the attack.
//
// Energy is measured with a heavy low-end bias, because the "most heard" hit in
// this kind of music is the kick and the bass — that's the part you feel.

// Envelope resolution for hit detection: 64 samples is 1.5ms at 44.1kHz, fine
// enough that a cut lands exactly on the attack rather than near it.
const HIT_HOP = 64;

// The attack is measured against the level this far back — 40ms is longer than
// a kick's rise and shorter than a musical gap, so a real attack shows its full
// jump while a sustained note shows almost none.
const ATTACK_MS = 40;

// Two hits closer than this are the same event. 100ms also happens to be about
// the fastest a kick pattern runs, so this rarely discards a real one.
const MIN_HIT_GAP_MS = 100;

// One detected hit.
export interface Hit {
  // Seconds into the track.
  time: number;
  // 0..1 within this track — how much this moment stands out. The biggest hit
  // in the track is 1. Use it to take "the top N hits" or to size a punch.
  strength: number;
}

// A one-pole lowpass, run forwards then backwards so it adds no delay. Phase
// matters here: a one-directional filter would push every detected hit late by
// an amount that depends on frequency.
function lowpassEnergy(x: Float32Array, sampleRate: number, hz: number): Float32Array {
  const a = 1 - Math.exp((-2 * Math.PI * hz) / sampleRate);
  const y = new Float32Array(x.length);

  let v = 0;
  for (let i = 0; i < x.length; i++) {
    v += a * (x[i] - v);
    y[i] = v;
  }
  for (let i = x.length - 1; i >= 0; i--) {
    v += a * (y[i] - v);
    y[i] = v;
  }
  return y;
}

// Frame-summed |signal|, i.e. the amplitude envelope at HIT_HOP resolution.
function rectifiedFrames(y: Float32Array): Float32Array {
  const frames = Math.floor(y.length / HIT_HOP);
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const off = f * HIT_HOP;
    for (let i = 0; i < HIT_HOP; i++) sum += Math.abs(y[off + i]);
    out[f] = sum / HIT_HOP;
  }
  return out;
}

export interface HitOptions {
  // Analyse only this window of the track, in seconds. Times come back in
  // absolute track time either way.
  from?: number;
  to?: number;
  // Keep only the strongest N hits. Omit for every hit that clears `minStrength`
  // — for a beat-cut video, asking for a count is usually what you want.
  limit?: number;
  // Drop hits weaker than this. 1.0 is a normal strong hit for the track (see
  // the percentile note in detectHits), so this is "how hard must it punch".
  // The 0.7 default lands around one cut every 0.37s across the music library —
  // the real kicks and bass hits, not every tick. Lower it to cut more often:
  // 0.5 roughly doubles the count, 0.85 keeps only the biggest moments.
  minStrength?: number;
}

// The loud, sudden moments in a track, strongest first by `strength` but
// returned in time order. This is what a beat-cut video should cut on.
export function detectHits(buf: AudioBuffer, opts: HitOptions = {}): Hit[] {
  const { samples, offset } = windowOf(buf, opts);
  const sr = buf.sampleRate;
  if (samples.length < HIT_HOP * 32) return [];

  // Two views of the track: the low end, which carries the kick and bass and is
  // what the score is mostly built on, and the full band, so a hit that is
  // mostly midrange (a big snare or a stab) still registers.
  const low = rectifiedFrames(lowpassEnergy(samples, sr, 200));
  const full = rectifiedFrames(samples);
  const n = Math.min(low.length, full.length);
  if (n < 16) return [];

  const fps = sr / HIT_HOP;
  const back = Math.max(1, Math.round((ATTACK_MS / 1000) * fps));

  let peakLow = 0;
  let peakFull = 0;
  for (let f = 0; f < n; f++) {
    if (low[f] > peakLow) peakLow = low[f];
    if (full[f] > peakFull) peakFull = full[f];
  }
  if (peakLow <= 0 && peakFull <= 0) return [];

  const eps = 1e-6;
  const score = new Float32Array(n);
  for (let f = back; f < n; f++) {
    // How sudden, in dB: the jump from 40ms ago. A sustained note scores ~0 dB
    // here however loud it is; only an attack scores.
    const riseLow = 20 * Math.log10((low[f] + eps) / (low[f - back] + eps));
    const riseFull = 20 * Math.log10((full[f] + eps) / (full[f - back] + eps));
    const rise = Math.max(0, riseLow) + 0.5 * Math.max(0, riseFull);

    // How loud, against the track's own peak. Square-rooted so a hit at half the
    // peak still counts strongly — otherwise only the single loudest section of
    // the track ever produces cuts.
    const loud = Math.sqrt(
      Math.max(low[f] / (peakLow + eps), 0.5 * (full[f] / (peakFull + eps)))
    );

    score[f] = rise * loud;
  }

  // Keep local maxima, spaced. Walking in time and keeping the strongest peak
  // within each window (rather than greedily taking the first) means a big kick
  // is never suppressed by a small tick that happened 20ms earlier.
  const peaks: Hit[] = [];
  for (let f = 1; f < n - 1; f++) {
    if (score[f] <= 0) continue;
    if (score[f] < score[f - 1] || score[f] < score[f + 1]) continue;
    const last = peaks[peaks.length - 1];
    const time = offset + f / fps;
    if (last && time - last.time < MIN_HIT_GAP_MS / 1000) {
      // Same event as the previous peak — keep whichever actually hit harder.
      if (score[f] > last.strength) {
        last.time = time;
        last.strength = score[f];
      }
      continue;
    }
    peaks.push({ time, strength: score[f] });
  }
  if (!peaks.length) return [];

  // Normalise strength so it means the same thing on every track.
  //
  // Against the single biggest hit, one outlier sets the scale for everything —
  // a track with one enormous crash rates all its kicks as weak, and the same
  // `minStrength` then kept 15 hits on one track and 126 on another. The 90th
  // percentile is the level of a normal strong hit, so a track's typical kick
  // scores near 1 wherever it sits against that track's loudest single moment.
  const ranked = [...peaks].map((h) => h.strength).sort((a, b) => a - b);
  const ref = ranked[Math.min(ranked.length - 1, Math.floor(ranked.length * 0.9))];
  if (!(ref > 0)) return [];
  for (const h of peaks) h.strength = Math.min(1, h.strength / ref);

  const floor = opts.minStrength ?? 0.7;
  let kept = peaks.filter((h) => h.strength >= floor);
  if (opts.limit && kept.length > opts.limit) {
    kept = [...kept].sort((a, b) => b.strength - a.strength).slice(0, opts.limit);
  }

  return kept
    .sort((a, b) => a.time - b.time)
    .map((h) => ({ time: Math.round(h.time * 1000) / 1000, strength: Math.round(h.strength * 100) / 100 }));
}

// The drop: where the track's low end arrives and STAYS.
//
// detectChanges() finds section boundaries, but it uses |after - before| so a
// breakdown — the energy leaving — scores exactly as high as a drop. This is
// signed and low-band only, so it answers the actual question: after which
// moment is there suddenly much more bass than before it, and does it hold?
export function detectDrop(buf: AudioBuffer, opts: HitOptions = {}): number | null {
  const { samples, offset } = windowOf(buf, opts);
  const sr = buf.sampleRate;
  const low = rectifiedFrames(lowpassEnergy(samples, sr, 200));
  const fps = sr / HIT_HOP;
  const n = low.length;

  // Compare 2s before against 4s after: a drop must SUSTAIN, which is what
  // separates it from a single loud fill or crash.
  const before = Math.round(fps * 2);
  const after = Math.round(fps * 4);
  if (n < before + after + 2) return null;

  const mean = (from: number, to: number) => {
    let s = 0;
    for (let i = from; i < to; i++) s += low[i];
    return s / Math.max(1, to - from);
  };

  let bestAt = -1;
  let bestGain = 0;
  for (let f = before; f < n - after; f++) {
    const b = mean(f - before, f);
    const a = mean(f, f + after);
    const gain = a - b; // signed: a breakdown is negative and never wins
    if (gain > bestGain) {
      bestGain = gain;
      bestAt = f;
    }
  }
  if (bestAt < 0) return null;

  // Snap to the hit that opens the section, so the cut lands on the impact
  // rather than a few milliseconds of pre-roll.
  const at = offset + bestAt / fps;
  const hits = detectHits(buf, { from: Math.max(0, at - 0.4), to: at + 0.4, minStrength: 0.3 });
  const onset = hits.length ? hits.reduce((m, h) => (h.strength > m.strength ? h : m)) : null;
  return Math.round((onset ? onset.time : at) * 1000) / 1000;
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

// ── The one-button detector ──────────────────────────────────────────────────
// Everything above is the toolbox; this is what the editor actually calls. It
// answers the only question a beat-cut video asks — "where does this track hit
// hardest?" — with no options to get wrong.
//
// It is deliberately NOT just a tempo grid. A grid alone was the first version
// and it was wrong in both directions at once: it marked bars where no drum was
// playing, and it could not mark a triplet kick roll or a bass stab that lands
// between beats, because by construction nothing exists between beats. What a
// person points at when they say "that hit" is a TRANSIENT, not a tick.
//
// So the markers come from two sources and are merged:
//
//   ACCENTS  every real low-end transient, found by their own onset detector at
//            ~6ms resolution with a threshold that follows the track's local
//            loudness. Off-grid rolls and syncopated bass land here.
//   GRID     the tracked beat grid, which fills the steady pulse back in where
//            the accent detector found nothing worth marking — a beat carried
//            by a soft kick under a loud vocal is still a beat you cut on.
//
// Where the two agree (within ~90ms) the accent's time wins, because it sits on
// the actual attack rather than on the grid's idea of where the attack should
// be.

// How close two markers can be before they are the same event. 90ms is about as
// fast as a kick roll runs, so this keeps rolls intact while collapsing the
// double-marks that come from a kick and its own bass tail.
const MIN_MARK_GAP = 0.09;

// One low-end transient: when it hit, and how hard relative to its neighbours.
interface Accent {
  time: number;
  score: number;
}

// Every significant low-frequency attack in the window.
//
// The score is a rise measured in dB against 40ms earlier, times how loud the
// moment is against the track's peak — a sustained bass note scores ~0 however
// loud it is, and only an ATTACK scores. Both halves matter: rise alone marks
// every tick in a quiet passage, loudness alone marks the middle of long notes.
//
// The threshold is LOCAL: a running median plus a multiple of the local spread,
// over a few seconds either side. A global cut-off is what made the previous
// version skip whole sections — a stripped verse under a loud chorus reads as
// "nothing here" against a track-wide number, however plainly the kick is
// playing.
function detectAccents(samples: Float32Array, sr: number, offset: number): Accent[] {
  if (samples.length < HIT_HOP * 64) return [];

  // Two views: the low end, which is where kicks and bass live and is what the
  // user is actually pointing at, and the full band, so a big snare or stab
  // still registers rather than being filtered away.
  const low = rectifiedFrames(lowpassEnergy(samples, sr, 200));
  const full = rectifiedFrames(samples);
  const n = Math.min(low.length, full.length);
  if (n < 64) return [];

  const fps = sr / HIT_HOP;
  const back = Math.max(1, Math.round((ATTACK_MS / 1000) * fps));

  let peakLow = 0;
  let peakFull = 0;
  for (let f = 0; f < n; f++) {
    if (low[f] > peakLow) peakLow = low[f];
    if (full[f] > peakFull) peakFull = full[f];
  }
  if (peakLow <= 0 && peakFull <= 0) return [];

  const eps = 1e-6;
  const score = new Float32Array(n);
  for (let f = back; f < n; f++) {
    const riseLow = 20 * Math.log10((low[f] + eps) / (low[f - back] + eps));
    const riseFull = 20 * Math.log10((full[f] + eps) / (full[f - back] + eps));
    const rise = Math.max(0, riseLow) + 0.5 * Math.max(0, riseFull);
    const loud = Math.sqrt(
      Math.max(low[f] / (peakLow + eps), 0.5 * (full[f] / (peakFull + eps)))
    );
    score[f] = rise * loud;
  }

  // Local threshold, from a coarse running mean and spread of the score. Walked
  // in blocks of ~0.5s rather than per frame — the statistics barely move
  // between neighbouring frames, and this keeps the pass linear and cheap.
  const block = Math.max(1, Math.round(0.5 * fps));
  const span = 4; // blocks either side ≈ ±2s of context
  const blocks = Math.ceil(n / block);
  const bMean = new Float32Array(blocks);
  for (let b = 0; b < blocks; b++) {
    let sum = 0;
    let count = 0;
    for (let f = b * block; f < Math.min(n, (b + 1) * block); f++) {
      sum += score[f];
      count++;
    }
    bMean[b] = count ? sum / count : 0;
  }
  const threshold = new Float32Array(blocks);
  for (let b = 0; b < blocks; b++) {
    let sum = 0;
    let count = 0;
    for (let k = Math.max(0, b - span); k <= Math.min(blocks - 1, b + span); k++) {
      sum += bMean[k];
      count++;
    }
    // 3.5× the local average score. Measured over nine tracks (trap, EDM,
    // slowed/reverb, lo-fi indie): at 3× the hi-hat layer starts coming through
    // as marks, and at 4× the kick rolls stop being found at all — 3.5 keeps
    // the rolls while staying above the ticks.
    threshold[b] = (sum / Math.max(1, count)) * 3.5;
  }

  // Peak-pick: local maxima over the threshold, spaced by MIN_MARK_GAP. Keeping
  // the strongest peak inside each window rather than the first means a real
  // kick is never suppressed by a small tick 20ms ahead of it.
  const out: Accent[] = [];
  for (let f = 1; f < n - 1; f++) {
    const v = score[f];
    if (v <= 0 || v < threshold[Math.min(blocks - 1, Math.floor(f / block))]) continue;
    if (v < score[f - 1] || v < score[f + 1]) continue;
    const time = offset + f / fps;
    const last = out[out.length - 1];
    if (last && time - last.time < MIN_MARK_GAP) {
      if (v > last.score) {
        last.time = time;
        last.score = v;
      }
      continue;
    }
    out.push({ time, score: v });
  }
  return out;
}

// Find the moments worth cutting on. `bpm` overrides the detected tempo, for
// when the ear says it came out at the wrong octave; `from`/`to` limit the
// analysis to a window, with times still returned in absolute track time.
export function detectKicks(
  buf: AudioBuffer,
  opts: { from?: number; to?: number; bpm?: number } = {}
): BeatGrid | null {
  const { samples, offset } = windowOf(buf, opts);
  const sr = buf.sampleRate;
  const accents = detectAccents(samples, sr, offset);
  const grid = detectBeats(buf, { band: 'kick', subdivision: 1, ...opts });

  // Nothing percussive at all — fall back to whatever the grid found, and let
  // its own confidence tell the user how much to trust it.
  if (!accents.length) return grid;

  // DENSITY IS THE POINT. A marker on every beat is not what an editor wants —
  // cutting that often is exhausting to watch, and it also means no single
  // marker is telling you anything. What earns a cut is the strongest moment in
  // a PHRASE: roughly one per bar, landing exactly on its transient.
  //
  // So the accents are thinned by a moving window one bar wide (four beats, or
  // two seconds when there's no tempo): the hardest hit in each window survives
  // and the rest are dropped. The survivor keeps its own precise time, so
  // fewer markers does not mean looser markers.
  // The windows are the BARS THEMSELVES, taken from the tracked grid, rather
  // than a gap walked forward from the last pick. Walking greedily was tried
  // first and it drifts: replacing the current pick with a later, harder hit
  // pushes the window along with it, and the holes compound into five- and
  // six-second stretches with no marker at all. Anchored windows can't drift —
  // every bar contributes exactly one marker.
  const period = grid && grid.bpm > 0 ? 60 / grid.bpm : 0.5;
  const bar = period * 4;

  const edges: number[] = [];
  if (grid) {
    for (let k = 0; k < grid.beats.length; k += 4) edges.push(grid.beats[k]);
    edges.push(grid.beats[grid.beats.length - 1] + period);
  } else {
    const first = accents[0].time;
    const last = accents[accents.length - 1].time;
    for (let t = first; t <= last + bar; t += bar) edges.push(t);
  }

  const beats: number[] = [];
  let ai = 0;
  for (let w = 0; w < edges.length - 1; w++) {
    let best: Accent | null = null;
    while (ai < accents.length && accents[ai].time < edges[w]) ai++;
    for (let k = ai; k < accents.length && accents[k].time < edges[w + 1]; k++) {
      if (!best || accents[k].score > best.score) best = accents[k];
    }
    // A bar whose accents were all noise still gets its downbeat from the grid,
    // so a passage carried by a soft kick doesn't read as a gap.
    beats.push(best ? best.time : edges[w]);
  }

  beats.sort((a, b) => a - b);
  const out = beats
    .map((t) => Math.round(t * 1000) / 1000)
    .filter((t, i, a) => i === 0 || t - a[i - 1] >= MIN_MARK_GAP);
  if (out.length < 2) return grid;

  return {
    bpm: grid?.bpm ?? 0,
    beats: out,
    confidence: grid?.confidence ?? 0.5,
  };
}
