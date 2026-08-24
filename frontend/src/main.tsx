import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import { Providers } from './app/providers';
import { router } from './app/router';
import { loadRuntimeConfig } from './lib/config';
import './styles/globals.css';

/**
 * La configuration runtime doit être lue avant le montage : le client HTTP et
 * la couche d'authentification en dépendent dès leur première utilisation.
 */
async function bootstrap(): Promise<void> {
  await loadRuntimeConfig();

  const container = document.getElementById('root');
  if (!container) throw new Error('Élément #root introuvable');

  createRoot(container).render(
    <StrictMode>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </StrictMode>,
  );
}

void bootstrap();
