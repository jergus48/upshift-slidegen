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

// Pull a JSON object out of a model response, tolerating code fences / prose.
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('Model did not return JSON.')
  return JSON.parse(candidate.slice(start, end + 1))
}

// One chat completion that must return a JSON object. `sampling` can carry
// temperature / frequency_penalty / presence_penalty — the human-voice tools
// crank these up to escape the model's safe, generic, AI-sounding default.
export async function chatJSON({ apiKey, model, prompt, sampling = {} }) {
  if (!apiKey) throw new Error('Missing OpenRouter API key. Add it in Settings.')
  if (!model) throw new Error('No model selected. Pick one in Settings.')

  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      ...ATTRIBUTION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 6000,
      response_format: { type: 'json_object' },
      ...sampling,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${body?.error?.message || res.statusText}`)
  }
  const content = body?.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenRouter returned no content.')
  return extractJson(content)
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
