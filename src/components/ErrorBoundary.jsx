import React from 'react';
import { AlertCircle } from 'lucide-react';
export default class ErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="recovery-screen">
        <AlertCircle size={36} />
        <h1>Let’s take a breath.</h1>
        <p>
          Still ran into an unexpected problem. Reload to reopen your saved workspace. Unsaved
          editor changes may be lost.
        </p>
        <button className="primary-button" onClick={() => location.reload()}>
          Reload workspace
        </button>
      </div>
    );
  }
}
