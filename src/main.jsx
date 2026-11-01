
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import PreferenceRoot from './PreferenceRoot.jsx'
import './index.css'
import './UnifiedTypography.css'
import './DarkTheme.css'
import './SystemTabs.css'
import './ControlAlignment.css'
import './SummaryTiles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PreferenceRoot />
  </StrictMode>,
)
