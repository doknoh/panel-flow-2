import SeriesPageClient from './SeriesPageClient'

export default async function SeriesPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params
  return <SeriesPageClient seriesId={seriesId} />
}
