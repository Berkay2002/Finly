import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConvexProvider } from 'convex/react';
import { convex } from './sync/convexClient';
import App from './App';
import { LanguageRoot } from './i18n/LanguageRoot';
import '@fontsource-variable/inter/wght.css';
import './styles/index.css';

const app = (
  <BrowserRouter>
    <LanguageRoot>
      <App />
    </LanguageRoot>
  </BrowserRouter>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>{convex ? <ConvexProvider client={convex}>{app}</ConvexProvider> : app}</StrictMode>,
);
