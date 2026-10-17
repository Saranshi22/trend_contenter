from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class GeneratedImageItem(BaseModel):
    id: str
    url: str
    image_base64: str
    enhanced_prompt: Optional[str] = None
    mime_type: str = "image/png"
    width: Optional[int] = None
    height: Optional[int] = None

class GenerateImageRequest(BaseModel):
    prompt: str = Field(..., description="Prompt describing the image to generate")
    negative_prompt: Optional[str] = Field(None, description="Elements to avoid in the generation")
    aspect_ratio: str = Field("1:1", description="Aspect ratio: 1:1, 3:4, 4:3, 9:16, 16:9, 21:9")
    number_of_images: int = Field(1, ge=1, le=4, description="Number of images to generate")
    safety_filter_level: Optional[str] = Field("block_medium_and_above", description="Safety threshold")
    person_generation: Optional[str] = Field(None, description="Person generation policy")
    enhance_prompt: bool = Field(True, description="Automatically enhance prompt using Gemini")
    style_preset: Optional[str] = Field("none", description="Style preset: cinematic, photorealistic, anime, 3d, cyberpunk, minimalist")
    model: Optional[str] = Field(None, description="Optional Gemini image model (e.g. gemini-3.1-pro-image)")
    api_key: Optional[str] = Field(None, description="Optional Google GenAI API key override")
    base_url: Optional[str] = Field(None, description="Optional LLM gateway base URL override")

class GenerateImageResponse(BaseModel):
    images: List[GeneratedImageItem]
    prompt: str
    enhanced_prompt: Optional[str] = None
    model_used: str

class EditImageRequest(BaseModel):
    image_base64: str = Field(..., description="Base64 encoded source image")
    mask_base64: Optional[str] = Field(None, description="Optional base64 encoded binary mask (white=edit, black=keep)")
    operation: str = Field(
        ...,
        description="Editing operation: replace_background, remove_object, add_object, modify_object, add_text"
    )
    prompt: str = Field(..., description="Edit instruction or description of desired change")
    target_object: Optional[str] = Field(None, description="Target object to remove or replace")
    replacement_prompt: Optional[str] = Field(None, description="New object or background description")
    negative_prompt: Optional[str] = Field(None, description="Negative prompt")
    number_of_images: int = Field(1, ge=1, le=4)
    aspect_ratio: Optional[str] = Field(None)
    model: Optional[str] = Field(None, description="Optional Gemini image model (e.g. gemini-3.1-pro-image)")
    api_key: Optional[str] = Field(None, description="Optional Google GenAI API key override")
    base_url: Optional[str] = Field(None, description="Optional LLM gateway base URL override")

class EditImageResponse(BaseModel):
    images: List[GeneratedImageItem]
    operation: str
    original_image_url: Optional[str] = None
    message: str
    model_used: str

class AddTextRequest(BaseModel):
    image_base64: str = Field(..., description="Base64 encoded source image")
    text: str = Field(..., description="Text content to add")
    font_size: int = Field(48, ge=10, le=250)
    font_family: str = Field("sans-serif", description="sans-serif, serif, monospace, impact, comic")
    font_color: str = Field("#FFFFFF", description="Hex color or rgba")
    position: str = Field("bottom-center", description="Preset position or custom")
    custom_x: Optional[int] = Field(None, description="Custom X pixel coordinate")
    custom_y: Optional[int] = Field(None, description="Custom Y pixel coordinate")
    shadow: bool = Field(True, description="Enable drop shadow")
    shadow_color: str = Field("#000000", description="Shadow color")
    shadow_blur: int = Field(4, ge=0, le=20)
    outline_width: int = Field(2, ge=0, le=20, description="Stroke outline width")
    outline_color: str = Field("#000000", description="Stroke outline color")
    background_box: bool = Field(False, description="Draw semi-transparent badge behind text")
    background_color: str = Field("rgba(0,0,0,0.6)")
    background_padding: int = Field(16, ge=0, le=80)
    border_radius: int = Field(8, ge=0, le=50)
    rotation: float = Field(0.0, ge=-180, le=180, description="Angle in degrees")
    opacity: float = Field(1.0, ge=0.1, le=1.0)

class AddTextResponse(BaseModel):
    image_url: str
    image_base64: str
    width: int
    height: int

class EnhancePromptRequest(BaseModel):
    prompt: str
    style_preset: Optional[str] = None
    target_operation: Optional[str] = "generation"  # generation or edit
    api_key: Optional[str] = None
    base_url: Optional[str] = None

class EnhancePromptResponse(BaseModel):
    original_prompt: str
    enhanced_prompt: str
    keywords: List[str]
    suggested_styles: List[str]

class AnalyzeImageRequest(BaseModel):
    image_base64: str
    prompt: Optional[str] = "Analyze this image and identify all objects, subjects, background elements, lighting style, and recommend 5 creative editing ideas."
    api_key: Optional[str] = None
    base_url: Optional[str] = None

class AnalyzeImageResponse(BaseModel):
    description: str
    detected_objects: List[str]
    background_type: str
    composition_notes: str
    edit_suggestions: List[str]

class GenerateVideoRequest(BaseModel):
    prompt: str = Field(..., description="Prompt describing the video action, motion, lighting, and scene")
    image_base64: Optional[str] = Field(None, description="Optional starting image for Image-to-Video generation")
    aspect_ratio: str = Field("16:9", description="Aspect ratio: 16:9, 9:16, 1:1")
    duration_seconds: int = Field(5, ge=5, le=8, description="Duration in seconds (5-8)")
    fps: int = Field(24, description="Frame rate: 24 or 30")
    person_generation: Optional[str] = Field(None, description="allow_adult, dont_allow, allow_all")
    negative_prompt: Optional[str] = Field(None, description="Elements to avoid in video")
    enhance_prompt: bool = Field(True, description="Automatically enhance video prompt")
    model: Optional[str] = Field(None, description="Video model (default: gemini-omni-1.1-flash or veo-2.0-generate-001)")
    api_key: Optional[str] = Field(None, description="Optional Google GenAI API key override")
    base_url: Optional[str] = Field(None, description="Optional LLM gateway base URL override")

class GenerateVideoResponse(BaseModel):
    id: str
    video_url: str
    video_uri: Optional[str] = None
    prompt: str
    enhanced_prompt: Optional[str] = None
    aspect_ratio: str
    duration_seconds: int
    fps: int
    model_used: str
    status: str = "completed"

# ==========================================
# Concept Generation from Briefs (PDF / Markdown)
# ==========================================

class ContentConceptItem(BaseModel):
    id: str
    title: str
    media_type: str = Field(..., description="'image' or 'video'")
    target_platform: str = Field(..., description="e.g. 'Instagram Reels', 'LinkedIn Carousel', 'YouTube Shorts', 'X / Twitter', 'TikTok'")
    platform_optimization_rationale: str = Field(..., description="Why this platform and format are ideal for this concept")
    concept_hook: str = Field(..., description="Audience hook addressing the friction points or need")
    hook: Optional[str] = Field(None, description="Direct hook accessor")
    visual_description: str = Field(..., description="Description of the scene, subjects, atmosphere")
    generation_prompt: str = Field(..., description="Ready-to-run prompt tailored for Gemini 3.1 Image or Veo Video")
    image_prompt: Optional[str] = Field(None, description="Direct image prompt if image concept")
    video_prompt: Optional[str] = Field(None, description="Direct video prompt if video concept")
    aspect_ratio: str = Field("1:1", description="Recommended aspect ratio: '1:1', '9:16', '16:9'")
    style_preset: Optional[str] = Field("photorealistic", description="Style preset or aesthetic")
    camera_motion: Optional[str] = Field(None, description="Camera direction for Veo video (e.g. slow push-in, FPV drone)")
    duration_seconds: Optional[int] = Field(5, description="Recommended video duration")
    fps: Optional[int] = Field(24, description="Recommended fps")

    def model_post_init(self, __context):
        if not self.hook and self.concept_hook:
            self.hook = self.concept_hook
        if not self.concept_hook and self.hook:
            self.concept_hook = self.hook
        if self.media_type == "video" and not self.video_prompt:
            self.video_prompt = self.generation_prompt
        elif self.media_type == "image" and not self.image_prompt:
            self.image_prompt = self.generation_prompt

class GenerateConceptsRequest(BaseModel):
    brief_text: Optional[str] = Field(None, description="Markdown or plain text content of the brief")
    file_base64: Optional[str] = Field(None, description="Base64 encoded PDF or Markdown file")
    file_mime_type: Optional[str] = Field("text/markdown", description="application/pdf, text/markdown, text/plain")
    num_concepts: int = Field(4, ge=1, le=8, description="Number of content concepts to generate")
    preferred_media_mix: Optional[str] = Field("balanced", description="'balanced' (both images and videos), 'image_only', 'video_only'")
    target_platforms: Optional[List[str]] = Field(None, description="Optional target platforms filter")
    api_key: Optional[str] = Field(None, description="Optional Google GenAI API key override")
    base_url: Optional[str] = Field(None, description="Optional LLM gateway base URL override")

class OpportunityConceptsRequest(BaseModel):
    """Options for generating concepts from a staged Trend Contenter opportunity (brief is built server-side)."""
    num_concepts: int = Field(4, ge=1, le=8)
    preferred_media_mix: Optional[str] = Field("balanced", description="'balanced', 'image_only', 'video_only'")
    target_platforms: Optional[List[str]] = None

class GenerateConceptsResponse(BaseModel):
    brief_title: str
    brief_summary: str
    target_audience: str
    key_friction_points: List[str]
    concepts: List[ContentConceptItem]
    model_used: str
    is_demo: bool = Field(False, description="True when sample concepts were returned because no Gemini API key is configured")


# ==========================================
# Image Recommendation & Multimodal Reranking
# ==========================================

class RecommendImagesRequest(BaseModel):
    prompt: str = Field(..., description="Search query / prompt for finding relevant imagery")
    num_results: int = Field(8, ge=2, le=20, description="Number of final recommendations")
    search_provider: Optional[str] = Field("auto", description="google_cse, serpapi, web, or auto")
    reranker_model: Optional[str] = Field("hybrid", description="gemini, clip, or hybrid")
    safe_search: bool = Field(True)
    gemini_api_key: Optional[str] = None
    serpapi_key: Optional[str] = None
    google_cse_key: Optional[str] = None
    google_cse_id: Optional[str] = None
    base_url: Optional[str] = None

class RecommendedImageItem(BaseModel):
    id: str
    image_url: str
    thumbnail_url: str
    title: str
    snippet: str
    source_domain: str
    width: Optional[int] = None
    height: Optional[int] = None
    relevance_score: float = Field(..., description="Prompt alignment score 0.0 - 1.0")
    aesthetic_score: Optional[float] = Field(None, description="Visual quality score 0.0 - 1.0")
    context_score: Optional[float] = Field(None, description="Trend/context score 0.0 - 1.0")
    overall_score: float = Field(..., description="Weighted final score 0.0 - 1.0")
    reasoning: Optional[str] = Field(None, description="Explanation for recommendation")
    tags: List[str] = Field(default_factory=list)

class RecommendImagesResponse(BaseModel):
    prompt: str
    total_candidates: int
    reranker_model: str
    recommendations: List[RecommendedImageItem]


# ==========================================
# Content Experiments & Campaign Supply Chain
# ==========================================

class ContentExperimentVariant(BaseModel):
    id: str
    variant_type: str = Field(..., description="trend_jacker, educational_solution, or emotive_narrative")
    variant_label: str = Field(..., description="Human-readable label for variant")
    title: str = Field(..., description="Working title for this variant")
    hook: str = Field(..., description="Catchy opening hook / headline")
    angle: str = Field(..., description="Editorial strategic angle")
    instagram_copy: str = Field(..., description="Full Instagram caption with hashtags")
    facebook_copy: str = Field(..., description="Facebook post copy with hashtags")
    email_subject: str = Field(..., description="Email campaign subject line")
    email_preview: str = Field(..., description="Email preview preheader")
    email_body: str = Field(..., description="Email newsletter body content in markdown/plain text")
    email_cta_text: str = Field("Explore Campaign", description="Email Call to Action button label")
    email_cta_url: str = Field("https://trendcontenter.com/", description="Email CTA link URL")
    visual_direction: str = Field(..., description="Visual styling and imagery description")
    search_query: str = Field(..., description="Optimal search query to find recommended reference imagery")
    veo_motion_prompt: str = Field(..., description="Cinematic motion prompt for Google Veo")
    hashtags: List[str] = Field(default_factory=list)
    audience_fit_score: float = Field(0.9, description="Audience persona fit score 0.0 - 1.0")

class GenerateExperimentsRequest(BaseModel):
    brief_text: Optional[str] = None
    brief_file_base64: Optional[str] = None
    brief_file_mime: Optional[str] = None
    opportunity_id: Optional[str] = None
    campaign_goal: Optional[str] = Field("engagement", description="awareness, engagement, product_launch, education")
    target_audience: Optional[str] = None
    brand_tone: Optional[str] = Field("dynamic", description="authoritative, playful, inspiring, urgent")
    api_key: Optional[str] = None
    base_url: Optional[str] = None

class GenerateExperimentsResponse(BaseModel):
    campaign_title: str
    campaign_summary: str
    target_audience: str
    core_friction_point: str
    variants: List[ContentExperimentVariant]
    model_used: str


# ==========================================
# Omni-Channel Publishers (Facebook, Instagram, Email)
# ==========================================

class PublishFacebookRequest(BaseModel):
    image_url: str = Field(..., description="Public image URL or hosted asset URL to publish")
    text: str = Field(..., min_length=1, description="Post caption/message")
    hashtags: Optional[List[str]] = Field(default_factory=list)
    page_id: Optional[str] = None
    access_token: Optional[str] = None
    gcs_bucket: Optional[str] = None
    gcloud_service_key: Optional[str] = None

class PublishInstagramRequest(BaseModel):
    image_url: str = Field(..., description="Public image URL to publish to Instagram feed")
    text: str = Field(..., min_length=1, max_length=2200, description="Instagram caption")
    hashtags: Optional[List[str]] = Field(default_factory=list)
    instagram_user_id: Optional[str] = None
    access_token: Optional[str] = None
    gcs_bucket: Optional[str] = None
    gcloud_service_key: Optional[str] = None

class EmailTemplateConfig(BaseModel):
    theme: Optional[str] = Field("modern_blue", description="modern_blue, minimalist_dark, emerald_clean, sunset_amber")
    brand_heading: Optional[str] = Field("TREND CONTENT", description="Header brand name")
    brand_subtitle: Optional[str] = Field("Campaign Intelligence Notification", description="Header subtitle")
    accent_color: Optional[str] = Field("#004B93", description="Primary accent color in hex")
    primary_cta_text: Optional[str] = Field("Explore Campaign", description="Primary CTA button text")
    primary_cta_url: Optional[str] = Field("https://trendcontenter.com/", description="Primary CTA target URL")
    secondary_button_text: Optional[str] = None
    secondary_button_url: Optional[str] = None
    footer_text: Optional[str] = Field("You are receiving this intelligence notification from Trend Contenter.", description="Footer copyright/compliance")
    include_hero_image: bool = Field(True, description="Whether to include hero image in email")

class PublishEmailRequest(BaseModel):
    to_emails: List[str] = Field(..., min_length=1, description="List of recipient email addresses")
    subject: str = Field(..., min_length=1, max_length=998, description="Email subject line")
    headline: Optional[str] = Field(None, description="Main email heading / title")
    campaign_body: str = Field(..., description="Main email body content (supports markdown and paragraphs)")
    image_url: Optional[str] = Field(None, description="Optional hero image URL to display/attach in email")
    template_config: Optional[EmailTemplateConfig] = Field(default_factory=EmailTemplateConfig)
    custom_html: Optional[str] = Field(None, description="Optional raw custom HTML override")
    from_email: Optional[str] = None
    reply_to: Optional[str] = None
    sendgrid_api_key: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None

class ChannelStatus(BaseModel):
    configured: bool
    platform: str
    details: Optional[str] = None

class PublishingStatusResponse(BaseModel):
    facebook: ChannelStatus
    instagram: ChannelStatus
    email: ChannelStatus

class PublishResult(BaseModel):
    platform: str
    success: bool
    post_id: Optional[str] = None
    url: Optional[str] = None
    message: str
    details: Optional[Dict[str, Any]] = None



