// Run v2 accent migration BEFORE any module that touches the settings store.
// Must be the very first import so Zustand's persist middleware reads the
// migrated values on first hydration.
import { runAccentMigration } from './utils/accentMigration';
runAccentMigration();

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { MyK9QSunsetApp } from './sunset/MyK9QSunsetApp';
import { isMyK9QSunsetEnabled } from './sunset/sunsetConfig';

const root = ReactDOM.createRoot(document.getElementById('root')!);

if (isMyK9QSunsetEnabled()) {
  root.render(
    <React.StrictMode>
      <MyK9QSunsetApp />
    </React.StrictMode>
  );
} else {
  import('./startMyK9QApp')
    .then(({ startMyK9QApp }) => {
      startMyK9QApp(root);
    })
    .catch((error: unknown) => {
      console.error('Failed to start myK9Q', error);
    });
}
