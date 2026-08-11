import type { CapacitorConfig } from '@capacitor/cli';

// appId matches the electron-builder appId so both platforms carry one identity.
const config: CapacitorConfig = {
  appId: 'com.kevinpatel.financedashboard',
  appName: 'Finance Dashboard',
  webDir: 'dist-ios',
  // 'never' is deliberate: we apply env(safe-area-inset-*) ourselves in
  // src/index.css. With 'always', WKWebView ALSO adds automatic insets to its
  // scroll view, so they double-count — content starts offset and rubber-banding
  // reads as broken.
  ios: { contentInset: 'never' },
};

export default config;
