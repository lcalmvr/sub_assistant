import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import App2 from './App2.jsx'
import App3 from './App3.jsx'
import AppMobile from './AppMobile.jsx'
import AppAnalyze from './AppAnalyze.jsx'
import AppAnalyze2 from './AppAnalyze2.jsx'
import AppWorkflow from './AppWorkflow.jsx'
import './index.css'

// Toggle between different versions
// Options: 'original', 'v2', 'v3', 'mobile', 'analyze', 'analyze2', 'workflow'
//
// original - Basic 2-column layout
// v2       - 3-column with extraction conflicts panel
// v3       - Consolidated: combined header, broker popover, page-specific layouts
// analyze  - Analyze page with case file and workbench layout
// analyze2 - Analyze page with interactive pricing matrix and slide-over comps modal
// workflow - Linear workflow navigation with step-by-step progression
// mobile   - Mobile responsive version
//
const VERSION = 'analyze2';

const versions = {
  original: App,
  v2: App2,
  v3: App3,
  analyze: AppAnalyze,
  analyze2: AppAnalyze2,
  workflow: AppWorkflow,
  mobile: AppMobile,
};

const SelectedApp = versions[VERSION] || App;

// Debug: Log which version is being used
console.log('Rendering version:', VERSION, 'Component:', SelectedApp.name);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SelectedApp />
  </React.StrictMode>,
)

