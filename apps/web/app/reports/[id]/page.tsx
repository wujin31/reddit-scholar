import Link from "next/link";
import { notFound } from "next/navigation";
import { createMockReport } from "../../../lib/mock-report";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const report = createMockReport();
  const { id } = await params;

  if (id !== report.id) {
    notFound();
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <p className="brand">ScholarSync</p>
        <p className="tagline">Report {report.id}</p>
        <nav className="nav-list" aria-label="Report">
          <Link className="nav-item" href="/">
            Workspace
          </Link>
          <Link className="nav-item" href={`/api/reports/${report.id}`}>
            API payload
          </Link>
          <Link className="nav-item" href={`/api/reports/${report.id}/export?format=csv`}>
            CSV export
          </Link>
        </nav>
      </aside>
      <section className="content">
        <div className="topbar">
          <div>
            <p className="eyebrow">Saved report</p>
            <h1>{report.source.title}</h1>
          </div>
          <div className="status">Stored as metadata, citations, derived analysis, and short excerpts.</div>
        </div>

        <div className="grid">
          <article className="panel">
            <h2>Citations</h2>
            {report.citations.map((citation) => (
              <p className="citation" key={citation.style}>
                <strong>{citation.style.toUpperCase()}</strong>: {citation.text}
              </p>
            ))}

            <h2 style={{ marginTop: 24 }}>Excerpts</h2>
            <div className="excerpt-list">
              {report.source.excerpts.map((excerpt) => (
                <div className="card" key={excerpt.id}>
                  <strong>{excerpt.author}</strong>
                  <p>{excerpt.excerpt}</p>
                  <p className="meta">Score {excerpt.score}</p>
                </div>
              ))}
            </div>
          </article>

          <aside className="panel">
            <h2>Themes</h2>
            <div className="excerpt-list">
              {report.analysis.themes.map((theme) => (
                <div className="card" key={theme}>
                  {theme}
                </div>
              ))}
            </div>
            <div className="actions">
              <Link className="button" href={`/api/reports/${report.id}/export?format=json`}>
                JSON
              </Link>
              <Link className="button secondary" href={`/api/reports/${report.id}/export?format=csv`}>
                CSV
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
