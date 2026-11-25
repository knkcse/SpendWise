import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.spendwise.android',
  appName: 'SpendWise',
  webDir: 'dist',
  android: { allowMixedContent: false },
}
export default config
