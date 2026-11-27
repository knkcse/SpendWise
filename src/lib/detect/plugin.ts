import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import type { RawNotification } from './parse'

export interface DetectionStatus { accessGranted: boolean; enabled: boolean; pending: number; lastHeardAt: number; listenerInBuild?: boolean }
interface PaymentDetectionPlugin {
  status(): Promise<DetectionStatus>
  openAccessSettings(): Promise<void>
  openAppSettings(): Promise<void>
  configure(o: { enabled: boolean; sms: boolean; packages: string[] }): Promise<void>
  drain(): Promise<{ items: RawNotification[] }>
  takeShared(): Promise<{ text?: string | null }>
  addListener(event: 'detected' | 'shared', fn: () => void): Promise<PluginListenerHandle>
}

export const PaymentDetection = registerPlugin<PaymentDetectionPlugin>('PaymentDetection')
export const detectionAvailable = () => Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('PaymentDetection')
