import { del } from "@vercel/blob";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

// Deleting a tournament or a game takes its Photo, Document and TeamPhoto
// rows with it (cascades), but not the files those rows point at in Blob
// storage - which would stay publicly reachable forever. Collect the
// files before the delete, then remove them once it has committed.
export async function storedFilesFor(db: Db, scope: { tournamentIds?: string[]; eventIds?: string[] }): Promise<string[]> {
  const tournamentIds = scope.tournamentIds ?? [];
  const eventIds = scope.eventIds ?? [];
  if (tournamentIds.length === 0 && eventIds.length === 0) return [];
  const event = { OR: [{ tournamentId: { in: tournamentIds } }, { id: { in: eventIds } }] };
  const [photos, documents, teamPhotos, tournaments] = await Promise.all([
    db.photo.findMany({ where: { event }, select: { blobPathname: true } }),
    db.document.findMany({ where: { event }, select: { blobPathname: true } }),
    db.teamPhoto.findMany({ where: { tournamentId: { in: tournamentIds } }, select: { blobPathname: true } }),
    db.tournament.findMany({ where: { id: { in: tournamentIds } }, select: { liveResultsPhotoBlobPathname: true } }),
  ]);
  return [
    ...photos.map((p) => p.blobPathname),
    ...documents.map((d) => d.blobPathname),
    ...teamPhotos.map((t) => t.blobPathname),
    ...tournaments.map((t) => t.liveResultsPhotoBlobPathname),
  ].filter((path): path is string => !!path);
}

// Best effort: the rows are already gone, so a storage hiccup is logged
// rather than reported as a failed delete.
export async function deleteStoredFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await del(paths);
  } catch (error) {
    console.error(`Couldn't remove ${paths.length} stored file(s) after a delete`, error);
  }
}
