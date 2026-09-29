import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Phase0Check } from './Phase0Check';
import './phase0.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Phase0Check />
  </StrictMode>,
);
