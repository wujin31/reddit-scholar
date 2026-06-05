import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
FIXTURE = ROOT / "packages" / "shared" / "fixtures" / "thread.json"
sys.path.insert(0, str(ROOT / "services" / "worker"))

from scholarsync_worker import analyze_thread, format_citation, report_to_csv


class WorkerTest(unittest.TestCase):
    def setUp(self):
        self.thread = json.loads(FIXTURE.read_text())

    def test_format_citation_outputs_apa_and_mla(self):
        apa = format_citation(self.thread, "apa")
        mla = format_citation(self.thread, "mla")

        self.assertIn("Reddit", apa)
        self.assertIn(self.thread["url"], apa)
        self.assertIn('"How did neighborhood message boards influence local mutual aid before social media?"', mla)

    def test_analysis_is_deterministic(self):
        analysis = analyze_thread(self.thread)

        self.assertGreaterEqual(len(analysis["keywords"]), 3)
        self.assertIn("themes", analysis)
        self.assertIn("summary", analysis)

    def test_report_to_csv_contains_expected_columns(self):
        analysis = analyze_thread(self.thread)
        report = {
            "id": "report_mockscholar",
            "source": self.thread,
            "citations": [{"style": "apa", "text": format_citation(self.thread, "apa")}],
            "analysis": analysis,
        }

        exported = report_to_csv(report)

        self.assertIn("report_id,thread_id,subreddit,title,permalink,keyword,citation_apa", exported)
        self.assertIn("report_mockscholar", exported)


if __name__ == "__main__":
    unittest.main()
