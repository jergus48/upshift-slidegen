// Vercel serverless entry. vercel.json rewrites every /api/* request here —
// req.url still carries the full original path (e.g. /api/library/packs),
// which is what Express needs to match its routes. The Express app itself is
// a valid (req, res) handler, so no adapter is needed.
//
// (We tried Vercel's api/[...all].js catch-all filename convention first —
// it only ever matched single-segment paths like /api/config in practice, so
// anything nested like /api/projects/:id 404'd before reaching Express. The
// explicit rewrite below is the same approach Vercel's own Express.js example
// uses and doesn't depend on that filename convention working as documented.)
import { app } from '../server/app.js'

export default app
