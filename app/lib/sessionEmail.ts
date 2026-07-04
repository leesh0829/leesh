type SessionLike = {
  user?: {
    email?: string | null;
  } | null;
} | null | undefined;

export function getSessionEmail(session: SessionLike): string | null {
  const email = session?.user?.email?.trim();
  return email ? email : null;
}
