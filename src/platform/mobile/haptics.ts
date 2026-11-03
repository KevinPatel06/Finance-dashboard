import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import type { HapticKind } from '../index';

/** iOS Taptic Engine feedback. Failures are swallowed: a missed buzz never matters. */
export function haptic(kind: HapticKind): void {
  const run =
    kind === 'success'
      ? Haptics.notification({ type: NotificationType.Success })
      : kind === 'warning'
        ? Haptics.notification({ type: NotificationType.Warning })
        : Haptics.impact({ style: kind === 'select' ? ImpactStyle.Medium : ImpactStyle.Light });
  run.catch(() => {});
}
