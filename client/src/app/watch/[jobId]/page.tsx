import { WatchView } from "@/components/WatchView";

// Server page: unwraps async params/searchParams (Next 16) and hands plain
// strings to the client view — no useSearchParams/Suspense needed. Using the
// searchParams prop also opts this route into dynamic rendering, which is
// correct: every watch URL is per-render and must never be prerendered.

interface WatchPageProps {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function WatchPage({ params, searchParams }: WatchPageProps) {
  const { jobId } = await params;
  const query = await searchParams;
  const rawVideo = query.video;
  const videoId =
    typeof rawVideo === "string"
      ? rawVideo
      : Array.isArray(rawVideo)
        ? rawVideo[0]
        : null;

  return <WatchView jobId={jobId} videoId={videoId ?? null} />;
}
