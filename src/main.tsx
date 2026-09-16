import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConvexProvider } from 'convex/react';
import { convex } from './sync/convexClient';
import App from './App';
import './styles/index.css';

const app = (
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>{convex ? <ConvexProvider client={convex}>{app}</ConvexProvider> : app}</StrictMode>,
);
