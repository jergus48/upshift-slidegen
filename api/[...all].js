// Vercel serverless entry. This filename ([...all].js under /api) is Vercel's
// catch-all convention — every request to /api/* lands here. The Express app
// itself is a valid (req, res) handler, so no adapter is needed.
import { app } from '../server/app.js'

export default app
