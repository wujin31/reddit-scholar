# ScholarSync Worker

The worker contains deterministic citation, keyword, and export helpers for the first milestone. It intentionally avoids external NLP dependencies until the fixture-backed workflow is stable.

Future production work can add spaCy or transformer-backed pipelines, but Reddit content must not be used for model training.
