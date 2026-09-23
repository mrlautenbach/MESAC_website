import Link from "next/link";

// Shared by the schedule and meet-results CSV imports.
export function AddNewSchoolsCheckbox() {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name="addNewSchools" className="mt-0.5" />
      <span>
        Add schools that aren&apos;t in the database yet. Any school name the file uses that doesn&apos;t match an
        existing school&apos;s name or code is added as a guest school, instead of stopping the import. Check the
        spelling first: a typo like &quot;ASDD&quot; would become a new school too.
      </span>
    </label>
  );
}

export function NewSchoolsNote({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <span className="mt-2 block">
      Added {names.length} new guest school{names.length === 1 ? "" : "s"}: {names.join(", ")}. Add a code, logo or
      colors from{" "}
      <Link href="/dashboard/admin/schools" className="underline">
        Schools
      </Link>
      .
    </span>
  );
}
