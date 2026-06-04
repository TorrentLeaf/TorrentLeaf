'use client'

import { useParams, useSearchParams } from 'next/navigation'

import { VideoPlayer } from '@/components/player/VideoPlayer'

export default function WatchPage() {
  const params = useParams<{ fileId: string }>()
  const searchParams = useSearchParams()
  const fileId = params.fileId

  // The title is passed as a query param from the torrent detail page.
  // The player builds its own stream URLs so it can refresh them when the
  // user switches audio tracks; we just hand it the fileId.
  const title = searchParams.get('title') || 'Video'

  return <VideoPlayer fileId={fileId} title={decodeURIComponent(title)} />
}
