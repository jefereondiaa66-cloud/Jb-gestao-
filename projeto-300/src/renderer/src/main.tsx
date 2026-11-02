// Preâmbulo do React Refresh como módulo (no desenvolvimento): funciona com a CSP sem 'unsafe-inline'.
import '@vitejs/plugin-react/preamble';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { hasApi } from './api';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Brand } from './components/TopBar';
import './styles/base.css';
import './styles/layout.css';
import './styles/chat.css';
import './styles/panels.css';
import './styles/overlays.css';
import './styles/settings.css';

function NoBridge() {
  return (
    <div className="app no-bridge">
      <div className="app-bg" aria-hidden="true" />
      <div className="no-bridge-box" role="alert">
        <Brand />
        <h1>Sem conexão com o motor do 300</h1>
        <p>A interface foi aberta fora do aplicativo ou a ponte segura não carregou. Feche e abra o 300 novamente.</p>
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>{hasApi() ? <App /> : <NoBridge />}</ErrorBoundary>
    </StrictMode>,
  );
}
