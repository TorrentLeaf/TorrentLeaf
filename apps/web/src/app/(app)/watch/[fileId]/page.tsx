'use client'

import { useParams, useSearchParams } from 'next/navigation'

import { pageStreamURL } from '@/lib/reader'
import { VideoPlayer } from '@/components/player/VideoPlayer'

export default function WatchPage() {
  const params = useParams<{ fileId: string }>()
  const searchParams = useSearchParams()
  const fileId = params.fileId
  const src = pageStreamURL(fileId)

  // The title is passed as a query param from the torrent detail page
  const title = searchParams.get('title') || 'Video'

  return <VideoPlayer src={src} title={decodeURIComponent(title)} />
}
