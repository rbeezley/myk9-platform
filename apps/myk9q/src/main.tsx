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
      root.render(
        <React.StrictMode>
          <main className="myk9q-sunset" aria-labelledby="myk9q-load-error-title">
            <section className="myk9q-sunset__panel">
              <p className="myk9q-sunset__brand">myK9Q</p>
              <h1 id="myk9q-load-error-title">We couldn't load myK9Q.</h1>
              <p className="myk9q-sunset__lead">Refresh the page and try again.</p>
            </section>
          </main>
        </React.StrictMode>
      );
    });
}
