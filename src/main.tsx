import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import CaptureBar from './components/CaptureBar'
import './index.css'

// The capture window loads this same bundle at #capture. It's a different
// surface, not a page of the app — no sidebar, no nav, no shell — so it
// branches at the root rather than inside App's router.
const isCapture = window.location.hash === '#capture'

// The app paints its own background; the capture window is transparent and
// must stay that way for the panel's corners to read as rounded.
if (isCapture) document.body.style.background = 'transparent'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isCapture ? <CaptureBar /> : <App />}</React.StrictMode>
)
