"use client";

import { useRef, useState, useTransition } from "react";
import { uploadDocumentAction } from "@/lib/actions/documents";
import type { ActionResult } from "@/lib/actions/auth";

export function DocumentUploader({ eventId }: { eventId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const outcome = await uploadDocumentAction(null, formData);
      setResult(outcome);
      if (outcome.ok) formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="eventId" value={eventId} />
      <div className="flex-1">
        <label className="field-label">Title</label>
        <input name="title" placeholder="Full results" maxLength={120} className="field-input" />
      </div>
      <div>
        <label className="field-label">PDF file</label>
        <input name="document" type="file" accept="application/pdf" required className="field-input" />
      </div>
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Uploading…" : "Upload document"}
      </button>
      {result && !result.ok && <p className="w-full text-sm text-danger">{result.error}</p>}
      {result?.ok && <p className="w-full text-sm text-success">Uploaded!</p>}
    </form>
  );
}
