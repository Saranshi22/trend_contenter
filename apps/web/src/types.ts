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
