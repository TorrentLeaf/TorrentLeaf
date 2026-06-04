import { MangaReader } from '@/components/reader/MangaReader'

export default async function ReadPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>
  searchParams: Promise<{ fileId?: string; startFile?: string }>
}) {
  const { sessionId } = await params
  const { fileId, startFile } = await searchParams
  return <MangaReader sessionId={sessionId} fileId={fileId} startFile={startFile} />
}
