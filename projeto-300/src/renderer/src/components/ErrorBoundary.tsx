/** Captura falhas inesperadas da interface e oferece recarregar, sem tela em branco. */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { hasApi, stopEverything } from '../api';
import { errorText } from '../lib/format';
import { IconStop } from './icons';

interface State {
  error: Error | null;
  stopMsg: string | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null, stopMsg: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Falha na interface do 300:', error, info.componentStack);
  }

  /** Mesmo com a tela quebrada, o PARAR precisa funcionar (o motor pode estar agindo). */
  private stop = (): void => {
    this.setState({ stopMsg: 'Parando…' });
    void stopEverything().then(
      (failed) => this.setState({ stopMsg: failed ? `Falha ao parar: ${errorText(failed)}` : 'Tudo parado.' }),
      (e) => this.setState({ stopMsg: `Falha ao parar: ${errorText(e)}` }),
    );
  };

  override render(): ReactNode {
    const { error, stopMsg } = this.state;
    if (!error) return this.props.children;
    const canStop = hasApi();
    return (
      <div className="app no-bridge">
        <div className="app-bg" aria-hidden="true" />
        <div className="no-bridge-box" role="alert">
          <h1>A interface do 300 encontrou um problema</h1>
          <p>O motor continua funcionando. Se ele estiver fazendo algo que você não quer, use PARAR. Depois, recarregue a tela. Se repetir, reinicie o 300.</p>
          <pre className="mono small error-detail">{error.message}</pre>
          <div className="row-actions">
            {canStop && (
              <button type="button" className="kill kill-sm" onClick={this.stop} aria-label="Parar tudo: resposta, ferramentas, fala e escuta">
                <IconStop size={14} />
                <span>PARAR</span>
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Recarregar a interface
            </button>
          </div>
          {stopMsg && (
            <p className="small" role="status">
              {stopMsg}
            </p>
          )}
        </div>
      </div>
    );
  }
}
