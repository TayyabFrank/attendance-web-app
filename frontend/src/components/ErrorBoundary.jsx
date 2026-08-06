import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("React ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', backgroundColor: '#fee2e2', color: '#991b1b', margin: '20px', borderRadius: '8px', fontFamily: 'sans-serif' }}>
          <h2 style={{ marginTop: 0 }}>Something went wrong.</h2>
          <p>Please refresh the page or try logging out.</p>
          <details style={{ whiteSpace: 'pre-wrap', marginTop: '10px', fontSize: '12px' }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
          <button 
            onClick={() => { localStorage.clear(); window.location.href = '/login'; }}
            style={{ marginTop: '15px', padding: '8px 16px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Logout & Reset
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
