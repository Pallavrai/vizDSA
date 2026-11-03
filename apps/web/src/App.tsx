import { lazy, Suspense } from 'react';

// Loaded on demand so Three.js never ships with the workspace.
const Landing = lazy(() => import('./landing/Landing.tsx'));
const Workspace = lazy(() => import('./workspace/Workspace.tsx'));

export function App() {
  const isWorkspace = window.location.pathname.startsWith('/app');
  return <Suspense fallback={null}>{isWorkspace ? <Workspace /> : <Landing />}</Suspense>;
}
