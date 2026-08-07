/**
 * On Electron, window.api is installed by the preload script before any
 * renderer code runs, so there is nothing to do. On iOS there is no preload —
 * the API is built in-process and must be ready before React renders.
 */
export async function bootstrapPlatform(): Promise<void> {
  if (__PLATFORM__ !== 'ios') return;
  const { installIosApi } = await import('./ios/api');
  await installIosApi();
}
