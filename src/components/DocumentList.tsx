import { deleteDocumentAction } from "@/lib/actions/documents";

type DocumentItem = { id: string; url: string; title: string };

export function DocumentList({ documents, canDelete }: { documents: DocumentItem[]; canDelete: boolean }) {
  if (documents.length === 0) return null;

  return (
    <ul className="space-y-2">
      {documents.map((doc) => (
        <li key={doc.id} className="card flex items-center justify-between gap-3 p-3">
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            📄 {doc.title}
          </a>
          {canDelete && (
            <form
              action={async () => {
                "use server";
                await deleteDocumentAction(doc.id);
              }}
            >
              <button type="submit" className="btn btn-danger px-2 py-1 text-xs">
                Delete
              </button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
