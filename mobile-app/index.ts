import { registerRootComponent } from 'expo';

import App from './App';

// Keep the app entry explicit so Metro can resolve the project root when the
// project is installed with pnpm or another symlinked package manager.
registerRootComponent(App);
