import unittest
import asyncio
from PIL import Image
from models.schemas import (
    AddTextRequest,
    GenerateImageRequest,
    EditImageRequest,
    EnhancePromptRequest,
    RecommendImagesRequest,
    GenerateVideoRequest,
    GenerateConceptsRequest
)
from services.typography_service import TypographyService
from services.gemini_service import gemini_service
from services.veo_service import veo_service
from services.concept_service import concept_service
from services.search_service import search_service
from services.reranker_service import reranker_service
from utils.image_utils import pil_to_base64

class TestTrendContenterServices(unittest.TestCase):
    def test_typography_service(self):
        # Create sample image
        img = Image.new("RGB", (600, 400), color=(50, 100, 150))
        b64 = pil_to_base64(img)

        req = AddTextRequest(
            image_base64=b64,
            text="TREND VIBES 2026",
            font_size=36,
            font_color="#FFFFFF",
            position="bottom-center",
            shadow=True,
            outline_width=2,
            outline_color="#000000",
            background_box=True
        )

        res = TypographyService.add_text_to_image(req)
        self.assertTrue(res.image_url.startswith("/content/"))
        self.assertTrue(res.image_base64.startswith("data:image/png;base64,"))
        self.assertEqual(res.width, 600)
        self.assertEqual(res.height, 400)

    def test_search_service_fallback(self):
        async def run_search():
            return await search_service.search_images("modern minimalist architecture", num_results=5)

        results = asyncio.run(run_search())
        self.assertGreater(len(results), 0)
        self.assertIn("image_url", results[0])
        self.assertIn("title", results[0])

    def test_reranker_service(self):
        async def run_rerank():
            candidates = [
                {
                    "id": "1",
                    "image_url": "https://example.com/1.jpg",
                    "thumbnail_url": "https://example.com/1_t.jpg",
                    "title": "Minimalist Architecture House",
                    "snippet": "Stunning clean concrete and glass modern villa design.",
                    "source_domain": "archdaily.com"
                },
                {
                    "id": "2",
                    "image_url": "https://example.com/2.jpg",
                    "thumbnail_url": "https://example.com/2_t.jpg",
                    "title": "Chocolate Cake Recipe",
                    "snippet": "Delicious triple chocolate fudge cake with frosting.",
                    "source_domain": "food.com"
                }
            ]

            return await reranker_service.rerank(
                prompt="minimalist architecture house with glass",
                candidates=candidates,
                model_type="hybrid"
            )

        ranked = asyncio.run(run_rerank())
        self.assertEqual(len(ranked), 2)
        # Architecture should score higher than chocolate cake for architecture query
        self.assertEqual(ranked[0].id, "1")
        self.assertGreaterEqual(ranked[0].overall_score, ranked[1].overall_score)

    def test_gemini_service_demo_generation(self):
        req = GenerateImageRequest(
            prompt="Cyberpunk neon city street at night",
            aspect_ratio="1:1",
            number_of_images=1,
            style_preset="cyberpunk",
            model="gemini-3.1-pro-image"
        )
        res = gemini_service.generate_image(req)
        self.assertGreaterEqual(len(res.images), 1)
        self.assertTrue(res.images[0].url.startswith("/content/"))
        self.assertIn("gemini-3.1-pro-image", res.model_used)

    def test_gemini_service_demo_edit(self):
        img = Image.new("RGB", (512, 512), color=(100, 150, 200))
        b64 = pil_to_base64(img)
        req = EditImageRequest(
            image_base64=b64,
            operation="replace_background",
            prompt="cyberpunk cityscape with neon lights",
            model="gemini-3.1-pro-image"
        )
        res = gemini_service.edit_image(req)
        self.assertGreaterEqual(len(res.images), 1)
        self.assertTrue(res.images[0].url.startswith("/content/"))
        self.assertIn("gemini-3.1-pro-image", res.model_used)

    def test_veo_service_demo_generation(self):
        req = GenerateVideoRequest(
            prompt="FPV drone sweeping through a neon cyberpunk metropolis at sunset",
            aspect_ratio="16:9",
            duration_seconds=5,
            fps=24,
            model="veo-2.0-generate-001"
        )
        res = veo_service.generate_video(req)
        self.assertTrue(res.video_url.startswith("http") or res.video_url.startswith("/content/"))
        self.assertIn("veo-2.0-generate-001", res.model_used)
        self.assertEqual(res.aspect_ratio, "16:9")

    def test_concept_service_markdown_brief(self):
        req = GenerateConceptsRequest(
            brief_text="# Executive Opportunity Dossier: Unlocking CBD Ground\nCivic activists need permits and sound guidelines.",
            media_mix="both",
            target_count=4
        )
        res = concept_service.generate_concepts(req)
        self.assertTrue(len(res.concepts) >= 1)
        self.assertTrue(bool(res.brief_title))
        self.assertTrue(bool(res.target_audience))
        self.assertTrue(len(res.key_friction_points) > 0)

        # Check first concept
        first = res.concepts[0]
        self.assertTrue(bool(first.title))
        self.assertTrue(bool(first.target_platform))
        self.assertTrue(bool(first.platform_optimization_rationale))
        self.assertTrue(bool(first.hook))
        self.assertIn(first.media_type, ["image", "video"])
        if first.media_type == "video":
            self.assertTrue(bool(first.video_prompt))
        else:
            self.assertTrue(bool(first.image_prompt))

    def test_concept_service_video_mix(self):
        req = GenerateConceptsRequest(
            brief_text="Protest logistics and organizing guide",
            media_mix="video",
            target_count=2
        )
        res = concept_service.generate_concepts(req)
        self.assertTrue(len(res.concepts) >= 1)
        for c in res.concepts:
            self.assertEqual(c.media_type, "video")
            self.assertTrue(bool(c.video_prompt))

if __name__ == "__main__":
    unittest.main()

