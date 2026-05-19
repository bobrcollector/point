import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Props = { children: ReactNode; title?: string }
type State = { error: Error | null }

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('RouteErrorBoundary', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="page eventDetailPage">
        <div className="eventDetailPanel">
          <h1 className="eventDetailTitle" style={{ color: 'var(--text)' }}>
            {this.props.title ?? 'Не удалось открыть страницу'}
          </h1>
          <p className="eventDetailMuted" style={{ marginTop: 8 }}>
            {this.state.error.message || 'Произошла ошибка при отображении.'}
          </p>
          <Link className="homePrimaryBtn" to="/" style={{ display: 'inline-flex', marginTop: 12 }}>
            На главную
          </Link>
        </div>
      </div>
    )
  }
}
