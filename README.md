# Slidesmith

Generate on-brand TikTok/Instagram **carousel slideshows** with Claude, then schedule and post them to your connected accounts — all from a clean local dashboard you run yourself.

Slidesmith is **bring-your-own-keys** and **local-first**. There's no SaaS, no sign-up, and no database to set up. It runs on your machine, stores its config in a single file in your home directory, and uses [post-bridge](https://post-bridge.com?atp=clip-factory) to handle the hard parts (media hosting, multi-platform scheduling/posting, and analytics).

---

## How it works

```
You ──▶ Brain (niche, audience, style)
          │
          ▼
   Claude generates slideshows ──▶ Queue (review / approve)
                                      │
                                      ▼
                       Slides rendered to images in the browser
                                      │
                                      ▼
                    post-bridge ──▶ schedules + posts to TikTok / IG / …
                                      │
                                      ▼
                              Results (live analytics)
```

- **Generation** is done by an AI model via **OpenRouter** (your OpenRouter key) — pick any model from the dropdown.
- **Slide images** are rendered locally in your browser (text over a gradient *or* a background image from the Library) — no image-gen API, no cost.
- **Backgrounds** come from a bundled **image library** of curated aesthetic packs. Want more? Scrape Pinterest with your own **Apify** key (optional).
- **Scheduling, posting, and analytics** are handled by **post-bridge** (your post-bridge key). That also means **no posting integrations to build and no storage to host.**

## What you need

Two API keys, entered in the in-app **Settings** screen:

| Key | What it's for | Where to get it |
| --- | --- | --- |
| **OpenRouter** | Runs the AI that writes the slideshows (any model) | [openrouter.ai/keys](https://openrouter.ai/keys) |
| **post-bridge** | Scheduling, posting & analytics | [post-bridge.com](https://post-bridge.com?atp=clip-factory) |
| **Apify** *(optional)* | Scrape extra Pinterest images into the Library | [console.apify.com](https://console.apify.com) |

Connect your social accounts inside post-bridge — they'll show up in Slidesmith automatically.

## Quick start

```bash
git clone <this-repo>
cd slidesmith
npm install
npm run dev
```

Then open the printed Vite URL (default http://localhost:5173). On first run you'll land on **Settings** — paste your two keys, hit **Test connection**, and you're set.

`npm run dev` starts two things together:
- the **web UI** (Vite, port 5173)
- the **local server** (Node/Express, port 8787) that holds your keys and talks to Claude + post-bridge

### Production / single-process

```bash
npm run build   # build the UI
npm start       # serves the UI + API from one Node process (port 8787)
```

### Deploying for a team (Vercel)

Slidesmith can also run as a small shared deployment — e.g. two people using
the same queue and image library from a Vercel URL instead of each running it
locally. Local files don't survive on Vercel's serverless filesystem, so this
mode swaps them for two Vercel integrations, detected automatically via env
vars (no code changes, no separate config):

- **Redis** (Storage tab → connect a Redis integration, e.g. Upstash) — replaces
  `~/.slidesmith/config.json` and `queue.json`.
- **Blob** (Storage tab → Blob) — replaces `~/.slidesmith/library/` for
  scraped/uploaded images. Bundled aesthetic packs are unaffected either way —
  they ship as static files and are served the same way locally or on Vercel.

Steps:
1. Push this repo to GitHub and import it into a new Vercel project.
2. In the project's **Storage** tab, attach a Redis store and a Blob store.
   Vercel injects the right env vars automatically.
3. Set an **`APP_PASSWORD`** env var. Without it, anyone with the deployment
   URL could read your OpenRouter/post-bridge/Apify keys — see below.
4. Deploy. Open the URL, enter the shared password once, then Settings to add
   your keys — from then on everyone hitting that URL shares one queue,
   library, and set of keys.

**On security:** self-hosted Slidesmith trusts "whoever can reach 127.0.0.1"
(only you). A public Vercel URL has no such boundary, so `APP_PASSWORD` gates
every `/api/*` route behind a simple shared login, and API keys are never
sent to the browser at all (Settings shows "already set", not the value).
This is meant for a small trusted group, not a multi-tenant SaaS — everyone
who logs in shares the same keys, queue, and library.

## Using it

1. **Projects** — each project is one brand/account, with its own Brain and default posting accounts. Switch/create them from the top-left. (Your keys and chosen model are shared across all projects.)
2. **Brain** — tell the AI who this project is: niche, app/brand, audience, and style memory. This shapes every generation.
3. **Background packs** (Settings) — pick which image packs this project draws from. *Generate* then auto-applies a background to every slide. Select none for plain gradients.
4. **Queue** — hit *Generate* and the AI writes a batch of slideshows, already wearing backgrounds. Hit **Edit** on any card to preview the carousel and tweak the caption, hashtags, per-slide text, and per-slide background.
5. **Library** — browse the bundled aesthetic packs, or scrape more images from any Pinterest search with your Apify key.
6. **Approve** — pick which connected accounts to post to and either schedule a time or save as a draft in post-bridge. Slidesmith renders each slide to an image and hands it to post-bridge.
7. **Schedule / Results** — track what's queued and how published posts are performing, straight from post-bridge.

### A note on the bundled images

Slidesmith ships with ~140 curated background images organized into aesthetic packs (`public/library/`). They were collected from the web to get you started and may be subject to third-party copyright — they are not licensed stock. Swap in your own via the Library (scrape Pinterest with your own Apify key) if you need images you have the rights to.

## Where your data lives

Self-hosted (default):
- **API keys + Brain + settings:** `~/.slidesmith/config.json`
- **Generated-but-not-yet-scheduled drafts:** `~/.slidesmith/queue.json`
- **Scraped/uploaded library images:** `~/.slidesmith/library/` (bundled packs live in the repo at `public/library/`)

Deployed on Vercel (see above) — same shape, different address, shared by everyone using the deployment:
- **API keys + Brain + settings + queue:** your attached Redis store
- **Scraped/uploaded library images:** your attached Blob store

Either way: **everything else** (media, scheduled posts, results) lives in your post-bridge account, and your keys never leave the server to reach anywhere but the services they belong to (OpenRouter, post-bridge, Apify) — the browser never sees the actual values, only whether each one is set.

You can override the storage location with `SLIDESMITH_DIR` and the server port with `PORT` (see `.env.example`).

## Tech

React 19 + Vite + Tailwind (UI), a small Express server (keys + OpenRouter + post-bridge proxy), the OpenRouter API, and the post-bridge API. No database self-hosted; an optional Redis + Blob pair only if you deploy the shared-team setup on Vercel.

## License

[PolyForm Noncommercial 1.0.0](./LICENSE) — free to use, modify, self-host, and share for any **noncommercial** purpose. Commercial use (including reselling, hosting it as a paid service, or bundling it into a product you charge for) is not permitted without separate permission from the author.
