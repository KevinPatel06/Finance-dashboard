import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { ThemeProvider } from './lib/theme';
import { CelebrationProvider } from './lib/celebration';
import { UIProvider } from './lib/ui';

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
