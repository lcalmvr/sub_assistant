import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import App2 from './App2.jsx'
import App3 from './App3.jsx'
import AppMobile from './AppMobile.jsx'
import AppAnalyze from './AppAnalyze.jsx'
import AppAnalyze2 from './AppAnalyze2.jsx'
import AppWorkflow from './AppWorkflow.jsx'
import AppQuote from './AppQuote.jsx'
import AppQuote2 from './AppQuote2.jsx'
import AppQuote3 from './AppQuote3.jsx'
import AppQuote4 from './AppQuote4.jsx'
import AppQuote5 from './AppQuote5.jsx'
import AppQuote6 from './AppQuote6.jsx'
import AppQuote7 from './AppQuote7.jsx'
import AppQuote8 from './AppQuote8.jsx'
import AppQuote9 from './AppQuote9.jsx'
import AppQuote10 from './AppQuote10.jsx'
import AppQuote11 from './AppQuote11.jsx'
import AppQuote12 from './AppQuote12.jsx'
import AppQuote13 from './AppQuote13.jsx'
import AppQuote14 from './AppQuote14.jsx'
import AppQuote15 from './AppQuote15.jsx'
import AppQuote16 from './AppQuote16.jsx'
import AppQuote17 from './AppQuote17.jsx'
import './index.css'

const versions = {
  quote17: { component: AppQuote17, label: 'Quote v17 - Scoped Variations + Defaults' },
  quote16: { component: AppQuote16, label: 'Quote v16 - A/B Variations + Side Panel' },
  quote15: { component: AppQuote15, label: 'Quote v15 - Unified Side Editor' },
  quote14: { component: AppQuote14, label: 'Quote v14 - Analyze Style (8/4 Split)' },
  quote13: { component: AppQuote13, label: 'Quote v13 - Refined (PDF Feedback)' },
  quote12: { component: AppQuote12, label: 'Quote v12 - Compact Command' },
  quote11: { component: AppQuote11, label: 'Quote v11 - Config Refined' },
  quote10: { component: AppQuote10, label: 'Quote v10 - Matrix Dense' },
  quote9: { component: AppQuote9, label: 'Quote v9 - Matrix Only' },
  quote8: { component: AppQuote8, label: 'Quote v8 - Status Board' },
  quote7: { component: AppQuote7, label: 'Quote v7 - Workflow Ledger' },
  quote5: { component: AppQuote5, label: 'Quote v5 - Command Center' },
  quote6: { component: AppQuote6, label: 'Quote v6 - Split Comparison' },
  quote4: { component: AppQuote4, label: 'Quote v4 - Dashboard Grid' },
  quote3: { component: AppQuote3, label: 'Quote v3 - Split View Matrix' },
  quote2: { component: AppQuote2, label: 'Quote v2 - Structure Editor' },
  quote: { component: AppQuote, label: 'Quote v1 - Tower Matrix' },
  analyze2: { component: AppAnalyze2, label: 'Analyze v2 - Pricing Matrix' },
  analyze: { component: AppAnalyze, label: 'Analyze v1 - Case File' },
  workflow: { component: AppWorkflow, label: 'Workflow - Linear Steps' },
  v3: { component: App3, label: 'Layout v3 - Consolidated' },
  v2: { component: App2, label: 'Layout v2 - 3 Column' },
  original: { component: App, label: 'Layout v1 - Original' },
  mobile: { component: AppMobile, label: 'Mobile - Drawer' },
};

const DEFAULT_VERSION = 'quote17';

function MockupSwitcher() {
  const [version, setVersion] = useState(() => {
    // Try to restore from localStorage
    const saved = localStorage.getItem('mockup-version');
    return saved && versions[saved] ? saved : DEFAULT_VERSION;
  });

  const handleChange = (e) => {
    const newVersion = e.target.value;
    setVersion(newVersion);
    localStorage.setItem('mockup-version', newVersion);
  };

  const SelectedApp = versions[version]?.component || versions[DEFAULT_VERSION].component;

  return (
    <>
      {/* Discreet dropdown in top-left corner */}
      <div className="fixed top-2 left-2 z-[9999]">
        <select
          value={version}
          onChange={handleChange}
          className="text-[10px] px-2 py-1 bg-white/80 backdrop-blur border border-gray-200 rounded shadow-sm text-gray-600 hover:bg-white focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
        >
          {Object.entries(versions).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <SelectedApp />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MockupSwitcher />
  </React.StrictMode>,
)
