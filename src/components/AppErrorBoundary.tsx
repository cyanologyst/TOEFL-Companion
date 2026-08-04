import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { WarningCircleIcon } from "@phosphor-icons/react/WarningCircle";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { DoodleIcon } from "./DoodleIcon";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("TOEFL Companion encountered an unexpected interface error.", error, info);
  }

  private readonly retry = (): void => {
    this.setState({ error: null });
  };

  private readonly reload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }
    return (
      <main className="app-error-boundary" aria-labelledby="app-error-title">
        <section className="panel app-error-boundary__card">
          <span className="app-error-boundary__icon" aria-hidden>
            <WarningCircleIcon size={30} weight="duotone" />
          </span>
          <DoodleIcon name="sync" size={42} className="app-error-boundary__doodle" decorative />
          <div className="app-error-boundary__copy">
            <p className="app-error-boundary__eyebrow">A temporary problem occurred</p>
            <h1 id="app-error-title">This study screen could not be displayed.</h1>
            <p>
              Your saved vocabulary, recordings, and writing stay on this device. Try the screen
              again, or reload the application if the problem continues.
            </p>
          </div>
          <div className="app-error-boundary__actions">
            <button type="button" className="button button--primary" onClick={this.retry}>
              Try again
            </button>
            <button type="button" className="button button--outline" onClick={this.reload}>
              <ArrowClockwiseIcon size={18} aria-hidden />
              Reload application
            </button>
          </div>
          <details className="app-error-boundary__details">
            <summary>Technical details</summary>
            <code>{error.message || "Unknown interface error"}</code>
          </details>
        </section>
      </main>
    );
  }
}
