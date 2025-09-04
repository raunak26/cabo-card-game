import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import CaboCardGame from './CaboCardGame'; // Make sure this matches your file name exactly

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <CaboCardGame />
  </React.StrictMode>
);