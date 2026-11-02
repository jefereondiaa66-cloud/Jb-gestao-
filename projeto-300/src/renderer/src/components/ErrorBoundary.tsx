/** Captura falhas inesperadas da interface e oferece recarregar, sem tela em branco. */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Falha na interface do 300:', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="app no-bridge">
        <div className="app-bg" aria-hidden="true" />
        <div className="no-bridge-box" role="alert">
          <h1>A interface do 300 encontrou um problema</h1>
          <p>O motor continua funcionando. Recarregue a tela para continuar. Se repetir, reinicie o 300.</p>
          <pre className="mono small error-detail">{error.message}</pre>
          <div className="row-actions">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Recarregar a interface
            </button>
          </div>
        </div>
      </div>
    );
  }
}
