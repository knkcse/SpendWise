import { Capacitor } from '@capacitor/core'

export const platform = Capacitor.getPlatform() as 'android' | 'ios' | 'web'
/** Native notification capture only exists in the Android app (Phase 7). */
export const detectionSupported = platform === 'android' && Capacitor.isPluginAvailable('PaymentDetection')
