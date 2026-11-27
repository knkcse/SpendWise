import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.spendwise.android',
  appName: 'SpendWise',
  webDir: 'dist',
  android: { allowMixedContent: false },
  plugins: { LocalNotifications: { smallIcon: 'ic_stat_spendwise', iconColor: '#2F7A6B' } },
}
export default config
