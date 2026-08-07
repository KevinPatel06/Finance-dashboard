import type { CapacitorConfig } from '@capacitor/cli';

// appId matches the electron-builder appId so both platforms carry one identity.
const config: CapacitorConfig = {
  appId: 'com.kevinpatel.financedashboard',
  appName: 'Finance Dashboard',
  webDir: 'dist-ios',
  ios: { contentInset: 'always' },
};

export default config;
