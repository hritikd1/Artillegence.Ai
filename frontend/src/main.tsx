import { StrictMode, Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import LandingPage from './LandingPage.tsx'
import Login from './Login.tsx'

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidMount() {
    window.addEventListener('error', this.handleGlobalError);
    window.addEventListener('unhandledrejection', this.handlePromiseRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.handleGlobalError);
    window.removeEventListener('unhandledrejection', this.handlePromiseRejection);
  }

  handleGlobalError = (event: ErrorEvent) => {
    const message = event.message || '';
    if (
      message.includes('[tv]') || 
      message.includes('tradingview') || 
      message.includes('TradingView') || 
      message.includes('Permission denied') ||
      message === 'Script error.' ||
      message.toLowerCase().includes('script error')
    ) {
      console.warn("Ignored global error from TradingView / cross-origin script:", event);
      return;
    }
    this.setState({ hasError: true, error: event.error || new Error(event.message) });
  };

  handlePromiseRejection = (event: PromiseRejectionEvent) => {
    const reasonStr = String(event.reason || '');
    if (
      reasonStr.includes('[tv]') || 
      reasonStr.includes('tradingview') || 
      reasonStr.includes('TradingView') || 
      reasonStr.includes('Permission denied') ||
      reasonStr === 'Script error.' ||
      reasonStr.toLowerCase().includes('script error')
    ) {
      console.warn("Ignored promise rejection from TradingView / browser settings:", event.reason);
      return;
    }
    this.setState({ hasError: true, error: event.reason instanceof Error ? event.reason : new Error(String(event.reason)) });
  };

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("Global Error Boundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          backgroundColor: '#060B12',
          color: '#fff',
          padding: '40px',
          fontFamily: 'monospace',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center'
        }}>
          <h1 style={{ color: '#ef4444', fontSize: '24px', marginBottom: '10px' }}>⚠️ CRITICAL TERMINAL CRASH</h1>
          <p style={{ color: '#94a3b8', maxWidth: '600px', margin: '0 auto 20px auto', fontSize: '14px', lineHeight: '1.5' }}>
            The dashboard frontend crashed due to an unhandled JavaScript exception. See diagnosis details below:
          </p>
          <pre style={{
            backgroundColor: '#0f172a',
            padding: '20px',
            borderRadius: '8px',
            border: '1px solid #1e293b',
            overflow: 'auto',
            maxWidth: '90%',
            maxHeight: '400px',
            color: '#f87171',
            textAlign: 'left',
            fontSize: '12px',
            lineHeight: '1.4',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all'
          }}>
            {this.state.error?.toString()}
            {"\n\nStack Trace:\n"}
            {this.state.error?.stack}
          </pre>
          <div style={{ marginTop: '20px', display: 'flex', gap: '15px' }}>
            <button
              onClick={() => {
                localStorage.removeItem('token');
                window.location.href = '/login';
              }}
              style={{
                padding: '10px 20px',
                backgroundColor: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              CLEAR TOKEN & LOGOUT
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 20px',
                backgroundColor: '#38bdf8',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              RELOAD TERMINAL
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<App />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </GlobalErrorBoundary>
  </StrictMode>,
)

