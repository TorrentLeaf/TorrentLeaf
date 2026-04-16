import { MangaReader } from '@/components/reader/MangaReader'

export default async function ReadPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  return <MangaReader sessionId={sessionId} />
}
