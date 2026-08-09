import type { UserShow } from "../types";

export type LibraryShowIdentity = Pick<UserShow, "id" | "tvmazeId">;
export type LibraryDocument = Partial<UserShow> & { id: string };

export interface LibrarySnapshotHealth {
  shows: UserShow[];
  duplicateDocumentIds: string[];
  orphanDocumentIds: string[];
}

export function normalizeLibraryDocumentId(showId: string | number): string {
  const documentId = String(showId).trim();
  if (!documentId || documentId.includes("/")) {
    throw new Error("Invalid library show ID");
  }
  return documentId;
}

/**
 * Return every document ID that older clients may have used for a show.
 * The original persisted ID is canonical; the resolved TVMaze ID is only a
 * legacy alias created by old watched-progress and removal code.
 */
export function getLibraryDocumentIds(show: LibraryShowIdentity): string[] {
  const ids = [normalizeLibraryDocumentId(show.id)];
  if (Number.isFinite(show.tvmazeId)) {
    ids.push(normalizeLibraryDocumentId(show.tvmazeId));
  }
  return [...new Set(ids)];
}

function normalizeUsableDocument(document: LibraryDocument): UserShow | null {
  const numericDocumentId = Number(document.id);
  const tvmazeId = typeof document.tvmazeId === "number" && Number.isFinite(document.tvmazeId)
    ? document.tvmazeId
    : Number.isFinite(numericDocumentId)
      ? numericDocumentId
      : null;

  if (
    !document.id.trim() ||
    typeof document.name !== "string" ||
    !document.name.trim() ||
    tvmazeId === null
  ) {
    return null;
  }

  return { ...document, tvmazeId } as UserShow;
}

function mergeWatchedEpisodes(
  records: Array<Record<string, number | null> | undefined>,
): Record<string, number | null> {
  const merged: Record<string, number | null> = {};

  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    for (const [episodeId, watchedAt] of Object.entries(record)) {
      const current = merged[episodeId];
      if (typeof watchedAt === "number" && Number.isFinite(watchedAt)) {
        merged[episodeId] = typeof current === "number"
          ? Math.max(current, watchedAt)
          : watchedAt;
      } else if (current === undefined) {
        merged[episodeId] = null;
      }
    }
  }

  return merged;
}

function completenessScore(show: UserShow): number {
  const canonicalSourceBonus = show.id !== String(show.tvmazeId) ? 100 : 0;
  const populatedFields = Object.values(show).filter((value) => {
    if (value === undefined || value === null || value === "") return false;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }).length;
  return canonicalSourceBonus + populatedFields;
}

/**
 * Coalesce duplicate documents in memory without deleting anything in
 * Firestore. Old clients wrote watched state to `{tvmazeId}` even when the
 * real show lived at a different source document ID, producing sparse orphan
 * documents. This keeps those records from crashing the UI and preserves their
 * newest watched timestamps until the user explicitly runs a database repair.
 */
export function coalesceLibraryDocuments(
  documents: LibraryDocument[],
): LibrarySnapshotHealth {
  const validDocuments = documents
    .map(normalizeUsableDocument)
    .filter((document): document is UserShow => document !== null);
  const groups = new Map<number, UserShow[]>();

  for (const show of validDocuments) {
    const group = groups.get(show.tvmazeId) || [];
    group.push(show);
    groups.set(show.tvmazeId, group);
  }

  const shows: UserShow[] = [];
  const duplicateDocumentIds = new Set<string>();
  const consumedDocumentIds = new Set<string>();

  for (const group of groups.values()) {
    const ranked = [...group].sort((a, b) => completenessScore(b) - completenessScore(a));
    const canonical = ranked[0];
    const aliases = documents.filter((document) => {
      if (document.id === canonical.id) return false;
      const normalizedAlias = normalizeUsableDocument(document);
      return (
        document.tvmazeId === canonical.tvmazeId ||
        (!normalizedAlias && document.id === String(canonical.tvmazeId))
      );
    });

    const merged = { ...canonical } as UserShow;
    for (const alias of aliases) {
      duplicateDocumentIds.add(alias.id);
      consumedDocumentIds.add(alias.id);
      for (const [field, value] of Object.entries(alias)) {
        const existing = (merged as unknown as Record<string, unknown>)[field];
        if ((existing === undefined || existing === null || existing === "") && value !== undefined) {
          (merged as unknown as Record<string, unknown>)[field] = value;
        }
      }
    }

    merged.id = canonical.id;
    merged.watchedEpisodes = mergeWatchedEpisodes([
      canonical.watchedEpisodes,
      ...aliases.map((alias) => alias.watchedEpisodes),
    ]);
    shows.push(merged);
    consumedDocumentIds.add(canonical.id);
  }

  const orphanDocumentIds = documents
    .filter((document) => !consumedDocumentIds.has(document.id))
    .map((document) => document.id);

  return {
    shows,
    duplicateDocumentIds: [...duplicateDocumentIds],
    orphanDocumentIds,
  };
}
