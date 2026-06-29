import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import App from './App';
import ReminderPopupPage from './pages/ReminderPopupPage';
import './i18n';
import './index.css';

const isReminderPopup = getCurrentWindow().label === 'reminder-popup';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      {isReminderPopup ? <ReminderPopupPage /> : <App />}
    </HashRouter>
  </React.StrictMode>,
);
