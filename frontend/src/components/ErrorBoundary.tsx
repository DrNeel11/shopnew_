import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`Error in ${this.props.name || 'component'}:`, error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          style={{
            padding: '16px',
            background: '#FEE2E2',
            border: '1px solid #FECACA',
            borderRadius: '8px',
            color: '#DC2626',
          }}
        >
          <strong>Something went wrong{this.props.name ? ` in ${this.props.name}` : ''}.</strong>
          <p style={{ fontSize: '14px', marginTop: '4px' }}>
            {this.state.error?.message}
          </p>
          <button
            onClick={this.handleReset}
            style={{
              marginTop: '8px',
              padding: '4px 12px',
              background: '#DC2626',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
