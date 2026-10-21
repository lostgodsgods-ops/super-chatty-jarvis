import unittest

from python_core import process_task


class HybridCoreTests(unittest.TestCase):
    def test_summarize_is_bounded_to_three_sentences(self):
        result = process_task("summarize", "One. Two. Three. Four.")
        self.assertEqual(result, "One. Two. Three.")

    def test_extract_keywords_returns_ranked_terms(self):
        result = process_task("extract_keywords", "Worker timeout. Worker failed. Search timeout.")
        self.assertEqual(result[0], {"term": "worker", "count": 2})
        self.assertEqual(result[1], {"term": "timeout", "count": 2})

    def test_classify_text_reports_multiple_applicable_labels(self):
        result = process_task("classify_text", "Breaking news: Worker timeout today.")
        self.assertEqual(result["labels"], ["technical_issue", "current_information"])

    def test_disallowed_task_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "HYBRID_TASK_NOT_ALLOWED"):
            process_task("execute_shell", "whoami")

    def test_empty_or_oversized_text_is_rejected(self):
        for value in ("  ", "x" * 16001):
            with self.subTest(length=len(value)):
                with self.assertRaisesRegex(ValueError, "HYBRID_TEXT_LENGTH_INVALID"):
                    process_task("summarize", value)


if __name__ == "__main__":
    unittest.main()
