import { EpubReader } from '@/components/reader/EpubReader'

export default async function EpubReadPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>
  searchParams: Promise<{ fileId?: string }>
}) {
  const { sessionId } = await params
  const { fileId } = await searchParams
  if (!fileId) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Missing fileId — pick an EPUB from the torrent page.
      </div>
    )
  }
  return <EpubReader sessionId={sessionId} fileId={fileId} />
}
