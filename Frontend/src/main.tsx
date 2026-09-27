/**
 * App entry point. Mounts the React tree into #root (see index.html) and
 * loads the global stylesheet with the design tokens.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
