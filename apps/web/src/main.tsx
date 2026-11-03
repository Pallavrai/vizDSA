import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/instrument-sans';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
