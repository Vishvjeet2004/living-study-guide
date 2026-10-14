import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

createRoot(document.getElementById('root')!, {
  // Avoid logging error details that could include private study data.
  onCaughtError: () => {},
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
