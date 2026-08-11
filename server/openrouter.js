// OpenRouter client. OpenRouter is an OpenAI-compatible gateway to hundreds of
// models behind a single key, with a public models list we surface as a dropdown.
const BASE = 'https://openrouter.ai/api/v1'

// Recommended (optional) attribution headers for OpenRouter.
const ATTRIBUTION = {
  'HTTP-Referer': 'https://github.com/slidesmith',
  'X-Title': 'Slidesmith',
}

// Public — no key required. Returns the full catalog so the UI can list models.
export async function listModels() {
  const res = await fetch(`${BASE}/models`)
  if (!res.ok) throw new Error(`OpenRouter models ${res.status}`)
  const body = await res.json()
  return (body?.data || [])
    .map((m) => ({ id: m.id, name: m.name || m.id }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Validate a key cheaply via the key-info endpoint (no token spend).
export async function validateKey(apiKey) {
  if (!apiKey) throw new Error('Missing OpenRouter API key. Add it in Settings.')
  const res = await fetch(`${BASE}/key`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: invalid key`)
  return true
}

// Balance a (possibly truncated) JSON fragment: close any string/brackets left
// open and drop a dangling trailing comma, so a response cut off mid-array can
// still be parsed. Used only as a repair path when strict parsing fails.
function balanceJson(s) {
  const stack = []
  let inStr = false
  let esc = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (esc) { esc = false; continue }
    if (c === '\\') { esc = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === '{' || c === '[') stack.push(c)
    else if (c === '}' || c === ']') stack.pop()
  }
  let out = inStr ? s + '"' : s
  out = out.replace(/,\s*$/, '') // trailing comma before the auto-closed bracket
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i] === '{' ? '}' : ']'
  return out
}

// Salvage a truncated JSON object: walk backwards from the end and, at each
// value boundary, try closing the open structures and parsing. The first prefix
// that yields valid JSON wins — so a list cut off mid-item keeps every complete
// item and just drops the partial tail. Returns null if nothing parses.
function repairJson(fragment) {
  for (let end = fragment.length; end > 0; end--) {
    const ch = fragment[end - 1]
    // Only bother at plausible value ends (}, ], ", digit, or true/false/null).
    if (end !== fragment.length && !/[}\]"0-9eln]/.test(ch)) continue
    try {
      return JSON.parse(balanceJson(fragment.slice(0, end)))
    } catch {
      /* keep trimming */
    }
  }
  return null
}

// Pull a JSON object out of a model response, tolerating code fences / prose.
// If strict parsing fails (usually a length-truncated response), fall back to a
// repair that recovers as many complete items as possible instead of erroring.
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1) throw new Error('Model did not return JSON.')
  const slice = candidate.slice(start, end > start ? end + 1 : undefined)
  try {
    return JSON.parse(slice)
  } catch (e) {
    const repaired = repairJson(candidate.slice(start))
    if (repaired && typeof repaired === 'object') return repaired
    throw new Error(`Model returned malformed JSON (${e.message}).`)
  }
}

// One chat completion that must return a JSON object. `sampling` can carry
// temperature / frequency_penalty / presence_penalty — the human-voice tools
// crank these up to escape the model's safe, generic, AI-sounding default.
// Smallest output we'll ever ask for after a credit-driven downshift — below
// this the JSON can't hold even a tiny slideshow, so failing loudly is better.
const MIN_AFFORDABLE_TOKENS = 800

export async function chatJSON({ apiKey, model, prompt, sampling = {} }) {
  if (!apiKey) throw new Error('Missing OpenRouter API key. Add it in Settings.')
  if (!model) throw new Error('No model selected. Pick one in Settings.')

  // Caller may size max_tokens to the request (see generate.js); default 6000.
  const wantTokens = Number(sampling.max_tokens) || 6000
  const { max_tokens: _ignore, ...restSampling } = sampling

  const call = async (maxTokens) => {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        ...ATTRIBUTION,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        ...restSampling,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const body = await res.json().catch(() => null)
    return { res, body }
  }

  let { res, body } = await call(wantTokens)

  // Low-balance safety net: OpenRouter 402s with "can only afford N" when the
  // requested max_tokens exceeds the account's remaining credits. Retry once
  // with a limit that fits, so a nearly-empty account still generates instead
  // of hard-failing mid-batch. See buildPrompt's adaptive sizing in generate.js.
  if (res.status === 402) {
    const afford = affordableTokens(body?.error?.message)
    if (afford && afford >= MIN_AFFORDABLE_TOKENS && afford < wantTokens) {
      ;({ res, body } = await call(afford))
    }
  }

  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${body?.error?.message || res.statusText}`)
  }
  const content = body?.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenRouter returned no content.')
  return extractJson(content)
}

// Pull the affordable token budget out of a 402 message, e.g.
// "...you can only afford 5514." → 5514. A small margin is shaved so the retry
// lands safely under the limit (prompt-token accounting can shift slightly).
function affordableTokens(message) {
  if (typeof message !== 'string') return null
  const m = message.match(/can only afford (\d+)/i)
  if (!m) return null
  return Math.max(0, Number(m[1]) - 64)
}

// Like chatJSON but supports images (vision). `images` are data URLs or http
// URLs; they're attached as image_url content parts alongside the text prompt.
// Used by the comment tool when the input is a screenshot.
export async function chatJSONVision({ apiKey, model, prompt, images = [], sampling = {} }) {
  if (!apiKey) throw new Error('Missing OpenRouter API key. Add it in Settings.')
  if (!model) throw new Error('No model selected. Pick one in Settings.')

  const content = [
    { type: 'text', text: prompt },
    ...images.filter(Boolean).map((url) => ({ type: 'image_url', image_url: { url } })),
  ]

  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      ...ATTRIBUTION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      ...sampling,
      messages: [{ role: 'user', content }],
    }),
  })

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${body?.error?.message || res.statusText}`)
  }
  const out = body?.choices?.[0]?.message?.content
  if (!out) throw new Error('OpenRouter returned no content.')
  return extractJson(out)
}
