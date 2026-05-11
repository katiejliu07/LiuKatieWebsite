import { NodeMedia, NodeMediaType, ProjectNode } from '../types'

const VIDEO_FILE_RE = /\.(mp4|webm|ogg|ogv|mov|m4v)(\?|#|$)/i

export function createMediaId() {
  return `media-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function inferMediaType(url: string): NodeMediaType {
  const trimmed = url.trim()
  if (VIDEO_FILE_RE.test(trimmed) || /(?:youtube\.com|youtu\.be|vimeo\.com)/i.test(trimmed)) return 'video'
  return 'image'
}

export function normalizeMediaItems(items: Array<Partial<NodeMedia>>): NodeMedia[] {
  const media: NodeMedia[] = []

  for (const item of items) {
    const url = item.url?.trim()
    if (!url) continue

    media.push({
      id: item.id || createMediaId(),
      type: item.type || inferMediaType(url),
      url,
      caption: item.caption?.trim() || undefined,
    })
  }

  return media
}

export function mediaFromNode(node?: Pick<ProjectNode, 'media' | 'imageUrl'> | null): NodeMedia[] {
  if (!node) return []

  const media = normalizeMediaItems(node.media ?? [])
  if (media.length > 0) return media

  const legacyUrl = node.imageUrl?.trim()
  return legacyUrl ? normalizeMediaItems([{ url: legacyUrl, type: inferMediaType(legacyUrl) }]) : []
}

export function primaryMediaUrl(media: NodeMedia[]) {
  return normalizeMediaItems(media)[0]?.url
}

export function isVideoMedia(media: Pick<NodeMedia, 'type' | 'url'>) {
  return media.type === 'video' || inferMediaType(media.url) === 'video'
}

export function getEmbeddedVideoUrl(url: string) {
  const youtube = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{6,})/)
  if (youtube) return `https://www.youtube.com/embed/${youtube[1]}`

  const vimeo = url.match(/vimeo\.com\/(\d+)/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`

  return null
}
