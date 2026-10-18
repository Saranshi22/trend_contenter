export type UserRole = 'workspace_admin' | 'research_analyst' | 'content_creator' | 'editor' | 'viewer';

export interface ProviderMetrics {
  search_volume: number | null;
  increase_percentage: number | null;
  start_timestamp: string | null;
  end_timestamp: string | null;
  trend_breakdown: string[];
  source_links: Record<string, string>;
  source_provider: string;
}

export interface InternalMetrics {
  qualification_score: number;
  velocity: number | null;
  acceleration: number | null;
  novelty_score: number;
  status: string;
}

export interface TrendRadarItem {
  trend_id: string;
  topic: string;
  canonical_topic: string | null;
  region: string;
  category: string | null;
  active: boolean;
  observed_at: string;
  retrieved_at: string | null;
  provider_metrics: ProviderMetrics;
  internal_metrics: InternalMetrics;
}

export interface EvidenceDetail {
  evidence_id: string;
  source_type: string;
  platform: string;
  title: string | null;
  text_excerpt: string | null;
  url: string | null;
  author: string | null;
  published_at: string | null;
  retrieved_at: string | null;
  confidence: number;
  is_inferred: boolean;
  engagement: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface Opportunity {
  opportunity_id: string;
  investigation_id?: string;
  segment_id: string;
  audience_label?: string;
  audience_description?: string;
  audience_needs?: string[];
  audience_questions?: string[];
  audience_concerns?: string[];
  title: string;
  score: number;
  problem?: string;
  audience_need?: string;
  content_gap?: string;
  strategic_rationale?: string;
  key_talking_points?: string[];
  target_audience_pain_points?: string[];
  recommended_outline?: Array<{ section_title: string; key_takeaway: string; suggested_visual_or_element?: string }>;
  hook_options?: Array<{ hook_type: string; headline: string; rationale: string }>;
  recommended_angle?: string;
  recommended_format?: string;
  supported_formats?: string[];
  score_breakdown?: Record<string, number>;
  evidence_ids?: string[];
  evidence_references?: EvidenceDetail[];
  status?: string;
}

export interface AudienceSegment {
  segment_id: string;
  label: string;
  description?: string;
  needs: string[];
  questions: string[];
  concerns: string[];
  opportunity_count: number;
  primary_question?: string;
}

export interface InvestigationSummary {
  investigation_id: string;
  topic: string;
  region: string;
  status: string;
  stage: string;
  source_statuses: Record<string, string>;
  opportunities_count: number;
  evidence_count: number;
  created_at: string | null;
  errors: any[];
}

export interface InvestigationDetail {
  investigation_id: string;
  topic: string;
  region: string;
  status: string;
  stage: string;
  source_statuses: Record<string, string>;
  research_plan: Record<string, any>;
  narratives: any[];
  questions: any[];
  audience_segments: any[];
  content_gaps: any[];
  opportunities: any[];
  llm_analysis: Record<string, any>;
  evidence: EvidenceDetail[];
  errors: any[];
  created_at: string | null;
}

export interface WatchlistItem {
  watchlist_id: string;
  workspace_id: string;
  name: string;
  keywords: string[];
  region: string;
  min_qualification_score: number;
  auto_investigate: boolean;
  created_at?: string;
}

export interface AdminUser {
  user_id: string;
  workspace_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at?: string;
}

export interface IntegrationInfo {
  integration_id: string;
  name: string;
  provider_type: string;
  status: string;
  masked_key: string;
  last_synced?: string | null;
  details: Record<string, any>;
}

export interface WorkspaceConfig {
  workspace_id: string;
  trend_qualification_threshold: number;
  poll_interval_minutes: number;
  default_region: string;
  llm_monitoring_enabled: boolean;
  social_research_enabled: boolean;
  web_research_enabled: boolean;
}

export interface AuditLogItem {
  log_id: number;
  actor_user_id: string;
  workspace_id: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  timestamp: string;
  metadata: Record<string, any>;
}

export interface ProviderHealthItem {
  id: string;
  name: string;
  provider_type: string;
  configured: boolean;
  status: 'healthy' | 'degraded' | 'unavailable' | 'not_configured';
  label: string;
  badge_class: string;
  last_runtime_status?: string | null;
  details: string;
}

export interface ProviderHealthSummary {
  providers: ProviderHealthItem[];
  all_healthy: boolean;
  healthy_count: number;
  total_count: number;
  headline: string;
}

// ==========================================
// Content Studio Types (Gemini 3.1 & Veo 2)
// ==========================================

export interface ContentConceptItem {
  id: string;
  title: string;
  media_type: 'image' | 'video';
  target_platform: string;
  platform_optimization_rationale: string;
  concept_hook: string;
  hook?: string;
  visual_description: string;
  generation_prompt: string;
  image_prompt?: string;
  video_prompt?: string;
  aspect_ratio: string;
  style_preset?: string;
  camera_motion?: string;
  duration_seconds?: number;
  fps?: number;
}

export interface GenerateConceptsResponse {
  brief_title: string;
  brief_summary: string;
  target_audience: string;
  key_friction_points: string[];
  concepts: ContentConceptItem[];
  model_used: string;
  is_demo: boolean;
}

export interface GeneratedImageItem {
  id: string;
  url: string;
  image_base64?: string;
  enhanced_prompt?: string | null;
  mime_type: string;
  width?: number | null;
  height?: number | null;
}

export interface GenerateImageResponse {
  images: GeneratedImageItem[];
  prompt: string;
  enhanced_prompt?: string | null;
  model_used: string;
}

export interface EditImageResponse {
  images: GeneratedImageItem[];
  operation: string;
  original_image_url?: string | null;
  message: string;
  model_used: string;
}

export interface AddTextResponse {
  image_url: string;
  image_base64: string;
  width: number;
  height: number;
}

export interface GenerateVideoResponse {
  id: string;
  video_url: string;
  video_uri?: string | null;
  prompt: string;
  enhanced_prompt?: string | null;
  aspect_ratio: string;
  duration_seconds: number;
  fps: number;
  model_used: string;
  status: string;
}

export interface EnhancePromptResponse {
  original_prompt: string;
  enhanced_prompt: string;
  keywords: string[];
  suggested_styles: string[];
}

export interface AnalyzeImageResponse {
  description: string;
  detected_objects: string[];
  background_type: string;
  composition_notes: string;
  edit_suggestions: string[];
}

export interface RecommendedImageItem {
  id: string;
  image_url: string;
  thumbnail_url: string;
  title: string;
  snippet: string;
  source_domain: string;
  width?: number | null;
  height?: number | null;
  relevance_score: number;
  aesthetic_score?: number | null;
  context_score?: number | null;
  overall_score: number;
  reasoning?: string | null;
  tags: string[];
}

export interface RecommendImagesRequest {
  prompt: string;
  num_results?: number;
  search_provider?: string;
  reranker_model?: string;
  safe_search?: boolean;
  headline?: string;
  topic?: string;
  visual_direction?: string;
  style?: string;
}

export interface RecommendImagesResponse {
  prompt: string;
  optimized_query?: string;
  total_candidates: number;
  reranker_model: string;
  recommendations: RecommendedImageItem[];
}

export interface ContentExperimentVariant {
  id: string;
  variant_type: 'trend_jacker' | 'educational_solution' | 'emotive_narrative' | string;
  variant_label: string;
  title: string;
  hook: string;
  angle: string;
  instagram_copy: string;
  facebook_copy: string;
  email_subject: string;
  email_preview: string;
  email_body: string;
  email_cta_text: string;
  email_cta_url: string;
  visual_direction: string;
  search_query: string;
  veo_motion_prompt: string;
  hashtags: string[];
  audience_fit_score: number;
}

export interface GenerateExperimentsResponse {
  campaign_title: string;
  campaign_summary: string;
  target_audience: string;
  core_friction_point: string;
  variants: ContentExperimentVariant[];
  model_used: string;
}

export interface EmailTemplateConfig {
  theme?: 'modern_blue' | 'minimalist_dark' | 'emerald_clean' | 'sunset_amber' | string;
  brand_heading?: string;
  brand_subtitle?: string;
  accent_color?: string;
  primary_cta_text?: string;
  primary_cta_url?: string;
  secondary_button_text?: string | null;
  secondary_button_url?: string | null;
  footer_text?: string;
  include_hero_image?: boolean;
}

export interface PublishFacebookRequest {
  image_url: string;
  text: string;
  hashtags?: string[];
  page_id?: string;
  access_token?: string;
}

export interface PublishInstagramRequest {
  image_url: string;
  text: string;
  hashtags?: string[];
  instagram_user_id?: string;
  access_token?: string;
}

export interface PublishEmailRequest {
  to_emails: string[];
  subject: string;
  headline?: string | null;
  campaign_body: string;
  image_url?: string | null;
  template_config?: EmailTemplateConfig;
  custom_html?: string | null;
  from_email?: string | null;
  reply_to?: string | null;
  sendgrid_api_key?: string | null;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_username?: string | null;
  smtp_password?: string | null;
}

export interface ChannelStatus {
  configured: boolean;
  platform: string;
  details?: string | null;
}

export interface PublishingStatusResponse {
  facebook: ChannelStatus;
  instagram: ChannelStatus;
  email: ChannelStatus;
}

export interface PublishResult {
  platform: string;
  success: boolean;
  post_id?: string | null;
  url?: string | null;
  message: string;
  details?: any;
}

export interface CampaignDraft {
  campaign_id: string;
  workspace_id?: string;
  user_id?: string;
  opportunity_id?: string | null;
  title: string;
  current_stage: 'brief' | 'concepts' | 'assets' | 'publish' | string;
  brief_data: {
    briefText?: string;
    briefFileName?: string | null;
    briefFileMime?: string;
    briefFileSize?: number | null;
    entryMode?: 'opportunity' | 'upload' | 'manual';
    manualObjective?: string;
    manualAudience?: string;
    manualNotes?: string;
    numAssetsConfig?: number;
    campaignGoal?: string;
    brandTone?: string;
    targetAudienceInput?: string;
    showSecondaryBriefOptions?: boolean;
  };
  concepts_data?: GenerateExperimentsResponse | null;
  active_concept?: ContentExperimentVariant | null;
  artwork_data?: {
    generatedImages?: GeneratedImageItem[];
    imagePrompt?: string;
    aspectRatio?: string;
    stylePreset?: string;
    numImagesToGenerate?: number;
    concept_id?: string | null;
    concept_title?: string | null;
    mediaMode?: 'image' | 'video';
    generatedVideos?: GenerateVideoResponse[];
    videoPrompt?: string;
    videoAspectRatio?: string;
    videoDuration?: number;
    videoFps?: number;
  };
  active_artwork?: {
    url: string;
    title?: string;
    base64?: string;
    media_type?: 'image' | 'video';
  } | null;
  curated_assets?: RecommendedImageItem[];
  selected_reference?: RecommendedImageItem | null;
  copy_data?: {
    instagramCaption?: string;
    facebookPostCopy?: string;
  };
  email_data?: {
    emailRecipients?: string;
    emailSubject?: string;
    emailHeadline?: string;
    emailBody?: string;
    emailTheme?: string;
    emailBrandHeading?: string;
    emailBrandSubtitle?: string;
    emailAccentColor?: string;
    emailIncludeHeroImage?: boolean;
    emailPrimaryCtaText?: string;
    emailPrimaryCtaUrl?: string;
    emailSecondaryBtnText?: string;
    emailSecondaryBtnUrl?: string;
    emailFooterText?: string;
    emailPreviewMode?: 'desktop' | 'mobile';
  };
  publish_data?: {
    publishChannel?: 'instagram' | 'facebook' | 'email';
    fromEmail?: string;
    emailDeliveryMode?: 'sendgrid' | 'smtp';
    smtpHost?: string;
    smtpPort?: number;
    smtpUsername?: string;
    publishHistory?: Array<{ platform: string; id: string; url?: string; timestamp: string; title: string }>;
  };
  status?: string;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CampaignDraftSummary {
  campaign_id: string;
  opportunity_id?: string | null;
  title: string;
  current_stage: string;
  status: string;
  has_concepts: boolean;
  has_artwork: boolean;
  has_active_concept: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ListCampaignDraftsResponse {
  drafts: CampaignDraftSummary[];
  total: number;
}

