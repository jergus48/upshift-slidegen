import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadAppShotDefaults } from './lib/presetScreenshots'

// Pull in the app-slide screenshots shipped with the build so they're available
// to every user, not just whoever uploaded them in their own browser.
void loadAppShotDefaults()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
