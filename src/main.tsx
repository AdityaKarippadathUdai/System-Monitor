import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { FloatingWidgetWindow } from './components/desktop-widget/FloatingWidgetWindow.tsx';
import { DesktopOverlayWindow } from './components/desktop-overlay/DesktopOverlayWindow.tsx';
import { GamingOverlayWindow } from './components/gaming-mode/GamingOverlayWindow.tsx';
import './index.css';

const params = new URLSearchParams(window.location.search);
const windowType = params.get('window');

if (windowType === 'widget' || windowType === 'overlay' || windowType === 'gaming') {
  document.documentElement.classList.add('transparent-window');
  document.body.classList.add('transparent-window');
}

function renderRoot() {
  switch (windowType) {
    case 'widget':
      return <FloatingWidgetWindow />;
    case 'overlay':
      return <DesktopOverlayWindow />;
    case 'gaming':
      return <GamingOverlayWindow />;
    default:
      return <App />;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{renderRoot()}</StrictMode>
);
