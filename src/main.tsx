import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { ThemeProvider } from './lib/theme';
import { CelebrationProvider } from './lib/celebration';
import { UIProvider } from './lib/ui';
import { bootstrapPlatform } from './platform';

// On iOS the database and window.api are built in-process, so nothing may
// render until that resolves. On Electron this is a no-op.
bootstrapPlatform()
  .catch((err) => {
    console.error('Platform bootstrap failed:', err);
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML =
        '<div style="padding:2rem;font-family:system-ui;color:#e5e7eb;background:#0b0d12;' +
        'height:100vh"><h1 style="font-size:1.1rem">Could not start</h1>' +
        '<p style="opacity:.7;font-size:.9rem">The database could not be opened. ' +
        'Reopen the app; if this persists, restore from a backup.</p></div>';
    }
    throw err;
  })
  .then(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <ThemeProvider>
          <HashRouter>
            <UIProvider>
              <CelebrationProvider>
                <App />
              </CelebrationProvider>
            </UIProvider>
          </HashRouter>
        </ThemeProvider>
      </React.StrictMode>
    );
  });
