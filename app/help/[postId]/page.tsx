import HelpDetailClient from "./HelpDetailClient";

export const runtime = "nodejs";

export default async function HelpDetailPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  return <HelpDetailClient postId={postId} />;
}
