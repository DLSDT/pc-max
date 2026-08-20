import { Component, type ErrorInfo, type ReactNode } from 'react';
import { withTranslation, type WithTranslation } from 'react-i18next';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { reportCrash } from '@/lib/crashReport';

interface Props extends WithTranslation {
  children: ReactNode;
  /** Changing this resets the boundary — used to recover on navigation. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes so a bug in one page shows a recoverable error
 * card instead of a blank window (which is exactly what the Multi-Frame
 * Generation infinite-loop bug looked like to users), and reports it to our
 * own API so crashes in the wild are visible in the admin panel.
 */
class ErrorBoundaryInner extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void reportCrash(error, 'render');
    // Keep the component stack in the local console for development.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    // Navigating away from the broken screen clears the error.
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    const { t, children } = this.props;
    if (!error) return children;

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive [&_svg]:size-6">
          <AlertTriangle aria-hidden />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t('errorBoundary.title')}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{t('errorBoundary.body')}</p>
        </div>
        <p dir="ltr" className="max-w-lg break-words rounded-lg bg-secondary/60 px-3 py-2 font-mono text-xs text-muted-foreground">
          {error.message}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <RefreshCw aria-hidden className="size-4" />
          {t('errorBoundary.reload')}
        </button>
      </div>
    );
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryInner);
export default ErrorBoundary;
