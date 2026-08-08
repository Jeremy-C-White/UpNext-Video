import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onRetry: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class DiscoverErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Discover error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center max-w-lg mx-auto mt-12 animate-in fade-in">
          <h2 className="text-xl font-display font-bold text-white mb-2">Something went wrong loading Discover</h2>
          <p className="text-slate-400 mb-6 text-sm">A rendering issue or corrupted data caused Discover to crash.</p>
          <button 
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onRetry();
            }}
            className="bg-orange-500 hover:bg-orange-400 text-orange-950 font-bold py-2 px-6 rounded-full text-sm transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
