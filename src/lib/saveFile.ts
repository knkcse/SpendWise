import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export interface SavedFile { name: string; location: string | null; uri: string | null }

const blobToBase64 = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = () => rej(r.error); r.readAsDataURL(b)
})

/**
 * Save an export. In a browser this is a normal download. In the Android app,
 * browser downloads don't exist, so the file is written to the phone's
 * Documents/SpendWise folder (visible in the Files app). If that folder can't
 * be written, the file is kept in app storage and can still be shared.
 */
export async function saveFile(name: string, content: string | Blob, mime: string): Promise<SavedFile> {
  const blob = typeof content === 'string' ? new Blob([content], { type: `${mime};charset=utf-8` }) : content
  if (!Capacitor.isNativePlatform()) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    return { name, location: 'Downloads', uri: null }
  }
  const data = await blobToBase64(blob)
  try {
    const r = await Filesystem.writeFile({ path: `SpendWise/${name}`, data, directory: Directory.Documents, recursive: true })
    return { name, location: 'Documents/SpendWise', uri: r.uri }
  } catch {
    const r = await Filesystem.writeFile({ path: `exports/${name}`, data, directory: Directory.Cache, recursive: true })
    return { name, location: null, uri: r.uri }
  }
}

/** Open the Android share sheet (WhatsApp, Gmail, Drive, …) for a saved file. */
export async function shareFile(f: SavedFile) {
  if (!f.uri) return
  await Share.share({ title: f.name, files: [f.uri], dialogTitle: 'Share export' }).catch(() => {}) // user closed the sheet
}

export const canShareFiles = () => Capacitor.isNativePlatform()
