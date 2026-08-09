import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";
import { RefreshCcw, X } from "lucide-react";

interface PlayerErrorBoundaryProps {
  children: ReactNode;
  resetKey: string;
  onClose: () => void;
}

interface PlayerErrorBoundaryState {
  error: Error | null;
  retryKey: number;
}

/**
 * Keep a media-element or lazy-chunk failure inside the player. Without this
 * boundary, one bad stream can trip the root boundary and replace the whole app.
 */
export class PlayerErrorBoundary extends Component<
  PlayerErrorBoundaryProps,
  PlayerErrorBoundaryState
> {
  public state: PlayerErrorBoundaryState = {
    error: null,
    retryKey: 0,
  };

  public static getDerivedStateFromError(error: Error): Partial<PlayerErrorBoundaryState> {
    return { error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Video player crashed:", error, errorInfo);
  }

  public componentDidUpdate(previousProps: PlayerErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, retryKey: this.state.retryKey + 1 });
    }
  }

  private retry = () => {
    this.setState((state) => ({
      error: null,
      retryKey: state.retryKey + 1,
    }));
  };

  private isStalePlayerBundle(): boolean {
    const message = this.state.error?.message || "";
    return /chunk|dynamically imported|failed to fetch module|importing a module/i.test(message);
  }

  public render() {
    if (this.state.error) {
      const needsReload = this.isStalePlayerBundle();
      return (
        <div
          className="fixed inset-0 z-[250] grid place-items-center bg-slate-950/95 p-6 text-white backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="player-recovery-title"
        >
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-7 text-center shadow-2xl">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-orange-500/25 bg-orange-500/10 text-orange-400">
              <RefreshCcw className="h-7 w-7" />
            </div>
            <h2 id="player-recovery-title" className="text-xl font-extrabold">
              The player needs a fresh start
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/60">
              {needsReload
                ? "A newer player bundle is available. Reload once to use it; your library and watched history are safe."
                : "The rest of NEXTUP is still safe. Restart this player or close it and choose the video again."}
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={needsReload ? () => window.location.reload() : this.retry}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-extrabold text-slate-950 transition-colors hover:bg-orange-400"
              >
                <RefreshCcw className="h-4 w-4" />
                {needsReload ? "Load updated player" : "Restart player"}
              </button>
              <button
                type="button"
                onClick={this.props.onClose}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-white/20"
              >
                <X className="h-4 w-4" />
                Close player
              </button>
            </div>
          </div>
        </div>
      );
    }

    return <Fragment key={this.state.retryKey}>{this.props.children}</Fragment>;
  }
}
