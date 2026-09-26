type Division = { id: string; name: string; slug: string };

// Each division's section one after another (Varsity, then JV), with links
// to jump between them when there's more than one.
export function DivisionSections<D extends Division>({
  divisions,
  children,
}: {
  divisions: D[];
  children: (division: D) => React.ReactNode;
}) {
  return (
    <div className="space-y-12">
      {divisions.length > 1 && (
        <p className="text-sm text-muted">
          Jump to{" "}
          {divisions.map((d, i) => (
            <span key={d.id}>
              {i > 0 && " · "}
              <a href={`#${d.slug}`} className="font-semibold text-primary hover:underline">
                {d.name}
              </a>
            </span>
          ))}
        </p>
      )}
      {divisions.map((division) => (
        <section key={division.id} id={division.slug} className="scroll-mt-28 space-y-4">
          <h4>{division.name}</h4>
          {children(division)}
        </section>
      ))}
    </div>
  );
}
