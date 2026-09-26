"use client";

import { useRef, useState, useTransition } from "react";
import { uploadPhotosAction } from "@/lib/actions/photos";
import type { ActionResult } from "@/lib/actions/auth";

type Preview = { file: File; url: string };

export function PhotoUploader({ eventId }: { eventId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function syncInputFiles(files: File[]) {
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    if (inputRef.current) inputRef.current.files = dt.files;
  }

  // Each photo keeps the same preview URL (and so the same card, with
  // whatever caption is typed in it) while others are added or removed.
  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const incoming = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    const added = incoming.slice(0, Math.max(0, 10 - previews.length)).map((file) => ({ file, url: URL.createObjectURL(file) }));
    const next = [...previews, ...added];
    syncInputFiles(next.map((p) => p.file));
    setPreviews(next);
  }

  function removeAt(index: number) {
    URL.revokeObjectURL(previews[index].url);
    const next = previews.filter((_, i) => i !== index);
    syncInputFiles(next.map((p) => p.file));
    setPreviews(next);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const outcome = await uploadPhotosAction(null, formData);
      setResult(outcome);
      if (outcome.ok) {
        previews.forEach((p) => URL.revokeObjectURL(p.url));
        setPreviews([]);
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="eventId" value={eventId} />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`border-2 border-dashed p-6 text-center ${
          dragActive ? "border-primary bg-primary/5" : "border-border"
        }`}
      >
        <p className="mb-3 text-sm text-muted">Drag and drop photos here, or</p>
        <label className="btn btn-secondary inline-block cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary">
          Choose photos
          <input
            ref={inputRef}
            type="file"
            name="photos"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => addFiles(e.target.files)}
          />
        </label>
        <p className="mt-2 text-xs text-muted">JPEG, PNG, WebP, or HEIC. Up to 10 photos, 15MB each.</p>
      </div>

      {previews.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {previews.map((p, i) => (
            <div key={p.url} className="card overflow-hidden">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="aspect-square w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  aria-label="Remove photo"
                  className="absolute right-1 top-1 bg-black/60 px-2 py-0.5 text-xs text-white"
                >
                  ✕
                </button>
              </div>
              <input
                type="text"
                name="captions"
                placeholder="Caption (optional), e.g. &quot;Varsity team after the win&quot;"
                aria-label={`Caption for photo ${i + 1}`}
                maxLength={300}
                className="field-input border-0 border-t border-border text-sm"
              />
              <input
                type="text"
                name="altTexts"
                placeholder="Photo description for accessibility (optional)"
                aria-label={`Description of photo ${i + 1}`}
                maxLength={300}
                className="field-input border-0 border-t border-border text-xs"
              />
            </div>
          ))}
        </div>
      )}

      {result && !result.ok && (
        <p role="alert" className="bg-danger-tint px-3 py-2 text-sm text-danger">
          {result.error}
        </p>
      )}
      {result?.ok && (
        <p role="status" className="bg-success-tint px-3 py-2 text-sm text-success">
          Photos uploaded!
        </p>
      )}

      <button type="submit" disabled={pending || previews.length === 0} className="btn btn-primary">
        {pending ? "Uploading…" : `Upload ${previews.length || ""} photo${previews.length === 1 ? "" : "s"}`.trim()}
      </button>
    </form>
  );
}
