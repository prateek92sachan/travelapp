import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import App from './App.jsx';
import { TripProvider } from './hooks/useTrip.jsx';
import { ThemeProvider } from './hooks/useTheme.jsx';
import { AuthProvider } from './hooks/useAuth.jsx';
import { queryClient } from './lib/queryClient';
import './styles/global.css';

const Devtools = import.meta.env.DEV
  ? React.lazy(() =>
      import('@tanstack/react-query-devtools').then((m) => ({
        default: m.ReactQueryDevtools
      }))
    )
  : null;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TripProvider>
            <App />
            <Toaster position="top-center" richColors closeButton />
          </TripProvider>
        </AuthProvider>
      </ThemeProvider>
      {Devtools && (
        <React.Suspense fallback={null}>
          <Devtools initialIsOpen={false} buttonPosition="bottom-left" />
        </React.Suspense>
      )}
    </QueryClientProvider>
  </React.StrictMode>
);
