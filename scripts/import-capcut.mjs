// Import every `<song>-<format>` CapCut project into public/formats/capcut/.
// The same import the Brain → Video formats button runs through the server.
//
//   node scripts/import-capcut.mjs
import { importAll } from '../server/capcutImport.js'

const { imported, errors } = await importAll()
for (const f of imported) {
  console.log(`✓ ${f.id}`)
  for (const w of f.warnings) console.log(`    ! ${w}`)
}
for (const e of errors) console.log(`✗ ${e.project}: ${e.error}`)
