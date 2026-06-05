import Link from "next/link";
import { createMockReport } from "../lib/mock-report";

export default function Home() {
  const report = createMockReport();

  return (
    <main className="shell">
      <aside className="sidebar">
        <p className="brand">ScholarSync</p>
        <p className="tagline">Personal Reddit research reader for citation, review, and limited exports.</p>
        <nav className="nav-list" aria-label="Workspace">
          <Link className="nav-item" href="/">
            Workspace
          </Link>
          <Link className="nav-item" href={`/reports/${report.id}`}>
            Mock report
          </Link>
          <Link className="nav-item" href="/api/reports/report_mockscholar/export?format=json">
            JSON export
          </Link>
        </nav>
      </aside>
      <section className="content">
        <div className="topbar">
          <div>
            <p className="eyebrow">Fixture workspace</p>
            <h1>Research Reader</h1>
          </div>
          <div className="status">OAuth is intentionally not wired yet. This build uses local fixtures.</div>
        </div>

        <div className="grid">
          <article className="panel">
            <p className="meta">r/{report.source.subreddit}</p>
            <h2 className="thread-title">{report.source.title}</h2>
            <p className="meta">
              Posted by {report.source.author} · {report.source.score} score · {report.source.commentCount} comments
            </p>

            <div className="metric-row">
              <div className="metric">
                <strong>{report.analysis.keywords.length}</strong>
                Keywords
              </div>
              <div className="metric">
                <strong>{report.source.excerpts.length}</strong>
                Excerpts
              </div>
              <div className="metric">
                <strong>{report.citations.length}</strong>
                Citations
              </div>
            </div>

            <h2>Comment Excerpts</h2>
            <div className="excerpt-list">
              {report.source.excerpts.map((excerpt) => (
                <div className="card" key={excerpt.id}>
                  <strong>{excerpt.author}</strong>
                  <p>{excerpt.excerpt}</p>
                </div>
              ))}
            </div>
          </article>

          <aside className="panel">
            <h2>Analysis</h2>
            <p>{report.analysis.summary}</p>
            <div className="keywords">
              {report.analysis.keywords.map((keyword) => (
                <span className="keyword" key={keyword}>
                  {keyword}
                </span>
              ))}
            </div>

            <h2 style={{ marginTop: 24 }}>APA Citation</h2>
            <p className="citation">{report.citations[0].text}</p>

            <div className="actions">
              <Link className="button" href={`/reports/${report.id}`}>
                Open report
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
