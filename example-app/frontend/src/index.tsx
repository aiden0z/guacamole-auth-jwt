import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import Console from './Console';
import Join from './Join';

const router = createBrowserRouter([
  { path: "/join", element: <Join/> },
  {
    path: "/",
    element: <App/>
  },
  {
    path: "/console",
    element: <Console/>
  }
], {basename: "/example-app"})

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
