import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  public state: State = { hasError: false, message: '' };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'Unexpected workspace rendering error.',
    };
  }

  public componentDidCatch(error: Error) {
    console.error('DevMind UI ErrorBoundary:', error);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-[#090B10] text-[#E6E9F2] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#10131C] border border-[#2B3347] rounded-[12px] p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-[#FF5468]">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h1 className="text-[16px] font-semibold">Workspace Recovery</h1>
            </div>
            <p className="text-[13px] text-[#A3AABF] leading-relaxed font-mono break-words">
              {this.state.message}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
              className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold bg-[#5B7CFF] hover:bg-[#7C96FF] text-[#090B10] rounded-[6px] transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reload DevMind Studio</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
