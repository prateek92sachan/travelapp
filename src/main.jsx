import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { TripProvider } from './hooks/useTrip.jsx';
import { ThemeProvider } from './hooks/useTheme.jsx';
import { AuthProvider } from './hooks/useAuth.jsx';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <TripProvider>
          <App />
        </TripProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
