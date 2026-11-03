import type { CapacitorConfig } from '@capacitor/cli';

// appId matches the electron-builder appId so both platforms carry one identity.
const config: CapacitorConfig = {
  appId: 'com.kevinpatel.financedashboard',
  appName: 'Finance Dashboard',
  webDir: 'dist-mobile',
  // 'never' is deliberate: we apply env(safe-area-inset-*) ourselves in
  // src/index.css. With 'always', WKWebView ALSO adds automatic insets to its
  // scroll view, so they double-count — content starts offset and rubber-banding
  // reads as broken.
  ios: { contentInset: 'never' },
  // The phone theme's Beige page, shown before the web view paints.
  android: { backgroundColor: '#EEE5D5' },
  plugins: {
    // Android draws the status-bar icon as a white silhouette, so it needs its
    // own (android/app/src/main/res/drawable/ic_stat_notify.xml). iOS ignores this.
    LocalNotifications: { smallIcon: 'ic_stat_notify', iconColor: '#3F7A55' },
  },
};

export default config;
