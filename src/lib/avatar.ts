import { supabase } from './supabase'

/** Downscale to a 512px square JPEG so uploads are small (~50 KB) and fast on mobile data. */
async function toSquareJpeg(file: File, size = 512): Promise<Blob> {
  const img = await createImageBitmap(file)
  const side = Math.min(img.width, img.height)
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size
  canvas.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not process image'))), 'image/jpeg', 0.85))
}

/** Upload to avatars/<uid>/… and return the public URL. Old photos in the folder are removed. */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  if (!supabase) throw new Error('Sign in to add a profile photo.')
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
  const blob = await toSquareJpeg(file)
  const path = `${userId}/avatar-${Date.now()}.jpg`
  const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' })
  if (error) throw new Error(/bucket not found/i.test(error.message) ? 'Photo storage isn’t set up yet. Run profile-update.sql in Supabase.' : error.message)
  await removeOldAvatars(userId, path)
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}

export async function removeOldAvatars(userId: string, keep?: string) {
  if (!supabase) return
  const { data } = await supabase.storage.from('avatars').list(userId)
  const old = (data ?? []).map((f) => `${userId}/${f.name}`).filter((p) => p !== keep)
  if (old.length) await supabase.storage.from('avatars').remove(old)
}
