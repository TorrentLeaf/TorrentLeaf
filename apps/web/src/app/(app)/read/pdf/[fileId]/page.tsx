import { PdfReader } from '@/components/reader/PdfReader'

export default async function PdfReadPage({
  params,
}: {
  params: Promise<{ fileId: string }>
}) {
  const { fileId } = await params
  return <PdfReader fileId={fileId} />
}
