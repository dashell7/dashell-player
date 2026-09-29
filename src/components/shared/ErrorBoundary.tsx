import React, { Component } from 'react';
import { t } from '../../i18n';
import { logger } from '../../utils';

interface Props {
  children: React.ReactNode;
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    logger.error('[ErrorBoundary]', error.message);
    logger.error('[ErrorBoundary] Stack:', error.stack);
    if (info.componentStack) {
      logger.error('[ErrorBoundary] Component stack:', info.componentStack);
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return (
        <div className="lp-error-container">
          <p className="lp-error-title">
            {t('error.crashed')}
          </p>
          <p className="lp-error-message">
            {this.state.error.message}
          </p>
          <button className="lp-btn lp-btn-primary" onClick={this.reset}>
            {t('error.retry')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
