import { createRoot } from 'react-dom/client';
import { MobileApp, MobileErrorBoundary } from './MobileApp.tsx';
import './styles.css';

// Bootstrap from packaged HTML/JS only; no Next server or remote font is involved.
createRoot(document.getElementById('root')!).render(<MobileErrorBoundary><MobileApp /></MobileErrorBoundary>);
