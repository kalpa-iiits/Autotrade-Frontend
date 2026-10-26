import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Icon } from './icons'

/**
 * Catches an error thrown while rendering (or in an effect) below it, so one broken page shows
 * what went wrong instead of React unmounting the whole app to a blank screen. Give it a `key`
 * that changes on navigation to try again on the next page.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="alert bad" role="alert" style={{ margin: 24 }}>
        <Icon name="warn" size={15} />
        <div className="grow">
          <div style={{ fontWeight: 600 }}>This page hit an error and stopped.</div>
          <div className="small mono" style={{ marginTop: 4 }}>{error.message}</div>
        </div>
        <button className="sm" onClick={() => location.reload()}>Reload</button>
      </div>
    )
  }
}
