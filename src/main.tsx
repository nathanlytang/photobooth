import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AdminApp from './admin/AdminApp';
import './styles/globals.css';

const isAdmin = window.location.pathname.startsWith('/admin');
const Root = isAdmin ? AdminApp : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
