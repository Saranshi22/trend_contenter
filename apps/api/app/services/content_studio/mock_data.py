"""
Curated sample assets and fallback generator for offline testing or demo mode.
"""
from typing import List, Dict, Any
from PIL import Image, ImageDraw, ImageFont
import io
import base64

SAMPLE_SEARCH_IMAGES = [
    {
        "id": "mock_img_1",
        "image_url": "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1200&q=80",
        "thumbnail_url": "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=300&q=80",
        "title": "Modern Collaborative Workspace with Natural Daylight",
        "snippet": "High aesthetic modern office with creative team working on digital content and branding.",
        "source_domain": "unsplash.com",
        "width": 1200,
        "height": 800,
        "tags": ["workspace", "minimalist", "creative", "natural lighting"]
    },
    {
        "id": "mock_img_2",
        "image_url": "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1200&q=80",
        "thumbnail_url": "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=300&q=80",
        "title": "Vibrant Aurora Night Sky Over Snowy Mountain Peaks",
        "snippet": "Cinematic northern lights aurora borealis glowing emerald green and violet above crisp alpine ridge.",
        "source_domain": "unsplash.com",
        "width": 1200,
        "height": 800,
        "tags": ["aurora", "night sky", "cinematic", "nature", "mountains"]
    },
    {
        "id": "mock_img_3",
        "image_url": "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
        "thumbnail_url": "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=300&q=80",
        "title": "Minimalist Red Athletic Sneaker Studio Product Shot",
        "snippet": "Dynamic studio product photography of a sleek athletic shoe floating against a clean backdrop with soft shadows.",
        "source_domain": "unsplash.com",
        "width": 1200,
        "height": 800,
        "tags": ["product photography", "sneakers", "studio lighting", "minimalist"]
    },
    {
        "id": "mock_img_4",
        "image_url": "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1200&q=80",
        "thumbnail_url": "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=300&q=80",
        "title": "Neon Cyberpunk Tokyo Street at Midnight with Rain Reflections",
        "snippet": "Atmospheric futuristic neon city street reflecting glowing signs in puddles after twilight rain.",
        "source_domain": "unsplash.com",
        "width": 1200,
        "height": 800,
        "tags": ["cyberpunk", "neon", "tokyo", "futuristic", "rain reflections"]
    },
    {
        "id": "mock_img_5",
        "image_url": "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80",
        "thumbnail_url": "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=300&q=80",
        "title": "Minimalist Desk Setup with Laptop and Ceramic Mug",
        "snippet": "Organized clean creator desk with warm wooden desk, typography notebook and coffee.",
        "source_domain": "unsplash.com",
        "width": 1200,
        "height": 800,
        "tags": ["desk setup", "minimalist", "coffee", "productive"]
    },
    {
        "id": "mock_img_6",
        "image_url": "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1200&q=80",
        "thumbnail_url": "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=300&q=80",
        "title": "Misty Pine Forest with Golden Morning Sunbeams",
        "snippet": "Ethereal landscape photography of tall evergreen trees enveloped in morning fog as sun rays pierce through.",
        "source_domain": "unsplash.com",
        "width": 1200,
        "height": 800,
        "tags": ["nature", "sunbeams", "misty forest", "golden hour"]
    }
]

def generate_demo_canvas(prompt: str, width: int = 1024, height: int = 1024, style: str = "art") -> Image.Image:
    """Generates an aesthetic canvas image with gradient and prompt text for demo fallback."""
    img = Image.new("RGB", (width, height), color=(24, 24, 38))
    draw = ImageDraw.Draw(img)

    # Gradient background
    for y in range(height):
        r = int(24 + (y / height) * 45)
        g = int(24 + (y / height) * 20)
        b = int(38 + (y / height) * 75)
        draw.line([(0, y), (width, y)], fill=(r, g, b))

    # Abstract glowing geometric accents
    draw.ellipse([width * 0.1, height * 0.1, width * 0.6, height * 0.6], outline=(120, 80, 255), width=4)
    draw.ellipse([width * 0.4, height * 0.35, width * 0.9, height * 0.85], outline=(255, 110, 180), width=3)

    # Draw label
    font = ImageFont.load_default()
    draw.text((40, 40), "✨ GEMINI 3.1 PRO / VEO CANVAS", fill=(200, 220, 255), font=font)
    draw.text((40, 80), f"Prompt: {prompt[:80]}...", fill=(255, 255, 255), font=font)
    draw.text((40, height - 60), f"Mode: {style} • Aspect: {width}x{height}", fill=(180, 180, 180), font=font)

    return img

SAMPLE_PREVIEW_VIDEOS = [
    {
        "title": "Cinematic Drone Flythrough",
        "url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
    },
    {
        "title": "Dynamic Landscape Escape",
        "url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4"
    },
    {
        "title": "Vibrant Motion Fun",
        "url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4"
    }
]

def get_demo_video_url(prompt: str) -> str:
    """Returns a high-quality sample video URL for demo mode fallback."""
    import hashlib
    idx = int(hashlib.md5(prompt.encode()).hexdigest(), 16) % len(SAMPLE_PREVIEW_VIDEOS)
    return SAMPLE_PREVIEW_VIDEOS[idx]["url"]

