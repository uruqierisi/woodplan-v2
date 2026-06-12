import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Browse from './pages/Browse/index.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Browse />
  </StrictMode>,
);
