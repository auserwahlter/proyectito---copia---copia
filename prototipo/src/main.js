import { createElement, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './control.css'
import './functional.css'
import './theme.css'
import './streams.css'
import './dark.css'
import './score.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  createElement(StrictMode, null, createElement(App)),
)