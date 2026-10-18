import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type {
  Opportunity, 
  GeneratedImageItem, 
  GenerateImageResponse,
  GenerateVideoResponse,
  RecommendImagesResponse,
  RecommendedImageItem,
  ContentExperimentVariant,
  GenerateExperimentsResponse,
  PublishingStatusResponse,
  PublishResult,
  CampaignDraft,
  CampaignDraftSummary
} from '../types';
import { API_BASE } from '../apiConfig';
import { campaignDraftStore, type SaveStatus } from '../services/campaignDraftStore';
import {
  IconCheck,
  IconSparkles,
  IconBrush,
  IconCopy,
  IconUpload,
  IconAlertTriangle,
  IconArrowRight,
  IconFacebook,
  IconInstagram,
  IconMail,
  IconSend,
  IconSmartphone,
  IconMonitor,
  IconRefresh,
  IconKey,
  IconLock,
  IconSearch,
  IconFileText,
  IconVideo,
  IconImage,
  IconLightning,
  IconDownload,
  IconInfo
} from '../components/Icons';

interface ContentStudioPageProps {
  opportunities: Opportunity[];
  onSelectBrief: (opp: Opportunity) => void;
  onDownloadPdf: (oppId: string) => void;
  stagedOpportunityId?: string | null;
  onClearStagedOpportunity?: () => void;
}

type JourneyStage = 'brief' | 'concepts' | 'assets' | 'publish';
type PublishChannel = 'instagram' | 'facebook' | 'email';

const EMAIL_THEMES: Record<string, { label: string; primary: string; bg: string; card: string; text: string }> = {
  modern_blue: { label: 'Modern Navy', primary: '#004B93', bg: '#F0F4F8', card: '#FFFFFF', text: '#222222' },
  minimalist_dark: { label: 'Minimalist Dark', primary: '#6366F1', bg: '#0F172A', card: '#1E293B', text: '#F8FAFC' },
  emerald_clean: { label: 'Emerald Clean', primary: '#059669', bg: '#F0FDF4', card: '#FFFFFF', text: '#111827' },
  sunset_amber: { label: 'Sunset Amber', primary: '#D97706', bg: '#FFFBEB', card: '#FFFFFF', text: '#1F2937' }
};

const resolveImageSrc = (src?: string | null): string => {
  if (!src) return '';
  let cleaned = src.trim();
  while (cleaned.startsWith('data:') && cleaned.indexOf('data:', 5) !== -1) {
    const nextIdx = cleaned.indexOf('data:', 5);
    cleaned = cleaned.substring(nextIdx);
  }
  if (cleaned.startsWith('demo://')) {
    cleaned = cleaned.replace('demo://', '');
  }
  if (cleaned.startsWith('/api/v1/')) {
    const base = API_BASE.replace(/\/api\/v1\/?$/, '');
    return `${base}${cleaned}`;
  }
  if (cleaned.startsWith('data:') || cleaned.startsWith('http://') || cleaned.startsWith('https://') || cleaned.startsWith('/')) {
    return cleaned;
  }
  return `data:image/png;base64,${cleaned}`;
};

const resolvePublishImageUrl = (url?: string | null): string => {
  if (!url) return '';
  return url.trim();
};


// ==============================================================
// Live Operation & Cooking Progress Component
// ==============================================================
export type OperationStatus = 'idle' | 'running' | 'finalizing' | 'completed' | 'failed';

interface CookingBannerProps {
  title: string;
  stepMessage: string;
  stepIndex: number;
  totalSteps: number;
  stepsList: string[];
  progressPercent: number;
  accentColor?: string;
  status: OperationStatus;
  errorMessage?: string;
  onDismiss?: () => void;
  onRetry?: () => void;
}

const CookingBanner: React.FC<CookingBannerProps> = ({
  title,
  stepMessage,
  stepIndex,
  stepsList,
  progressPercent,
  accentColor = '#1A73E8',
  status,
  errorMessage,
  onDismiss,
  onRetry
}) => {
  // 1. Collapsed Completion State: Clean, unobtrusive success banner with dismiss control
  if (status === 'completed') {
    return (
      <div 
        className="animate-fade-in" 
        style={{
          background: '#F0FDF4',
          border: '1.5px solid #86EFAC',
          borderRadius: '10px',
          padding: '12px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#DCFCE7', color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>
            ✓
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#166534' }}>
              {title} Completed
            </div>
            <div style={{ fontSize: '0.78rem', color: '#15803D' }}>
              {stepMessage || 'Assets successfully synthesized, validated, and persisted.'}
            </div>
          </div>
        </div>
        {onDismiss && (
          <button 
            type="button" 
            onClick={onDismiss}
            style={{ background: 'none', border: 'none', color: '#15803D', cursor: 'pointer', fontSize: '16px', padding: '4px', lineHeight: 1 }}
            title="Dismiss notification"
          >
            ✕
          </button>
        )}
      </div>
    );
  }

  // 2. Failure State: Non-blocking error explanation with retry option
  if (status === 'failed') {
    return (
      <div 
        className="animate-fade-in" 
        style={{
          background: '#FEF2F2',
          border: '1.5px solid #FCA5A5',
          borderRadius: '10px',
          padding: '14px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <IconAlertTriangle size={20} color="#DC2626" />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#991B1B' }}>
              {title} Failed
            </div>
            <div style={{ fontSize: '0.78rem', color: '#B91C1C' }}>
              {errorMessage || stepMessage || 'An unexpected error occurred during synthesis.'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {onRetry && (
            <button
              type="button"
              className="btn-primary"
              style={{ padding: '6px 14px', fontSize: '0.78rem' }}
              onClick={onRetry}
            >
              Retry
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', fontSize: '16px', padding: '4px' }}
            >
              ✕
            </button>
          )}
        </div>
      </div>
    );
  }

  // 3. Active Running / Finalizing State
  const isFinalizing = status === 'finalizing';
  const effectiveProgress = isFinalizing ? 92 : Math.min(85, progressPercent);

  return (
    <div className="cooking-banner animate-fade-in" style={{ borderColor: isFinalizing ? '#0284C7' : accentColor }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="pulsing-cook-dot" style={{ background: isFinalizing ? '#0284C7' : accentColor }} />
          <h4 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {title}
          </h4>
          <span className={`badge ${isFinalizing ? 'badge-blue' : 'badge-cyan'}`} style={{ fontSize: '0.72rem' }}>
            {isFinalizing ? 'Finalizing' : 'In Progress'}
          </span>
        </div>
        <div style={{ fontSize: '0.86rem', fontWeight: 700, color: isFinalizing ? '#0284C7' : accentColor }}>
          {effectiveProgress}%
        </div>
      </div>

      {/* Progress Track */}
      <div style={{ width: '100%', height: '6px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden', marginBottom: '12px' }}>
        <div 
          style={{ 
            height: '100%', 
            width: `${effectiveProgress}%`, 
            background: isFinalizing ? 'linear-gradient(90deg, #1A73E8, #0284C7)' : `linear-gradient(90deg, ${accentColor}, #0F9D9A)`, 
            borderRadius: '3px', 
            transition: 'width 0.4s ease' 
          }} 
        />
      </div>

      {/* Active Step Message */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#F8FAFC', padding: '8px 12px', borderRadius: '6px', border: '1px solid #E2E8F0', marginBottom: '10px' }}>
        <IconSparkles size={15} color={isFinalizing ? '#0284C7' : accentColor} />
        <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          {stepMessage}
        </span>
      </div>

      {/* Compact Checklist: Highlight ONLY the currently executing step */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {stepsList.map((step, idx) => {
          const isDone = idx < stepIndex;
          const isCurrent = idx === stepIndex;
          return (
            <div 
              key={idx} 
              style={{
                fontSize: '0.72rem',
                padding: '3px 8px',
                borderRadius: '4px',
                background: isDone ? '#F0FDF4' : isCurrent ? '#EFF6FF' : '#F8FAFC',
                color: isDone ? '#15803D' : isCurrent ? '#1D4ED8' : '#94A3B8',
                fontWeight: isCurrent ? 700 : 500,
                border: isCurrent ? '1px solid #93C5FD' : isDone ? '1px solid #BBF7D0' : '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s ease'
              }}
            >
              <span>{isDone ? '✓' : isCurrent ? '●' : '○'}</span>
              <span>{step}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ContentStudioPage: React.FC<ContentStudioPageProps> = ({
  opportunities,
  onSelectBrief,
  onDownloadPdf,
  stagedOpportunityId,
  onClearStagedOpportunity
}) => {
  // -------------------------------------------------------------
  // Content Supply Chain Journey State
  // -------------------------------------------------------------
  const [currentStage, setCurrentStage] = useState<JourneyStage>('brief');
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // -------------------------------------------------------------
  // Campaign Persistence & Multi-Draft State
  // -------------------------------------------------------------
  const [campaignId, setCampaignId] = useState<string>('');
  const [campaignTitle, setCampaignTitle] = useState<string>('Untitled Campaign');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [savedDraftsList, setSavedDraftsList] = useState<CampaignDraftSummary[]>([]);
  const [showCampaignSwitcher, setShowCampaignSwitcher] = useState<boolean>(false);
  const campaignTriggerRef = useRef<HTMLButtonElement | null>(null);
  const campaignMenuRef = useRef<HTMLDivElement | null>(null);
  const [campaignDropdownPos, setCampaignDropdownPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  }>({ top: 0, left: 0, width: 340, maxHeight: 320 });

  const isInitialDraftLoadedRef = useRef<boolean>(false);
  const isRestoringDraftRef = useRef<boolean>(false);
  const currentCampaignIdRef = useRef<string>('');

  // Stage 1: Campaign Profile & Brief Ingestion State (3 Clear Paths)
  const [entryMode, setEntryMode] = useState<'opportunity' | 'upload' | 'manual'>('opportunity');
  const [activeOpportunity, setActiveOpportunity] = useState<Opportunity | null>(null);
  const [showOppPicker, setShowOppPicker] = useState<boolean>(false);
  const [oppSearchQuery, setOppSearchQuery] = useState<string>('');
  const [oppFilter, setOppFilter] = useState<'all' | 'staged' | 'high_score'>('all');
  const [oppNotFoundError, setOppNotFoundError] = useState<boolean>(false);
  const expectedOppIdRef = useRef<string | null>(null);

  // Manual Brief Inputs
  const [manualTopic, setManualTopic] = useState<string>('');
  const [manualObjective, setManualObjective] = useState<string>('');
  const [manualNotes, setManualNotes] = useState<string>('');

  // Brief Document Upload State
  const [briefText, setBriefText] = useState<string>('');
  const [briefFileBase64, setBriefFileBase64] = useState<string | null>(null);
  const [briefFileName, setBriefFileName] = useState<string | null>(null);
  const [briefFileSize, setBriefFileSize] = useState<number | null>(null);
  const [briefFileMime, setBriefFileMime] = useState<string>('application/pdf');
  const [briefUploadError, setBriefUploadError] = useState<string | null>(null);

  // Campaign Settings & Visual Configuration
  const [isSettingsExpanded, setIsSettingsExpanded] = useState<boolean>(false);
  const [numAssetsConfig, setNumAssetsConfig] = useState<number>(4); // Default 4 images & 4 recommended
  const [campaignGoal, setCampaignGoal] = useState<string>('engagement');
  const [brandTone, setBrandTone] = useState<string>('authoritative');
  const [targetAudienceInput, setTargetAudienceInput] = useState<string>('');

  // Stage 2: Content Concepts State & Inspection
  const [isGeneratingConcepts, setIsGeneratingConcepts] = useState<boolean>(false);
  const [conceptsData, setConceptsData] = useState<GenerateExperimentsResponse | null>(null);
  const [activeConcept, setActiveConcept] = useState<ContentExperimentVariant | null>(null);
  const [inspectingConcept, setInspectingConcept] = useState<ContentExperimentVariant | null>(null);
  const [conceptChangePending, setConceptChangePending] = useState<ContentExperimentVariant | null>(null);
  const artworkConceptIdRef = useRef<string | null>(null);
  const artworkConceptTitleRef = useRef<string | null>(null);

  // Stage 3: Visual Asset Synthesis (Images & Google Veo Videos)
  const [mediaMode, setMediaMode] = useState<'image' | 'video'>('image');
  const [isGeneratingImages, setIsGeneratingImages] = useState<boolean>(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImageItem[]>([]);
  const [imagePrompt, setImagePrompt] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<string>('1:1');
  const [stylePreset, setStylePreset] = useState<string>('photorealistic');
  const [numImagesToGenerate, setNumImagesToGenerate] = useState<number>(4); // Default 4
  const [heroAsset, setHeroAsset] = useState<{
    url: string;
    base64?: string;
    title?: string;
    media_type?: 'image' | 'video';
    duration_seconds?: number;
    aspect_ratio?: string;
    is_retouched?: boolean;
    retouch_prompt?: string;
    original_url?: string;
    original_base64?: string;
  } | null>(null);
  const [heroAssetLoadFailed, setHeroAssetLoadFailed] = useState<boolean>(false);

  // Studio Health & Generation Engine Configuration
  const [studioHealth, setStudioHealth] = useState<{
    has_gemini_key: boolean;
    models?: {
      text?: string;
      image_generation?: string;
      image_editing?: string;
      video_generation?: string;
    };
  } | null>(null);

  // Google Veo Video Generation State
  const [isGeneratingVideo, setIsGeneratingVideo] = useState<boolean>(false);
  const [generatedVideos, setGeneratedVideos] = useState<GenerateVideoResponse[]>([]);
  const [videoPrompt, setVideoPrompt] = useState<string>('');
  const [videoAspectRatio, setVideoAspectRatio] = useState<string>('16:9');
  const [videoDuration, setVideoDuration] = useState<number>(6);
  const [videoFps, setVideoFps] = useState<number>(24);
  const [startingImageForVideo, setStartingImageForVideo] = useState<GeneratedImageItem | null>(null);

  // Optional Aid: Recommended References from Google Search
  const [isCuratingAssets, setIsCuratingAssets] = useState<boolean>(false);
  const [curatedAssets, setCuratedAssets] = useState<RecommendedImageItem[]>([]);
  const [searchQueryInput, setSearchQueryInput] = useState<string>('');
  const [selectedReferenceAsset, setSelectedReferenceAsset] = useState<RecommendedImageItem | null>(null);
  const [brokenImageIds, setBrokenImageIds] = useState<Record<string, boolean>>({});
  const [curationError, setCurationError] = useState<string | null>(null);
  const [curationProviderDisplay, setCurationProviderDisplay] = useState<string | null>(null);
  const [curationLastQuery, setCurationLastQuery] = useState<string | null>(null);
  const referenceFileInputRef = useRef<HTMLInputElement>(null);

  // Stage 3 Sub-Action: Natural Language Retouch / Edit
  const [isRetouchOpen, setIsRetouchOpen] = useState<boolean>(false);
  const [editorPrompt, setEditorPrompt] = useState<string>('');
  const [editorMode, setEditorMode] = useState<'replace_background' | 'modify_object' | 'style_transfer'>('replace_background');
  const [isEditingAsset, setIsEditingAsset] = useState<boolean>(false);

  // Stage 4: Launch Room & Publisher State
  const [publishChannel, setPublishChannel] = useState<PublishChannel>('instagram');
  const [publishingStatus, setPublishingStatus] = useState<PublishingStatusResponse | null>(null);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [publishHistory, setPublishHistory] = useState<Array<{ platform: string; id: string; url?: string; timestamp: string; title: string }>>([]);

  // In-Place Credential Overrides on UI
  const [showCredentialsPanel, setShowCredentialsPanel] = useState<boolean>(false);
  const [igUserId, setIgUserId] = useState<string>('');
  const [igAccessToken, setIgAccessToken] = useState<string>('');
  const [fbPageId, setFbPageId] = useState<string>('');
  const [fbAccessToken, setFbAccessToken] = useState<string>('');
  const [emailDeliveryMode, setEmailDeliveryMode] = useState<'sendgrid' | 'smtp'>('sendgrid');
  const [sendgridApiKey, setSendgridApiKey] = useState<string>('');
  const [fromEmail, setFromEmail] = useState<string>('campaigns@trendcontenter.com');
  const [smtpHost, setSmtpHost] = useState<string>('smtp.sendgrid.net');
  const [smtpPort, setSmtpPort] = useState<number>(587);
  const [smtpUsername, setSmtpUsername] = useState<string>('apikey');
  const [smtpPassword, setSmtpPassword] = useState<string>('');

  // Copy Editors for Platforms
  const [instagramCaption, setInstagramCaption] = useState<string>('');
  const [igTargetFormat, setIgTargetFormat] = useState<'POST' | 'REEL' | 'STORY'>('POST');
  const [igStoryMediaType, setIgStoryMediaType] = useState<'IMAGE' | 'VIDEO'>('IMAGE');
  const [igShareToFeed, setIgShareToFeed] = useState<boolean>(true);
  const [customVideoUrl, setCustomVideoUrl] = useState<string>('');
  const [facebookPostCopy, setFacebookPostCopy] = useState<string>('');
  const [fbTargetFormat, setFbTargetFormat] = useState<'POST' | 'REEL'>('POST');
  const [fbPostMediaType, setFbPostMediaType] = useState<'IMAGE' | 'VIDEO'>('IMAGE');
  const [fbVideoTitle, setFbVideoTitle] = useState<string>('');
  const [fbCustomVideoUrl, setFbCustomVideoUrl] = useState<string>('');
  
  // Configurable Email Studio State
  const [emailRecipients, setEmailRecipients] = useState<string>('team@company.com');
  const [emailSubject, setEmailSubject] = useState<string>('');
  const [emailHeadline, setEmailHeadline] = useState<string>('');
  const [emailBody, setEmailBody] = useState<string>('');
  const [emailTheme, setEmailTheme] = useState<string>('modern_blue');
  const [emailBrandHeading, setEmailBrandHeading] = useState<string>('TREND CONTENT');
  const [emailBrandSubtitle, setEmailBrandSubtitle] = useState<string>('Campaign Intelligence Notification');
  const [emailAccentColor, setEmailAccentColor] = useState<string>('#004B93');
  const [emailIncludeHeroImage, setEmailIncludeHeroImage] = useState<boolean>(true);
  const [emailPrimaryCtaText, setEmailPrimaryCtaText] = useState<string>('Explore Campaign');
  const [emailPrimaryCtaUrl, setEmailPrimaryCtaUrl] = useState<string>('https://trendcontenter.com/');
  const [emailSecondaryBtnText, setEmailSecondaryBtnText] = useState<string>('');
  const [emailSecondaryBtnUrl, setEmailSecondaryBtnUrl] = useState<string>('');
  const [emailFooterText, setEmailFooterText] = useState<string>('You are receiving this intelligence campaign update from Trend Contenter.');
  const [emailPreviewMode, setEmailPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

  // Dynamic "Things Cooking" Experience State
  const [cookingState, setCookingState] = useState<{
    isCooking: boolean;
    status: OperationStatus;
    stageName: string;
    stepMessage: string;
    stepIndex: number;
    totalSteps: number;
    stepsList: string[];
    progressPercent: number;
    accentColor: string;
    errorMessage?: string;
  }>({
    isCooking: false,
    status: 'idle',
    stageName: '',
    stepMessage: '',
    stepIndex: 0,
    totalSteps: 0,
    stepsList: [],
    progressPercent: 0,
    accentColor: '#1A73E8',
    errorMessage: undefined
  });

  const cookingIntervalRef = useRef<any>(null);

  const startCooking = (stageName: string, stepsList: string[], accentColor: string = '#1A73E8') => {
    if (cookingIntervalRef.current) clearInterval(cookingIntervalRef.current);
    
    let currentStep = 0;
    setCookingState({
      isCooking: true,
      status: 'running',
      stageName,
      stepMessage: stepsList[0] || 'Cooking campaign assets...',
      stepIndex: 0,
      totalSteps: stepsList.length,
      stepsList,
      progressPercent: 15,
      accentColor,
      errorMessage: undefined
    });

    cookingIntervalRef.current = setInterval(() => {
      currentStep++;
      if (currentStep < stepsList.length - 1) {
        const pct = Math.round(20 + (currentStep / Math.max(1, stepsList.length - 1)) * 60);
        setCookingState(prev => {
          if (prev.status !== 'running') return prev;
          return {
            ...prev,
            stepIndex: currentStep,
            stepMessage: stepsList[currentStep] || prev.stepMessage,
            progressPercent: Math.min(80, pct)
          };
        });
      } else {
        // While waiting for network response, progress slowly advances up to at most 85%
        setCookingState(prev => {
          if (prev.status !== 'running') return prev;
          const nextPct = prev.progressPercent < 85 ? prev.progressPercent + 1 : 85;
          return {
            ...prev,
            progressPercent: nextPct
          };
        });
      }
    }, 1600);
  };

  const setOperationFinalizing = (msg?: string) => {
    if (cookingIntervalRef.current) {
      clearInterval(cookingIntervalRef.current);
      cookingIntervalRef.current = null;
    }
    setCookingState(prev => ({
      ...prev,
      status: 'finalizing',
      stepIndex: Math.max(0, prev.stepsList.length - 1),
      stepMessage: msg || prev.stepsList[prev.stepsList.length - 1] || 'Validating and saving assets...',
      progressPercent: 92
    }));
  };

  const completeCooking = (finalMsg?: string) => {
    if (cookingIntervalRef.current) {
      clearInterval(cookingIntervalRef.current);
      cookingIntervalRef.current = null;
    }
    setCookingState(prev => ({
      ...prev,
      isCooking: false,
      status: 'completed',
      progressPercent: 100,
      stepIndex: prev.stepsList.length,
      stepMessage: finalMsg || 'Operation completed successfully!'
    }));
  };

  const failCooking = (errorMsg?: string) => {
    if (cookingIntervalRef.current) {
      clearInterval(cookingIntervalRef.current);
      cookingIntervalRef.current = null;
    }
    setCookingState(prev => ({
      ...prev,
      isCooking: false,
      status: 'failed',
      errorMessage: errorMsg || 'Operation failed'
    }));
  };

  const dismissCookingBanner = () => {
    setCookingState(prev => ({
      ...prev,
      isCooking: false,
      status: 'idle',
      progressPercent: 0,
      errorMessage: undefined
    }));
  };

  useEffect(() => {
    return () => {
      if (cookingIntervalRef.current) clearInterval(cookingIntervalRef.current);
    };
  }, []);

  // Keyboard accessibility: Escape key to dismiss modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inspectingConcept) setInspectingConcept(null);
        if (conceptChangePending) setConceptChangePending(null);
        if (showCampaignSwitcher) setShowCampaignSwitcher(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectingConcept, conceptChangePending, showCampaignSwitcher]);

  // Dynamic campaign selector dropdown positioning and outside-click handling
  const updateCampaignDropdownPosition = useCallback(() => {
    if (!campaignTriggerRef.current) return;
    const rect = campaignTriggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Detect persistent sidebar right edge if mounted to avoid overlapping
    const sidebarEl = document.querySelector('.app-sidebar');
    const sidebarRight = sidebarEl ? sidebarEl.getBoundingClientRect().right : 0;
    const minLeft = Math.max(16, sidebarRight + 12);

    const desiredWidth = 340;
    const availableWidth = Math.max(260, viewportWidth - minLeft - 16);
    const width = Math.min(desiredWidth, availableWidth);

    // Right-align menu to trigger button by default
    let left = rect.right - width;

    // Prevent extending underneath the sidebar or past left viewport margin
    if (left < minLeft) {
      left = minLeft;
    }

    // Prevent extending past right viewport margin
    if (left + width > viewportWidth - 16) {
      left = Math.max(minLeft, viewportWidth - 16 - width);
    }

    // Vertical positioning: default below trigger; flip above if space below is cramped
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    let top = rect.bottom + 6;
    let maxHeight = 340;

    if (spaceBelow < 220 && spaceAbove > spaceBelow) {
      top = Math.max(16, rect.top - 6 - Math.min(340, spaceAbove - 24));
      maxHeight = Math.min(340, spaceAbove - 32);
    } else {
      maxHeight = Math.min(340, spaceBelow - 24);
    }

    setCampaignDropdownPos({
      top,
      left,
      width,
      maxHeight: Math.max(180, maxHeight)
    });
  }, []);

  useEffect(() => {
    if (!showCampaignSwitcher) return;
    updateCampaignDropdownPosition();

    const handleScrollOrResize = () => {
      updateCampaignDropdownPosition();
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        campaignMenuRef.current &&
        !campaignMenuRef.current.contains(e.target as Node) &&
        campaignTriggerRef.current &&
        !campaignTriggerRef.current.contains(e.target as Node)
      ) {
        setShowCampaignSwitcher(false);
      }
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCampaignSwitcher, updateCampaignDropdownPosition]);

  // Helpers
  const notify = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const copyToClipboard = (text: string, label: string = 'Content') => {
    navigator.clipboard.writeText(text);
    notify(`${label} copied to clipboard!`, 'success');
  };

  // Fetch Publishing Configuration Status
  const fetchPublishingStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/content-studio/publish/status`);
      if (res.ok) {
        const data: PublishingStatusResponse = await res.json();
        setPublishingStatus(data);
      }
    } catch (err) {
      console.warn('Could not fetch publishing status:', err);
    }
  };

  const fetchStudioHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/content-studio/health`);
      if (res.ok) {
        const data = await res.json();
        setStudioHealth(data);
      }
    } catch (err) {
      console.warn('Could not fetch studio health:', err);
    }
  };

  useEffect(() => {
    fetchPublishingStatus();
    fetchStudioHealth();
  }, []);

  useEffect(() => {
    setHeroAssetLoadFailed(false);
  }, [heroAsset?.url]);

  // -------------------------------------------------------------
  // Safe Stage Resolution (Prerequisite Validation)
  // -------------------------------------------------------------
  const resolveSafeStage = (
    desiredStage: JourneyStage,
    concepts: any,
    concept: any,
    artwork: any
  ): JourneyStage => {
    if (desiredStage === 'publish') {
      if (artwork && (artwork.url || artwork.base64) && !heroAssetLoadFailed) return 'publish';
      if (concept) return 'assets';
      if (concepts) return 'concepts';
      return 'brief';
    }
    if (desiredStage === 'assets') {
      if (concept) return 'assets';
      if (concepts) return 'concepts';
      return 'brief';
    }
    if (desiredStage === 'concepts') {
      if (concepts) return 'concepts';
      return 'brief';
    }
    return 'brief';
  };

  // -------------------------------------------------------------
  // Draft Restoration & State Mapping
  // -------------------------------------------------------------
  const applyDraftToState = (draft: CampaignDraft) => {
    isRestoringDraftRef.current = true;
    try {
      setCampaignId(draft.campaign_id);
      currentCampaignIdRef.current = draft.campaign_id;
      setCampaignTitle(draft.title || 'Untitled Campaign');

      // Opportunity restoration
      if (draft.opportunity_id) {
        expectedOppIdRef.current = draft.opportunity_id;
        const foundOpp = opportunities.find(o => o.opportunity_id === draft.opportunity_id);
        if (foundOpp) {
          setActiveOpportunity(foundOpp);
          setOppNotFoundError(false);
        } else if (opportunities.length > 0) {
          setOppNotFoundError(true);
        }
      } else {
        expectedOppIdRef.current = null;
        setActiveOpportunity(null);
        setOppNotFoundError(false);
      }

      // Brief Ingestion Restoration
      if (draft.brief_data) {
        if (draft.brief_data.entryMode) {
          setEntryMode(draft.brief_data.entryMode);
        } else if (draft.opportunity_id) {
          setEntryMode('opportunity');
        } else if (draft.brief_data.briefFileName) {
          setEntryMode('upload');
        } else if (draft.brief_data.briefText) {
          setEntryMode('manual');
        } else {
          setEntryMode('opportunity');
        }

        if (draft.brief_data.briefText !== undefined) setBriefText(draft.brief_data.briefText);
        if (draft.brief_data.briefFileName !== undefined) setBriefFileName(draft.brief_data.briefFileName);
        if (draft.brief_data.briefFileMime !== undefined) setBriefFileMime(draft.brief_data.briefFileMime);
        if (draft.brief_data.briefFileSize !== undefined) setBriefFileSize(draft.brief_data.briefFileSize);
        if (draft.brief_data.manualObjective !== undefined) setManualObjective(draft.brief_data.manualObjective);
        if (draft.brief_data.manualNotes !== undefined) setManualNotes(draft.brief_data.manualNotes);
        if (draft.title && draft.title !== 'Untitled Campaign' && draft.title !== 'New Campaign') {
          setManualTopic(draft.title);
        }
        if (draft.brief_data.numAssetsConfig !== undefined) setNumAssetsConfig(draft.brief_data.numAssetsConfig);
        if (draft.brief_data.campaignGoal !== undefined) setCampaignGoal(draft.brief_data.campaignGoal);
        if (draft.brief_data.brandTone !== undefined) setBrandTone(draft.brief_data.brandTone);
        if (draft.brief_data.targetAudienceInput !== undefined) setTargetAudienceInput(draft.brief_data.targetAudienceInput);
      }

      // Concepts
      if (draft.concepts_data) {
        setConceptsData(draft.concepts_data);
      } else {
        setConceptsData(null);
      }
      let selectedConcept: ContentExperimentVariant | null = null;
      if (draft.active_concept) {
        selectedConcept = draft.active_concept;
        setActiveConcept(draft.active_concept);
      } else if (draft.concepts_data && draft.concepts_data.variants && draft.concepts_data.variants.length > 0) {
        selectedConcept = draft.concepts_data.variants[0];
        setActiveConcept(draft.concepts_data.variants[0]);
      } else {
        setActiveConcept(null);
      }

      // Artwork & Prompts
      if (draft.artwork_data) {
        artworkConceptIdRef.current = draft.artwork_data.concept_id || (selectedConcept ? selectedConcept.id : null);
        artworkConceptTitleRef.current = draft.artwork_data.concept_title || (selectedConcept ? selectedConcept.title : null);

        if (selectedConcept && draft.artwork_data.concept_id && draft.artwork_data.concept_id !== selectedConcept.id) {
          setImagePrompt(selectedConcept.visual_direction || selectedConcept.search_query || '');
          setVideoPrompt(selectedConcept.veo_motion_prompt || selectedConcept.visual_direction || '');
          setGeneratedImages([]);
          setGeneratedVideos([]);
        } else {
          if (draft.artwork_data.imagePrompt !== undefined) {
            setImagePrompt(draft.artwork_data.imagePrompt);
          } else if (selectedConcept) {
            setImagePrompt(selectedConcept.visual_direction || selectedConcept.search_query || '');
          }

          if (draft.artwork_data.videoPrompt !== undefined) {
            setVideoPrompt(draft.artwork_data.videoPrompt);
          } else if (selectedConcept) {
            setVideoPrompt(selectedConcept.veo_motion_prompt || selectedConcept.visual_direction || '');
          }

          if (draft.artwork_data.generatedImages) setGeneratedImages(draft.artwork_data.generatedImages);
          if (draft.artwork_data.generatedVideos) {
            // Requirement: video generation should only return 1 video. Not more than that.
            setGeneratedVideos(draft.artwork_data.generatedVideos.slice(0, 1));
          }
        }

        if (draft.artwork_data.aspectRatio !== undefined) setAspectRatio(draft.artwork_data.aspectRatio);
        if (draft.artwork_data.stylePreset !== undefined) setStylePreset(draft.artwork_data.stylePreset);
        if (draft.artwork_data.numImagesToGenerate !== undefined) setNumImagesToGenerate(draft.artwork_data.numImagesToGenerate);
        if (draft.artwork_data.mediaMode !== undefined) setMediaMode(draft.artwork_data.mediaMode);
        if (draft.artwork_data.videoAspectRatio !== undefined) setVideoAspectRatio(draft.artwork_data.videoAspectRatio);
        if (draft.artwork_data.videoDuration !== undefined) setVideoDuration(draft.artwork_data.videoDuration);
        if (draft.artwork_data.videoFps !== undefined) setVideoFps(draft.artwork_data.videoFps);
      } else {
        artworkConceptIdRef.current = selectedConcept?.id || null;
        artworkConceptTitleRef.current = selectedConcept?.title || null;
        setGeneratedImages([]);
        setGeneratedVideos([]);
        setImagePrompt(selectedConcept?.visual_direction || selectedConcept?.search_query || '');
        setVideoPrompt(selectedConcept?.veo_motion_prompt || selectedConcept?.visual_direction || '');
        setStartingImageForVideo(null);
        setMediaMode('image');
      }
      if (draft.active_artwork) {
        setHeroAsset(draft.active_artwork);
      } else {
        setHeroAsset(null);
      }

      // Curated references
      if (draft.curated_assets) setCuratedAssets(draft.curated_assets);
      if (draft.selected_reference) setSelectedReferenceAsset(draft.selected_reference);

      // Copy
      if (draft.copy_data) {
        if (draft.copy_data.instagramCaption !== undefined) setInstagramCaption(draft.copy_data.instagramCaption);
        if (draft.copy_data.facebookPostCopy !== undefined) setFacebookPostCopy(draft.copy_data.facebookPostCopy);
      }

      // Email Studio
      if (draft.email_data) {
        if (draft.email_data.emailRecipients !== undefined) setEmailRecipients(draft.email_data.emailRecipients);
        if (draft.email_data.emailSubject !== undefined) setEmailSubject(draft.email_data.emailSubject);
        if (draft.email_data.emailHeadline !== undefined) setEmailHeadline(draft.email_data.emailHeadline);
        if (draft.email_data.emailBody !== undefined) setEmailBody(draft.email_data.emailBody);
        if (draft.email_data.emailTheme !== undefined) setEmailTheme(draft.email_data.emailTheme);
        if (draft.email_data.emailBrandHeading !== undefined) setEmailBrandHeading(draft.email_data.emailBrandHeading);
        if (draft.email_data.emailBrandSubtitle !== undefined) setEmailBrandSubtitle(draft.email_data.emailBrandSubtitle);
        if (draft.email_data.emailAccentColor !== undefined) setEmailAccentColor(draft.email_data.emailAccentColor);
        if (draft.email_data.emailIncludeHeroImage !== undefined) setEmailIncludeHeroImage(draft.email_data.emailIncludeHeroImage);
        if (draft.email_data.emailPrimaryCtaText !== undefined) setEmailPrimaryCtaText(draft.email_data.emailPrimaryCtaText);
        if (draft.email_data.emailPrimaryCtaUrl !== undefined) setEmailPrimaryCtaUrl(draft.email_data.emailPrimaryCtaUrl);
        if (draft.email_data.emailSecondaryBtnText !== undefined) setEmailSecondaryBtnText(draft.email_data.emailSecondaryBtnText);
        if (draft.email_data.emailSecondaryBtnUrl !== undefined) setEmailSecondaryBtnUrl(draft.email_data.emailSecondaryBtnUrl);
        if (draft.email_data.emailFooterText !== undefined) setEmailFooterText(draft.email_data.emailFooterText);
      }

      // Publish Channel & Settings (excluding secrets)
      if (draft.publish_data) {
        if (draft.publish_data.publishChannel) setPublishChannel(draft.publish_data.publishChannel as PublishChannel);
        if (draft.publish_data.fromEmail) setFromEmail(draft.publish_data.fromEmail);
        if (draft.publish_data.emailDeliveryMode) setEmailDeliveryMode(draft.publish_data.emailDeliveryMode);
        if (draft.publish_data.smtpHost) setSmtpHost(draft.publish_data.smtpHost);
        if (draft.publish_data.smtpPort) setSmtpPort(draft.publish_data.smtpPort);
        if (draft.publish_data.smtpUsername) setSmtpUsername(draft.publish_data.smtpUsername);
      }

      // Prerequisite validation before setting stage
      const safeStage = resolveSafeStage(
        (draft.current_stage as JourneyStage) || 'brief',
        draft.concepts_data,
        draft.active_concept,
        draft.active_artwork
      );
      setCurrentStage(safeStage);
    } finally {
      setTimeout(() => {
        isRestoringDraftRef.current = false;
      }, 150);
    }
  };

  // -------------------------------------------------------------
  // Draft Persistence Actions
  // -------------------------------------------------------------
  const refreshDraftsList = async () => {
    try {
      const resp = await campaignDraftStore.listDrafts();
      if (resp && Array.isArray(resp)) {
        setSavedDraftsList(resp);
      }
    } catch (err) {
      console.warn('Failed to refresh drafts list:', err);
    }
  };

  const handleStartNewCampaign = async () => {
    await campaignDraftStore.flushSave();
    const newId = `camp_custom_${Date.now()}`;
    expectedOppIdRef.current = null;
    setActiveOpportunity(null);
    setOppNotFoundError(false);
    setShowOppPicker(false);
    setEntryMode('opportunity');
    setBriefText('');
    setBriefFileBase64(null);
    setBriefFileName(null);
    setBriefFileSize(null);
    setBriefUploadError(null);
    setManualTopic('');
    setManualObjective('');
    setManualNotes('');
    artworkConceptIdRef.current = null;
    artworkConceptTitleRef.current = null;
    setConceptsData(null);
    setActiveConcept(null);
    setInspectingConcept(null);
    setConceptChangePending(null);
    setMediaMode('image');
    setGeneratedVideos([]);
    setVideoPrompt('');
    setStartingImageForVideo(null);
    const newDraft: CampaignDraft = {
      campaign_id: newId,
      opportunity_id: null,
      title: 'New Campaign',
      current_stage: 'brief',
      brief_data: {
        entryMode: 'opportunity',
        briefText: '',
        numAssetsConfig: 4,
        campaignGoal: 'engagement',
        brandTone: 'authoritative',
        targetAudienceInput: ''
      },
      artwork_data: {
        aspectRatio: '1:1',
        stylePreset: 'photorealistic',
        numImagesToGenerate: 4,
        generatedImages: []
      },
      active_artwork: null,
      curated_assets: [],
      publish_data: {
        publishChannel: 'instagram'
      }
    };
    applyDraftToState(newDraft);
    campaignDraftStore.saveDraft(newDraft, 0);
    refreshDraftsList();
    notify('Started new campaign draft', 'success');
  };

  const handleSelectCampaign = async (selectedId: string) => {
    if (selectedId === campaignId) {
      setShowCampaignSwitcher(false);
      return;
    }
    await campaignDraftStore.flushSave();
    const loaded = await campaignDraftStore.loadDraft(selectedId);
    if (loaded) {
      applyDraftToState(loaded);
      notify(`Loaded campaign: ${loaded.title}`, 'success');
    }
    setShowCampaignSwitcher(false);
  };

  const handleDeleteCampaign = async (targetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this campaign draft?')) return;
    await campaignDraftStore.deleteDraft(targetId);
    refreshDraftsList();
    if (targetId === campaignId) {
      const remaining = savedDraftsList.filter(d => d.campaign_id !== targetId);
      if (remaining.length > 0) {
        handleSelectCampaign(remaining[0].campaign_id);
      } else {
        handleStartNewCampaign();
      }
    }
    notify('Campaign draft deleted', 'info');
  };

  const handleSwitchToOpportunity = async (opp: Opportunity) => {
    expectedOppIdRef.current = opp.opportunity_id;
    setActiveOpportunity(opp);
    setOppNotFoundError(false);
    setShowOppPicker(false);
    setEntryMode('opportunity');

    const targetCampId = `camp_${opp.opportunity_id}`;
    if (targetCampId === campaignId) {
      return;
    }
    await campaignDraftStore.flushSave();
    const existing = await campaignDraftStore.loadDraft(targetCampId);
    if (existing) {
      applyDraftToState(existing);
      setActiveOpportunity(opp);
    } else {
      const newDraft: CampaignDraft = {
        campaign_id: targetCampId,
        opportunity_id: opp.opportunity_id,
        title: opp.title,
        current_stage: 'brief',
        brief_data: {
          entryMode: 'opportunity',
          briefText: `Campaign Opportunity: ${opp.title}\n` +
            `Target Audience: ${opp.audience_label || 'Target Demographic'}\n` +
            `Content Void / Gap: ${opp.content_gap || ''}\n` +
            `Recommended Angle: ${opp.recommended_angle || ''}`,
          targetAudienceInput: opp.audience_label || '',
          numAssetsConfig: 4,
          campaignGoal: 'engagement',
          brandTone: 'authoritative'
        },
        artwork_data: {
          aspectRatio: '1:1',
          stylePreset: 'photorealistic',
          numImagesToGenerate: 4,
          generatedImages: []
        },
        active_artwork: null,
        curated_assets: [],
        publish_data: {
          publishChannel: 'instagram'
        }
      };
      setActiveOpportunity(opp);
      applyDraftToState(newDraft);
      campaignDraftStore.saveDraft(newDraft, 0);
    }
    notify(`Switched to campaign: ${opp.title}`, 'info');
  };

  // Subscribe to autosave status updates
  useEffect(() => {
    const unsub = campaignDraftStore.subscribeStatus((status, time) => {
      setSaveStatus(status);
      if (time) setLastSavedAt(time);
    });
    return unsub;
  }, []);

  // Initial draft load on mount
  useEffect(() => {
    const initDraft = async () => {
      if (isInitialDraftLoadedRef.current) return;

      if (stagedOpportunityId) {
        isInitialDraftLoadedRef.current = true;
        return;
      }

      const activeId = campaignDraftStore.getActiveCampaignId();
      let draftToLoad: CampaignDraft | null = null;

      if (activeId) {
        draftToLoad = await campaignDraftStore.loadDraft(activeId);
      }
      if (!draftToLoad) {
        draftToLoad = await campaignDraftStore.loadLatestDraft();
      }

      if (draftToLoad) {
        applyDraftToState(draftToLoad);
      } else {
        // Do not arbitrarily choose an opportunity when starting fresh without a staged item
        const initialId = `camp_custom_${Date.now()}`;
        const freshDraft: CampaignDraft = {
          campaign_id: initialId,
          opportunity_id: null,
          title: 'New Campaign',
          current_stage: 'brief',
          brief_data: {
            entryMode: 'opportunity',
            briefText: '',
            targetAudienceInput: '',
            numAssetsConfig: 4,
            campaignGoal: 'engagement',
            brandTone: 'authoritative'
          },
          artwork_data: {
            aspectRatio: '1:1',
            stylePreset: 'photorealistic',
            numImagesToGenerate: 4,
            generatedImages: []
          },
          active_artwork: null,
          curated_assets: [],
          publish_data: {
            publishChannel: 'instagram'
          }
        };
        setActiveOpportunity(null);
        applyDraftToState(freshDraft);
        campaignDraftStore.saveDraft(freshDraft, 500);
      }

      isInitialDraftLoadedRef.current = true;
      refreshDraftsList();
    };

    initDraft();
  }, []);

  // React to staged opportunity from Audience & Opportunities
  useEffect(() => {
    if (!stagedOpportunityId) return;

    expectedOppIdRef.current = stagedOpportunityId;
    setEntryMode('opportunity');
    setCurrentStage('brief');
    setShowOppPicker(false);

    const targetCampaignId = `camp_${stagedOpportunityId}`;
    const matchingOpp = opportunities.find(o => o.opportunity_id === stagedOpportunityId);

    const initStaged = async () => {
      const existing = await campaignDraftStore.loadDraft(targetCampaignId);
      if (existing) {
        applyDraftToState(existing);
        if (matchingOpp) {
          setActiveOpportunity(matchingOpp);
        }
      } else {
        const oppTitle = matchingOpp ? matchingOpp.title : 'Staged Campaign';
        const newDraft: CampaignDraft = {
          campaign_id: targetCampaignId,
          opportunity_id: stagedOpportunityId,
          title: oppTitle,
          current_stage: 'brief',
          brief_data: {
            entryMode: 'opportunity',
            briefText: matchingOpp ? (
              `Campaign Opportunity: ${matchingOpp.title}\n` +
              `Target Audience: ${matchingOpp.audience_label || 'Target Demographic'}\n` +
              `Content Void / Gap: ${matchingOpp.content_gap || ''}\n` +
              `Recommended Angle: ${matchingOpp.recommended_angle || ''}`
            ) : '',
            targetAudienceInput: matchingOpp?.audience_label || '',
            numAssetsConfig: 4,
            campaignGoal: 'engagement',
            brandTone: 'authoritative'
          },
          artwork_data: {
            aspectRatio: '1:1',
            stylePreset: 'photorealistic',
            numImagesToGenerate: 4,
            generatedImages: []
          },
          active_artwork: null,
          curated_assets: [],
          publish_data: {
            publishChannel: 'instagram'
          }
        };
        if (matchingOpp) setActiveOpportunity(matchingOpp);
        applyDraftToState(newDraft);
        campaignDraftStore.saveDraft(newDraft, 0);
      }
      isInitialDraftLoadedRef.current = true;
      onClearStagedOpportunity?.();
      refreshDraftsList();
    };

    initStaged();
  }, [stagedOpportunityId, opportunities]);

  // Gracefully associate asynchronous opportunities when they arrive
  useEffect(() => {
    if (opportunities.length === 0) return;

    const targetOppId = expectedOppIdRef.current || (campaignId?.startsWith('camp_') && !campaignId.startsWith('camp_custom_') ? campaignId.replace('camp_', '') : null);

    if (targetOppId) {
      const matched = opportunities.find(o => o.opportunity_id === targetOppId);
      if (matched) {
        setActiveOpportunity(matched);
        setOppNotFoundError(false);
      } else {
        setOppNotFoundError(true);
      }
    } else if (activeOpportunity) {
      const updated = opportunities.find(o => o.opportunity_id === activeOpportunity.opportunity_id);
      if (updated) {
        setActiveOpportunity(updated);
      }
    }
  }, [opportunities, campaignId]);

  // Sync opportunity context when activeOpportunity changes
  useEffect(() => {
    if (isRestoringDraftRef.current) return;
    if (activeOpportunity) {
      setTargetAudienceInput(prev => prev || activeOpportunity.audience_label || '');
      setBriefText(prev => {
        if (!prev || prev.trim() === '') {
          return (
            `Campaign Opportunity: ${activeOpportunity.title}\n` +
            `Target Audience: ${activeOpportunity.audience_label || 'Target Demographic'}\n` +
            `Content Void / Gap: ${activeOpportunity.content_gap || ''}\n` +
            `Recommended Angle: ${activeOpportunity.recommended_angle || ''}`
          );
        }
        return prev;
      });
      setCampaignTitle(prev => (!prev || prev === 'Untitled Campaign' || prev === 'New Campaign') ? activeOpportunity.title : prev);
    }
  }, [activeOpportunity]);

  // Sync copy and prompts when activeConcept changes
  useEffect(() => {
    if (isRestoringDraftRef.current) return;
    if (activeConcept) {
      setInstagramCaption(prev => prev || activeConcept.instagram_copy);
      setFacebookPostCopy(prev => prev || activeConcept.facebook_copy);
      setEmailSubject(prev => prev || activeConcept.email_subject);
      setEmailHeadline(prev => prev || activeConcept.hook || activeConcept.title);
      setEmailBody(prev => prev || activeConcept.email_body);
      setEmailPrimaryCtaText(prev => prev || activeConcept.email_cta_text || 'Explore Campaign');
      setEmailPrimaryCtaUrl(prev => prev || activeConcept.email_cta_url || 'https://trendcontenter.com/');
      setSearchQueryInput(prev => prev || activeConcept.search_query || activeConcept.title || activeOpportunity?.title || '');
      setImagePrompt(prev => prev || activeConcept.visual_direction || activeConcept.search_query);
      setSelectedReferenceAsset(null);
    }
  }, [activeConcept]);

  // When in Stage 3, ensure reference query is populated and auto-curate if zero references exist
  useEffect(() => {
    if (currentStage === 'assets' && activeConcept) {
      const defaultQ = searchQueryInput || activeConcept.search_query || activeConcept.title || activeOpportunity?.title || '';
      if (!searchQueryInput && defaultQ) {
        setSearchQueryInput(defaultQ);
      }
      if (curatedAssets.length === 0 && !isCuratingAssets && defaultQ) {
        triggerCurateAssets(defaultQ, numAssetsConfig, {
          headline: activeConcept.title,
          topic: activeOpportunity?.title,
          visual_direction: activeConcept.visual_direction
        });
      }
    }
  }, [currentStage, activeConcept?.id]);

  // Helper to construct a canonical draft snapshot from current state and optional overrides
  const buildCampaignDraftSnapshot = (overrides?: Partial<CampaignDraft>): CampaignDraft => {
    return {
      campaign_id: campaignId || `camp_${Date.now()}`,
      opportunity_id: activeOpportunity ? activeOpportunity.opportunity_id : null,
      title: campaignTitle || (activeOpportunity ? activeOpportunity.title : 'Untitled Campaign'),
      current_stage: currentStage,
      brief_data: {
        briefText,
        briefFileName,
        briefFileMime,
        briefFileSize,
        entryMode,
        manualObjective,
        manualNotes,
        numAssetsConfig,
        campaignGoal,
        brandTone,
        targetAudienceInput
      },
      concepts_data: conceptsData,
      active_concept: activeConcept,
      artwork_data: {
        imagePrompt,
        aspectRatio,
        stylePreset,
        numImagesToGenerate,
        generatedImages,
        concept_id: artworkConceptIdRef.current,
        concept_title: artworkConceptTitleRef.current,
        mediaMode,
        generatedVideos,
        videoPrompt,
        videoAspectRatio,
        videoDuration,
        videoFps,
        ...(overrides?.artwork_data || {})
      },
      active_artwork: overrides?.active_artwork !== undefined ? overrides.active_artwork : heroAsset,
      curated_assets: curatedAssets,
      selected_reference: selectedReferenceAsset,
      copy_data: {
        instagramCaption,
        facebookPostCopy
      },
      email_data: {
        emailRecipients,
        emailSubject,
        emailHeadline,
        emailBody,
        emailTheme,
        emailBrandHeading,
        emailBrandSubtitle,
        emailAccentColor,
        emailIncludeHeroImage,
        emailPrimaryCtaText,
        emailPrimaryCtaUrl,
        emailSecondaryBtnText,
        emailSecondaryBtnUrl,
        emailFooterText
      },
      publish_data: {
        publishChannel,
        fromEmail,
        emailDeliveryMode,
        smtpHost,
        smtpPort,
        smtpUsername
      },
      ...overrides
    };
  };

  // Debounced autosave effect for all meaningful campaign state changes
  useEffect(() => {
    if (!isInitialDraftLoadedRef.current || isRestoringDraftRef.current || !campaignId) return;

    const draftSnapshot = buildCampaignDraftSnapshot();
    campaignDraftStore.saveDraft(draftSnapshot, 1200);
  }, [
    campaignId,
    campaignTitle,
    currentStage,
    activeOpportunity,
    briefText,
    briefFileName,
    briefFileMime,
    briefFileSize,
    entryMode,
    manualObjective,
    manualNotes,
    numAssetsConfig,
    campaignGoal,
    brandTone,
    targetAudienceInput,
    conceptsData,
    activeConcept,
    imagePrompt,
    aspectRatio,
    stylePreset,
    numImagesToGenerate,
    generatedImages,
    heroAsset,
    curatedAssets,
    selectedReferenceAsset,
    instagramCaption,
    facebookPostCopy,
    emailRecipients,
    emailSubject,
    emailHeadline,
    emailBody,
    emailTheme,
    emailBrandHeading,
    emailBrandSubtitle,
    emailAccentColor,
    emailIncludeHeroImage,
    emailPrimaryCtaText,
    emailPrimaryCtaUrl,
    emailSecondaryBtnText,
    emailSecondaryBtnUrl,
    emailFooterText,
    publishChannel,
    fromEmail,
    emailDeliveryMode,
    smtpHost,
    smtpPort,
    smtpUsername,
    mediaMode,
    generatedVideos,
    videoPrompt,
    videoAspectRatio,
    videoDuration,
    videoFps
  ]);

  // Handle Drag & Drop Brief File
  const handleBriefFileUpload = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const allowed = ['pdf', 'docx', 'doc', 'md', 'txt'];
    if (!allowed.includes(ext)) {
      setBriefUploadError(`Unsupported file format (.${ext}). Supported formats: PDF (.pdf), Word (.docx), Markdown (.md), and plain text (.txt).`);
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setBriefUploadError(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is 25 MB.`);
      return;
    }
    setBriefUploadError(null);

    let mime = file.type;
    if (!mime) {
      if (ext === 'pdf') mime = 'application/pdf';
      else if (ext === 'docx' || ext === 'doc') mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      else if (ext === 'md') mime = 'text/markdown';
      else mime = 'text/plain';
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(',')[1];
      setBriefFileBase64(base64);
      setBriefFileName(file.name);
      setBriefFileSize(file.size);
      setBriefFileMime(mime);
      notify(`Loaded brief document: ${file.name}`, 'success');
    };
    reader.onerror = () => {
      setBriefUploadError('Failed to read file from browser. Please try again.');
    };
    reader.readAsDataURL(file);
  };

  const handleClearBriefFile = () => {
    setBriefFileBase64(null);
    setBriefFileName(null);
    setBriefFileSize(null);
    setBriefUploadError(null);
  };

  const handleManualFieldChange = (field: 'topic' | 'objective' | 'audience' | 'notes', val: string) => {
    let t = manualTopic;
    let o = manualObjective;
    let a = targetAudienceInput;
    let n = manualNotes;

    if (field === 'topic') {
      t = val;
      setManualTopic(val);
      if (val.trim()) {
        setCampaignTitle(val.trim());
      }
    } else if (field === 'objective') {
      o = val;
      setManualObjective(val);
    } else if (field === 'audience') {
      a = val;
      setTargetAudienceInput(val);
    } else if (field === 'notes') {
      n = val;
      setManualNotes(val);
    }

    const composed = [
      t.trim() ? `Campaign Subject: ${t.trim()}` : '',
      o.trim() ? `Objective & Key Message: ${o.trim()}` : '',
      a.trim() ? `Target Audience: ${a.trim()}` : '',
      n.trim() ? `Creative Direction & Notes:\n${n.trim()}` : ''
    ].filter(Boolean).join('\n\n');

    setBriefText(composed);
  };

  // STEP 1 -> STEP 2: Turn Brief into Creative Concepts
  const handleGenerateConcepts = async () => {
    if (isGeneratingConcepts) return;

    if (entryMode === 'opportunity' && !activeOpportunity) {
      notify('Please select an intelligence opportunity to proceed.', 'error');
      return;
    }
    if (entryMode === 'upload' && !briefFileBase64 && !briefFileName) {
      notify('Please upload a campaign brief document (.pdf, .docx, .md, .txt) to proceed.', 'error');
      return;
    }
    if (entryMode === 'manual' && !manualTopic.trim() && !manualObjective.trim() && !briefText.trim()) {
      notify('Please enter a campaign topic or objective to proceed.', 'error');
      return;
    }

    setIsGeneratingConcepts(true);
    startCooking('Synthesizing Creative Concepts from Brief', [
      entryMode === 'upload' && briefFileName ? `Digesting uploaded brief "${briefFileName}"...` : 'Extracting audience pain points & market friction...',
      'Synthesizing 3 distinct editorial angles (Trend Jacker, Value Blueprint, Emotive Story)...',
      'Drafting high-conversion copy for Instagram, Facebook & Email...',
      'Formulating visual generation directives & aesthetic queries...',
      'Packaging concept cards for your review...'
    ], '#1A73E8');

    try {
      const payload: any = {
        campaign_goal: campaignGoal,
        brand_tone: brandTone,
        target_audience: targetAudienceInput || undefined
      };

      if (entryMode === 'upload' && briefFileBase64) {
        payload.brief_file_base64 = briefFileBase64;
        payload.brief_file_mime = briefFileMime;
        if (briefText) payload.brief_text = briefText;
      } else if (entryMode === 'opportunity' && activeOpportunity) {
        payload.opportunity_id = activeOpportunity.opportunity_id;
        payload.brief_text = briefText || `Campaign Opportunity: ${activeOpportunity.title}`;
        if (!payload.target_audience && activeOpportunity.audience_label) {
          payload.target_audience = activeOpportunity.audience_label;
        }
      } else {
        payload.brief_text = briefText || (manualTopic ? `Campaign Subject: ${manualTopic}\nObjective: ${manualObjective}` : '');
      }

      const res = await fetch(`${API_BASE}/content-studio/experiments/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data: GenerateExperimentsResponse = await res.json();
        setOperationFinalizing('Finalizing creative concepts & updating campaign state...');
        setConceptsData(data);
        let firstVariant: ContentExperimentVariant | null = null;
        if (data.variants && data.variants.length > 0) {
          firstVariant = data.variants[0];
          setActiveConcept(firstVariant);
          updateConceptDownstreamFields(firstVariant);
          // Purge stale images, videos, and hero asset from any prior brief
          setGeneratedImages([]);
          setGeneratedVideos([]);
          setHeroAsset(null);
          setStartingImageForVideo(null);
          artworkConceptIdRef.current = firstVariant.id;
          artworkConceptTitleRef.current = firstVariant.title;
        }

        const snapshot = buildCampaignDraftSnapshot({
          concepts_data: data,
          active_concept: firstVariant,
          active_artwork: null,
          artwork_data: {
            imagePrompt: firstVariant?.visual_direction || firstVariant?.search_query || '',
            aspectRatio,
            stylePreset,
            numImagesToGenerate,
            generatedImages: [],
            concept_id: firstVariant?.id || null,
            concept_title: firstVariant?.title || null,
            mediaMode: 'image',
            generatedVideos: [],
            videoPrompt: firstVariant?.veo_motion_prompt || '',
            videoAspectRatio,
            videoDuration,
            videoFps
          }
        });
        campaignDraftStore.saveDraft(snapshot, 0);
        await campaignDraftStore.flushSave();

        completeCooking('Creative Concepts ready!');
        setCurrentStage('concepts');
        notify('Creative Concepts generated from your brief!', 'success');
      } else {
        const err = await res.json().catch(() => ({ detail: 'Server error' }));
        failCooking(err.detail || 'Concepts generation failed');
        notify(`Concepts generation failed: ${err.detail || 'Server error'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      failCooking('Network error generating concepts.');
      notify('Network error generating concepts.', 'error');
    } finally {
      setIsGeneratingConcepts(false);
    }
  };

  // Synchronize downstream copy, prompts, and social/email templates to chosen concept
  const updateConceptDownstreamFields = (concept: ContentExperimentVariant) => {
    setActiveConcept(concept);
    setImagePrompt(concept.visual_direction || concept.search_query);
    setVideoPrompt(concept.veo_motion_prompt || concept.visual_direction || '');
    setSearchQueryInput(concept.search_query);
    setInstagramCaption(concept.instagram_copy);
    setFacebookPostCopy(concept.facebook_copy);
    setEmailSubject(concept.email_subject);
    setEmailHeadline(concept.hook || concept.title);
    setEmailBody(concept.email_body);
    setEmailPrimaryCtaText(concept.email_cta_text || 'Explore Campaign');
    setEmailPrimaryCtaUrl(concept.email_cta_url || 'https://trendcontenter.com/');
    setSelectedReferenceAsset(null);
  };

  // STEP 2: Select Concept Action (marks concept as active without immediately firing model calls)
  const handleSelectConcept = (concept: ContentExperimentVariant) => {
    if (activeConcept?.id === concept.id) return;

    // Check if artwork was previously synthesized for a different concept
    const hasArtwork = (generatedImages.length > 0 || generatedVideos.length > 0) && artworkConceptIdRef.current && artworkConceptIdRef.current !== concept.id;
    if (hasArtwork) {
      setConceptChangePending(concept);
      return;
    }

    // Switch active concept cleanly
    updateConceptDownstreamFields(concept);
    notify(`Selected: "${concept.title}"`, 'info');
  };

  // STEP 2 -> STEP 3: Proceed to Artwork Generation from Stage 2 Progression Bar
  const handleProceedToArtworkGeneration = async () => {
    if (!activeConcept) {
      notify('Please select a creative concept first.', 'error');
      return;
    }
    if (isGeneratingImages) return;

    // If artwork is already generated for this exact concept, simply transition without re-generating
    if ((generatedImages.length > 0 || generatedVideos.length > 0) && artworkConceptIdRef.current === activeConcept.id) {
      setCurrentStage('assets');
      notify(`Resumed artwork studio for "${activeConcept.title}"`, 'info');
      return;
    }

    // If artwork was generated for a different concept, prompt user
    if ((generatedImages.length > 0 || generatedVideos.length > 0) && artworkConceptIdRef.current && artworkConceptIdRef.current !== activeConcept.id) {
      setConceptChangePending(activeConcept);
      return;
    }

    // Generate artwork tailored to this concept
    artworkConceptIdRef.current = activeConcept.id;
    artworkConceptTitleRef.current = activeConcept.title;
    setCurrentStage('assets');
    notify(`Selected "${activeConcept.title}". Preparing artwork studio...`, 'info');

    // Automatically curate recommended visual references as optional inspiration aid
    triggerCurateAssets(activeConcept.search_query || activeConcept.title, numAssetsConfig, {
      headline: activeConcept.title,
      topic: activeOpportunity?.title,
      visual_direction: activeConcept.visual_direction
    });

    // Automatically generate campaign images based on the chosen concept
    triggerGenerateImages(activeConcept.visual_direction || activeConcept.search_query, numAssetsConfig);
  };


  // Concept Change Dialog: Regenerate fresh artwork tailored to the new concept
  const handleConfirmChangeConceptWithFreshArtwork = () => {
    if (!conceptChangePending) return;
    const newConcept = conceptChangePending;
    setConceptChangePending(null);

    // Clear stale artwork from previous concept
    setGeneratedImages([]);
    setGeneratedVideos([]);
    setHeroAsset(null);
    setStartingImageForVideo(null);
    artworkConceptIdRef.current = newConcept.id;
    artworkConceptTitleRef.current = newConcept.title;

    updateConceptDownstreamFields(newConcept);
    setCurrentStage('assets');
    notify(`Generating fresh artwork for "${newConcept.title}"...`, 'info');

    triggerCurateAssets(newConcept.search_query || newConcept.title, numAssetsConfig, {
      headline: newConcept.title,
      topic: activeOpportunity?.title,
      visual_direction: newConcept.visual_direction
    });
    triggerGenerateImages(newConcept.visual_direction || newConcept.search_query, numAssetsConfig);
  };

  // Concept Change Dialog: Keep existing artwork but update concept and copy
  const handleConfirmChangeConceptKeepArtwork = () => {
    if (!conceptChangePending) return;
    const newConcept = conceptChangePending;
    setConceptChangePending(null);

    artworkConceptIdRef.current = newConcept.id;
    artworkConceptTitleRef.current = newConcept.title;
    updateConceptDownstreamFields(newConcept);
    notify(`Switched to "${newConcept.title}" while keeping existing visual artwork.`, 'success');
  };

  // Concept Change Dialog: Cancel
  const handleCancelConceptChange = () => {
    setConceptChangePending(null);
  };

  // Generate New Campaign Images (HIGHLIGHT OF CREATION STUDIO)
  const triggerGenerateImages = async (promptToUse?: string, count: number = numImagesToGenerate) => {
    const finalPrompt = (promptToUse || imagePrompt).trim();
    if (!finalPrompt) {
      notify('Please enter an image generation prompt.', 'error');
      return;
    }

    setIsGeneratingImages(true);
    startCooking(`Synthesizing ${count} Campaign Images`, [
      'Interpreting creative direction & composition rules...',
      selectedReferenceAsset ? `Injecting style cues from reference "${selectedReferenceAsset.title.slice(0, 24)}..."` : 'Structuring visual scene geometry & lighting...',
      `Generating ${count} high-resolution campaign image candidates...`,
      'Finalizing visual assets for your review...'
    ], '#1A73E8');

    try {
      const imagePayload: any = {
        prompt: finalPrompt,
        number_of_images: count,
        aspect_ratio: aspectRatio,
        style_preset: stylePreset,
        enhance_prompt: true
      };

      if (selectedReferenceAsset?.image_url && selectedReferenceAsset.image_url.startsWith('data:')) {
        imagePayload.reference_image_base64 = selectedReferenceAsset.image_url;
      }

      const res = await fetch(`${API_BASE}/content-studio/images/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(imagePayload)
      });

      if (res.ok) {
        const data: GenerateImageResponse = await res.json();
        if (data.images && data.images.length > 0) {
          setOperationFinalizing('Validating visual assets and updating campaign state...');
          
          setGeneratedImages(data.images);
          artworkConceptIdRef.current = activeConcept?.id || null;
          artworkConceptTitleRef.current = activeConcept?.title || null;
          
          const primaryAsset = {
            url: data.images[0].url,
            base64: data.images[0].image_base64,
            title: `Generated Campaign Image #1`
          };
          setHeroAsset(primaryAsset);
          setHeroAssetLoadFailed(false);

          // Authoritatively persist to database before marking operation as completed
          const snapshot = buildCampaignDraftSnapshot({
            active_artwork: primaryAsset,
            artwork_data: {
              imagePrompt: finalPrompt,
              aspectRatio,
              stylePreset,
              numImagesToGenerate: count,
              generatedImages: data.images,
              concept_id: activeConcept?.id || null,
              concept_title: activeConcept?.title || null,
              mediaMode: 'image',
              generatedVideos,
              videoPrompt,
              videoAspectRatio,
              videoDuration,
              videoFps
            }
          });
          campaignDraftStore.saveDraft(snapshot, 0);
          await campaignDraftStore.flushSave();

          completeCooking(`Generated ${data.images.length} campaign visuals!`);
          notify(`Generated ${data.images.length} new campaign images!`, 'success');
        } else {
          failCooking('No image candidates generated. Try adjusting prompt keywords.');
          notify('No image candidates generated. Try adjusting prompt keywords.', 'info');
        }
      } else {
        const err = await res.json().catch(() => ({ detail: 'Server error' }));
        failCooking(err.detail || 'Image generation failed');
        notify(`Image generation failed: ${err.detail || 'Server error'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      failCooking('Network error generating images.');
      notify('Network error generating images.', 'error');
    } finally {
      setIsGeneratingImages(false);
    }
  };

  // Google Veo Video Generation (Text-to-Video & Image-to-Video)
  const triggerGenerateVideo = async (promptOverride?: string, startingImageOverride?: GeneratedImageItem | null) => {
    const finalPrompt = (promptOverride !== undefined ? promptOverride : videoPrompt).trim();
    if (!finalPrompt) {
      notify('Please enter a video motion prompt.', 'error');
      return;
    }

    const startingImg = startingImageOverride !== undefined ? startingImageOverride : startingImageForVideo;
    const isImageToVideo = !!startingImg;

    setIsGeneratingVideo(true);
    startCooking(
      isImageToVideo ? 'Google Veo Image-to-Video Synthesis' : 'Google Veo Text-to-Video Synthesis',
      [
        'Interpreting cinematic prompt semantics & temporal dynamics...',
        isImageToVideo ? 'Conditioning diffusion latents with starting frame image...' : 'Synthesizing scene geometry & lighting physics...',
        'Simulating camera movement & temporal coherence with Google Veo...',
        'Encoding cinematic MP4 stream and preparing interactive preview...'
      ],
      '#8B5CF6'
    );

    try {
      const res = await fetch(`${API_BASE}/content-studio/videos/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          image_base64: startingImg ? (startingImg.image_base64 || startingImg.url) : null,
          aspect_ratio: videoAspectRatio,
          duration_seconds: videoDuration,
          fps: videoFps,
          enhance_prompt: true
        })
      });

      if (res.ok) {
        const data: GenerateVideoResponse = await res.json();
        setOperationFinalizing('Encoding cinematic stream and persisting campaign state...');
        
        // The video generation should only return 1 video. Not more than that.
        setGeneratedVideos([data]);
        artworkConceptIdRef.current = activeConcept?.id || null;
        artworkConceptTitleRef.current = activeConcept?.title || null;
        
        const videoAsset = {
          url: data.video_url,
          title: `Veo Video (${data.aspect_ratio}, ${data.duration_seconds}s, ${data.fps}fps)`,
          media_type: 'video' as const
        };
        setHeroAsset(videoAsset);
        setHeroAssetLoadFailed(false);

        const snapshot = buildCampaignDraftSnapshot({
          active_artwork: videoAsset,
          artwork_data: {
            imagePrompt,
            aspectRatio,
            stylePreset,
            numImagesToGenerate,
            generatedImages,
            concept_id: activeConcept?.id || null,
            concept_title: activeConcept?.title || null,
            mediaMode: 'video',
            generatedVideos: [data],
            videoPrompt: finalPrompt,
            videoAspectRatio,
            videoDuration,
            videoFps
          }
        });
        campaignDraftStore.saveDraft(snapshot, 0);
        await campaignDraftStore.flushSave();

        completeCooking('Google Veo video synthesized successfully!');
        notify('Cinematic video generated successfully!', 'success');
      } else {
        const err = await res.json().catch(() => ({ detail: 'Server error' }));
        failCooking(err.detail || 'Video generation failed');
        notify(`Video generation failed: ${err.detail || 'Server error'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      failCooking('Network error generating video.');
      notify('Network error generating video.', 'error');
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const handleAnimateImageWithVeo = (img: GeneratedImageItem) => {
    setMediaMode('video');
    setStartingImageForVideo(img);
    if (!videoPrompt && activeConcept?.veo_motion_prompt) {
      setVideoPrompt(activeConcept.veo_motion_prompt);
    } else if (!videoPrompt && imagePrompt) {
      setVideoPrompt(`Cinematic camera motion animating: ${imagePrompt}`);
    }
    notify('Image attached as starting frame for Veo video generation.', 'info');
  };

  // Curate Recommended Assets from Visual Search (OPTIONAL INSPIRATION AID)
  const triggerCurateAssets = async (
    query: string, 
    count: number = numAssetsConfig,
    context?: { headline?: string; topic?: string; visual_direction?: string }
  ) => {
    const effectiveQuery = (
      query || 
      searchQueryInput || 
      context?.headline || 
      activeConcept?.search_query || 
      activeConcept?.title || 
      activeOpportunity?.title || 
      ''
    ).trim();

    if (!effectiveQuery) {
      setCurationError('Please provide a campaign topic or concept to search for reference imagery.');
      return;
    }

    setIsCuratingAssets(true);
    setCurationError(null);
    setCurationLastQuery(effectiveQuery);
    setSearchQueryInput(effectiveQuery);
    setBrokenImageIds({});

    try {
      const res = await fetch(`${API_BASE}/content-studio/images/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: effectiveQuery,
          num_results: count,
          reranker_model: 'gemini',
          headline: context?.headline || activeConcept?.title,
          topic: context?.topic || activeOpportunity?.title,
          visual_direction: context?.visual_direction || activeConcept?.visual_direction
        })
      });

      if (res.ok) {
        const data: RecommendImagesResponse = await res.json();
        const items = data.recommendations || [];
        setCuratedAssets(items);
        setCurationProviderDisplay(data.search_provider_display || (data.search_provider === 'serpapi' ? 'Google Images (via SerpApi)' : 'Visual Search Engine'));
        if (items.length === 0) {
          setCurationError(`No reference imagery returned for "${effectiveQuery}". You can refine your search query or generate images directly from your creative prompt below.`);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setCurationError(err.detail || 'Visual reference retrieval encountered a temporary issue. Creative generation below remains fully operational.');
      }
    } catch (err) {
      console.warn('Could not curate recommended reference imagery:', err);
      setCurationError('Network connection issue retrieving reference imagery. You can retry or proceed directly to generation below.');
    } finally {
      setIsCuratingAssets(false);
    }
  };

  // Toggle Recommended Asset as an Optional Generation Reference
  const handleToggleReferenceAsset = (item: RecommendedImageItem) => {
    if (selectedReferenceAsset?.id === item.id) {
      setSelectedReferenceAsset(null);
      setImagePrompt(activeConcept?.visual_direction || activeConcept?.search_query || '');
      notify('Removed reference inspiration aid.', 'info');
    } else {
      setSelectedReferenceAsset(item);
      const base = activeConcept?.visual_direction || imagePrompt;
      const label = item.source_domain === 'Local Upload' ? `uploaded reference: ${item.title}` : item.title;
      const enriched = `${base}. Style and aesthetic inspired by ${label}`;
      setImagePrompt(enriched);
      notify(`Using "${item.title.slice(0, 32)}..." as visual inspiration aid!`, 'success');
    }
  };

  // Upload custom reference image from local machine
  const handleUploadReferenceImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      notify('Please select a valid image file (PNG, JPG, WebP, etc.).', 'error');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      notify('Image file size exceeds 15MB. Please choose a smaller image.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const dataUrl = uploadEvent.target?.result as string;
      if (!dataUrl) return;

      const baseName = file.name.replace(/\.[^/.]+$/, "") || 'Uploaded Reference';
      const uploadedItem: RecommendedImageItem = {
        id: `user_ref_${Date.now()}`,
        image_url: dataUrl,
        thumbnail_url: dataUrl,
        title: baseName,
        snippet: `Custom reference uploaded by user: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`,
        source_domain: 'Local Upload',
        source_url: null,
        is_watermarked: false,
        relevance_score: 1.0,
        overall_score: 1.0,
        tags: ['user_upload', 'custom_reference']
      };

      setCuratedAssets((prev) => [uploadedItem, ...prev.filter((x) => x.id !== uploadedItem.id)]);
      setCurationError(null);
      setSelectedReferenceAsset(uploadedItem);

      const base = activeConcept?.visual_direction || imagePrompt;
      const enriched = `${base}. Style and aesthetic inspired by uploaded reference: ${uploadedItem.title}`;
      setImagePrompt(enriched);
      notify(`Uploaded and attached reference image "${uploadedItem.title}"!`, 'success');
    };
    reader.onerror = () => {
      notify('Failed to read image file. Please try again.', 'error');
    };
    reader.readAsDataURL(file);

    // Reset input value so same file can be chosen again if desired
    e.target.value = '';
  };

  // Remove uploaded reference from curated list
  const handleRemoveUploadedReference = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setCuratedAssets((prev) => prev.filter((item) => item.id !== id));
    if (selectedReferenceAsset?.id === id) {
      setSelectedReferenceAsset(null);
      setImagePrompt(activeConcept?.visual_direction || activeConcept?.search_query || '');
      notify('Removed reference inspiration aid.', 'info');
    }
  };

  // Natural Language Retouch / Edit Action on the Selected Generated Asset
  const handleExecuteRetouch = async () => {
    if (!heroAsset || !heroAsset.url) {
      notify('Please select an artwork to edit.', 'error');
      return;
    }
    if (!editorPrompt.trim()) {
      notify('Please enter a natural language editing instruction.', 'error');
      return;
    }

    const originalAsset = {
      url: heroAsset.original_url || heroAsset.url,
      base64: heroAsset.original_base64 || heroAsset.base64,
      title: heroAsset.title
    };

    setIsEditingAsset(true);
    startCooking('Applying Natural Language Edit', [
      'Deconstructing artwork layers and color palette...',
      `Interpreting instruction: "${editorPrompt.slice(0, 32)}..."`,
      'Executing visual retouch & style harmonization...',
      'Rendering updated high-resolution artwork...'
    ], '#D97706');

    try {
      const payload: any = {
        image_base64: heroAsset.base64 || heroAsset.url,
        operation: editorMode,
        prompt: editorPrompt
      };

      const res = await fetch(`${API_BASE}/content-studio/images/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.images && data.images[0]) {
          const editedImg: GeneratedImageItem = data.images[0];
          setOperationFinalizing('Validating retouched artwork and updating campaign state...');
          
          // 1. Update heroAsset with retouch metadata & preserve original for comparison
          const retouchedAsset = {
            url: editedImg.url,
            base64: editedImg.image_base64,
            title: `Retouched: ${editorPrompt.slice(0, 30)}`,
            media_type: 'image' as const,
            is_retouched: true,
            retouch_prompt: editorPrompt,
            original_url: originalAsset.url,
            original_base64: originalAsset.base64
          };
          setHeroAsset(retouchedAsset);
          setHeroAssetLoadFailed(false);

          // 2. Prepend retouched image to generatedImages so it appears in candidate gallery above
          const retouchedGalleryItem: GeneratedImageItem = {
            id: editedImg.id || `retouch_${Date.now()}`,
            url: editedImg.url,
            image_base64: editedImg.image_base64,
            enhanced_prompt: `[Retouched] ${editorPrompt}`,
            mime_type: editedImg.mime_type || 'image/png'
          };
          const updatedImages = [retouchedGalleryItem, ...generatedImages.filter(x => x.url !== editedImg.url)];
          setGeneratedImages(updatedImages);

          // 3. Persist updated retouched asset immediately
          const snapshot = buildCampaignDraftSnapshot({
            active_artwork: retouchedAsset,
            artwork_data: {
              imagePrompt,
              aspectRatio,
              stylePreset,
              numImagesToGenerate,
              generatedImages: updatedImages,
              concept_id: artworkConceptIdRef.current,
              concept_title: artworkConceptTitleRef.current,
              mediaMode: 'image',
              generatedVideos,
              videoPrompt,
              videoAspectRatio,
              videoDuration,
              videoFps
            }
          });
          campaignDraftStore.saveDraft(snapshot, 0);
          await campaignDraftStore.flushSave();

          completeCooking('Retouch applied successfully!');
          notify('Natural language edit applied successfully! Updated asset is now active.', 'success');
          setIsRetouchOpen(false);
        }
      } else {
        const err = await res.json().catch(() => ({ detail: 'Could not apply edit' }));
        failCooking(err.detail || 'Could not apply edit');
        notify(`Retouch failed: ${err.detail || 'Could not apply edit'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      failCooking('Network error executing retouch.');
      notify('Network error executing retouch.', 'error');
    } finally {
      setIsEditingAsset(false);
    }
  };

  // STEP 3 -> STEP 4: Confirm Asset and Proceed to Publishing
  const handleProceedToPublish = () => {
    if (!heroAsset || !heroAsset.url) {
      notify('Please select or generate an image first.', 'error');
      return;
    }
    setCurrentStage('publish');
  };

  // Publish to Facebook (Feed Post, Video Post, or Reel)
  const handlePublishFacebook = async () => {
    const isVideo = fbTargetFormat === 'REEL' || (fbTargetFormat === 'POST' && fbPostMediaType === 'VIDEO') || Boolean(heroAsset?.url && (heroAsset.url.endsWith('.mp4') || heroAsset.url.endsWith('.mov')));
    const rawTarget = (isVideo && fbCustomVideoUrl.trim()) ? fbCustomVideoUrl.trim() : (heroAsset?.url || '');

    if (!rawTarget) {
      if (isVideo) {
        notify('Please provide a video URL or hosted media asset to publish to Facebook.', 'error');
      } else {
        notify('Please select an artwork asset for Facebook publishing.', 'error');
      }
      return;
    }

    setIsPublishing(true);
    const cookingTitle = fbTargetFormat === 'REEL'
      ? 'Publishing Facebook Reel'
      : (isVideo ? 'Uploading Facebook Video Post' : 'Publishing to Facebook Page');

    startCooking(cookingTitle, [
      'Connecting to Facebook Graph gateway...',
      'Validating Page ID and Access Token...',
      isVideo ? 'Transferring video stream & processing on Meta servers...' : 'Uploading media container & post caption...',
      'Confirming live publication...'
    ], '#1877F2');

    try {
      const resolvedMediaUrl = resolvePublishImageUrl(rawTarget);
      const payload: any = {
        media_url: resolvedMediaUrl,
        image_url: resolvedMediaUrl,
        video_url: isVideo ? resolvedMediaUrl : undefined,
        target_format: fbTargetFormat,
        media_type: isVideo ? 'VIDEO' : 'IMAGE',
        title: fbVideoTitle.trim() || undefined,
        text: facebookPostCopy,
        hashtags: activeConcept?.hashtags || []
      };
      if (fbPageId.trim()) payload.page_id = fbPageId.trim();
      if (fbAccessToken.trim()) payload.access_token = fbAccessToken.trim();

      const res = await fetch(`${API_BASE}/content-studio/publish/facebook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data: PublishResult = await res.json();
        completeCooking('Published to Facebook!');
        const formatLabel = fbTargetFormat === 'REEL' ? 'Facebook Reel' : (isVideo ? 'Facebook Video Post' : 'Facebook Page Post');
        notify(data.message || `Published to ${formatLabel}!`, 'success');
        setPublishHistory(prev => [
          { platform: 'facebook', id: data.post_id || 'fb_post', url: data.url || undefined, timestamp: new Date().toLocaleTimeString(), title: `${activeConcept?.title || 'Facebook'} (${formatLabel})` },
          ...prev
        ]);
        fetchPublishingStatus();
      } else {
        const err = await res.json().catch(() => ({ detail: 'Check credentials' }));
        failCooking(err.detail || 'Check credentials');
        notify(`Facebook publish failed: ${err.detail || 'Check credentials'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      failCooking('Network error publishing to Facebook.');
      notify('Network error publishing to Facebook.', 'error');
    } finally {
      setIsPublishing(false);
    }
  };

  // Publish to Instagram (Feed Post, Reel, or Story)
  const handlePublishInstagram = async () => {
    const isVideo = igTargetFormat === 'REEL' || (igTargetFormat === 'STORY' && igStoryMediaType === 'VIDEO') || Boolean(heroAsset?.url && (heroAsset.url.endsWith('.mp4') || heroAsset.url.endsWith('.mov')));
    const rawTarget = (isVideo && customVideoUrl.trim()) ? customVideoUrl.trim() : (heroAsset?.url || '');

    if (!rawTarget) {
      if (isVideo) {
        notify('Please provide a video URL or hosted media asset to publish.', 'error');
      } else {
        notify('Please select an artwork asset for Instagram publishing.', 'error');
      }
      return;
    }

    setIsPublishing(true);
    const cookingTitle = igTargetFormat === 'REEL'
      ? 'Publishing Reel to Instagram'
      : (igTargetFormat === 'STORY' ? 'Publishing Story to Instagram' : 'Publishing to Instagram Feed');

    startCooking(cookingTitle, [
      'Connecting to Instagram Content Publishing API...',
      'Validating Instagram User ID & Graph Token...',
      isVideo ? 'Creating video container & awaiting Instagram transcoding...' : 'Creating media container & syncing asset...',
      'Publishing container to live profile...'
    ], '#E1306C');

    try {
      const resolvedMediaUrl = resolvePublishImageUrl(rawTarget);
      const payload: any = {
        media_url: resolvedMediaUrl,
        image_url: resolvedMediaUrl,
        video_url: isVideo ? resolvedMediaUrl : undefined,
        target_format: igTargetFormat,
        media_type: isVideo ? 'VIDEO' : 'IMAGE',
        share_to_feed: igShareToFeed,
        text: igTargetFormat === 'STORY' ? '' : instagramCaption,
        hashtags: igTargetFormat === 'STORY' ? [] : (activeConcept?.hashtags || [])
      };
      if (igUserId.trim()) payload.instagram_user_id = igUserId.trim();
      if (igAccessToken.trim()) payload.access_token = igAccessToken.trim();

      const res = await fetch(`${API_BASE}/content-studio/publish/instagram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data: PublishResult = await res.json();
        completeCooking('Published to Instagram!');
        const formatLabel = igTargetFormat === 'REEL' ? 'Instagram Reel' : (igTargetFormat === 'STORY' ? 'Instagram Story' : 'Instagram Feed');
        notify(data.message || `Published to ${formatLabel}!`, 'success');
        setPublishHistory(prev => [
          { platform: 'instagram', id: data.post_id || 'ig_post', url: data.url || undefined, timestamp: new Date().toLocaleTimeString(), title: `${activeConcept?.title || 'Instagram'} (${formatLabel})` },
          ...prev
        ]);
        fetchPublishingStatus();
      } else {
        const err = await res.json().catch(() => ({ detail: 'Check credentials' }));
        failCooking(err.detail || 'Check credentials');
        notify(`Instagram publish failed: ${err.detail || 'Check credentials'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      failCooking('Network error publishing to Instagram.');
      notify('Network error publishing to Instagram.', 'error');
    } finally {
      setIsPublishing(false);
    }
  };

  // Publish Campaign Email
  const handlePublishEmail = async () => {
    const emails = emailRecipients.split(/[\s,]+/).filter(e => e.includes('@'));
    if (emails.length === 0) {
      notify('Please enter at least one valid recipient email.', 'error');
      return;
    }
    if (!emailBody.trim()) {
      notify('Please enter email body content.', 'error');
      return;
    }

    setIsPublishing(true);
    startCooking('Dispatching Campaign Email', [
      'Compiling responsive HTML email template...',
      'Validating mail delivery relay credentials...',
      `Packaging payload for ${emails.length} recipient(s)...`,
      'Dispatching live email broadcast...'
    ], '#059669');

    try {
      const payload: any = {
        to_emails: emails,
        subject: emailSubject || 'Campaign Intelligence Update',
        headline: emailHeadline || activeConcept?.hook || 'Campaign Update',
        campaign_body: emailBody,
        image_url: emailIncludeHeroImage ? resolvePublishImageUrl(heroAsset?.url) : null,
        from_email: fromEmail || undefined,
        template_config: {
          theme: emailTheme,
          brand_heading: emailBrandHeading,
          brand_subtitle: emailBrandSubtitle,
          accent_color: emailAccentColor,
          primary_cta_text: emailPrimaryCtaText,
          primary_cta_url: emailPrimaryCtaUrl,
          secondary_button_text: emailSecondaryBtnText || null,
          secondary_button_url: emailSecondaryBtnUrl || null,
          footer_text: emailFooterText,
          include_hero_image: emailIncludeHeroImage
        }
      };

      if (emailDeliveryMode === 'sendgrid' && sendgridApiKey.trim()) {
        payload.sendgrid_api_key = sendgridApiKey.trim();
      } else if (emailDeliveryMode === 'smtp') {
        if (smtpHost.trim()) payload.smtp_host = smtpHost.trim();
        if (smtpPort) payload.smtp_port = smtpPort;
        if (smtpUsername.trim()) payload.smtp_username = smtpUsername.trim();
        if (smtpPassword.trim()) payload.smtp_password = smtpPassword.trim();
      }

      const res = await fetch(`${API_BASE}/content-studio/publish/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data: PublishResult = await res.json();
        completeCooking('Email broadcast dispatched!');
        notify(data.message || 'Campaign Email successfully sent!', 'success');
        setPublishHistory(prev => [
          { platform: 'email', id: data.post_id || 'email_msg', timestamp: new Date().toLocaleTimeString(), title: emailSubject || 'Email Campaign' },
          ...prev
        ]);
        fetchPublishingStatus();
      } else {
        const err = await res.json().catch(() => ({ detail: 'Check credentials' }));
        failCooking(err.detail || 'Check credentials');
        notify(`Email dispatch failed: ${err.detail || 'Check credentials'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      failCooking('Network error dispatching email.');
      notify('Network error dispatching email.', 'error');
    } finally {
      setIsPublishing(false);
    }
  };

  const selectedPalette = EMAIL_THEMES[emailTheme] || EMAIL_THEMES.modern_blue;

  // Stage 1 Ingestion Helpers & Readiness Calculations
  const selectedOpps = opportunities.filter(o => o.status === 'selected');
  const highScoreOpps = opportunities.filter(o => o.score >= 0.8);

  const filteredOpportunities = opportunities.filter(opp => {
    if (oppFilter === 'staged' && opp.status !== 'selected') return false;
    if (oppFilter === 'high_score' && opp.score < 0.8) return false;
    if (oppSearchQuery.trim()) {
      const q = oppSearchQuery.toLowerCase();
      const matchTitle = opp.title.toLowerCase().includes(q);
      const matchAudience = opp.audience_label?.toLowerCase().includes(q);
      const matchGap = opp.content_gap?.toLowerCase().includes(q);
      const matchAngle = opp.recommended_angle?.toLowerCase().includes(q);
      return matchTitle || matchAudience || matchGap || matchAngle;
    }
    return true;
  });

  const isBriefReady = Boolean(
    (entryMode === 'opportunity' && activeOpportunity) ||
    (entryMode === 'upload' && (briefFileBase64 || briefFileName)) ||
    (entryMode === 'manual' && (manualTopic.trim() || manualObjective.trim() || briefText.trim()))
  );

  const getReadinessSummary = () => {
    if (entryMode === 'opportunity') {
      if (activeOpportunity) {
        return {
          valid: true,
          title: activeOpportunity.title,
          desc: `Intelligence Opportunity • Score: ${Math.round(activeOpportunity.score * 100)}% • Audience: ${activeOpportunity.audience_label || 'Target Demographic'}`
        };
      }
      return {
        valid: false,
        title: 'No Opportunity Selected',
        desc: 'Select an intelligence opportunity from the list below or choose another entry path.'
      };
    }
    if (entryMode === 'upload') {
      if (briefFileName) {
        return {
          valid: true,
          title: briefFileName,
          desc: `Uploaded Brief • ${briefFileSize ? (briefFileSize / 1024).toFixed(1) + ' KB' : 'Document'} • Ready to parse`
        };
      }
      return {
        valid: false,
        title: 'No Document Uploaded',
        desc: 'Drop a PDF, Word (.docx), Markdown (.md), or plain text (.txt) file above.'
      };
    }
    // manual
    if (manualTopic.trim() || manualObjective.trim() || briefText.trim()) {
      return {
        valid: true,
        title: manualTopic.trim() || campaignTitle || 'Custom Strategic Brief',
        desc: `Manual Brief • Target Audience: ${targetAudienceInput || 'Target Demographic'}`
      };
    }
    return {
      valid: false,
      title: 'Incomplete Brief',
      desc: 'Enter a campaign subject or primary objective above to continue.'
    };
  };

  const readiness = getReadinessSummary();

  return (
    <div className="page-container animate-fade-in" style={{ paddingBottom: '90px' }}>
      {/* Toast Notification */}
      {toastMsg && (
        <div 
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            padding: '12px 20px',
            borderRadius: '8px',
            background: toastMsg.type === 'error' ? 'var(--status-error)' : toastMsg.type === 'success' ? 'var(--status-success)' : 'var(--text-primary)',
            color: '#FFFFFF',
            fontSize: '0.88rem',
            fontWeight: 500,
            boxShadow: 'var(--shadow-modal)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          {toastMsg.type === 'success' ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Header & Linear Pipeline Stepper */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Content Studio
              </h1>
              <span className="badge badge-emerald" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
                Content Supply Chain
              </span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', maxWidth: '820px', margin: '4px 0 0 0' }}>
              Ingest comprehensive briefs, synthesize resonant concepts, generate custom campaign imagery with optional reference aids, and publish live across social channels &amp; email.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* Cloud Autosave Indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem' }}>
              {saveStatus === 'saving' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                  <span className="pulsing-cook-dot" style={{ width: '8px', height: '8px', background: '#0F9D9A' }} />
                  <span>Saving…</span>
                </span>
              )}
              {saveStatus === 'saved' && (
                <span 
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#137333', fontWeight: 600 }}
                  title={lastSavedAt ? `Saved to PostgreSQL at ${lastSavedAt.toLocaleTimeString()}` : 'Saved to database'}
                >
                  <IconCheck size={14} />
                  <span>Saved</span>
                </span>
              )}
              {saveStatus === 'error' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#B3261E', fontWeight: 500 }}>
                  <IconAlertTriangle size={14} />
                  <span>Save failed</span>
                  <button
                    onClick={() => campaignDraftStore.flushSave()}
                    style={{ background: 'transparent', border: 'none', color: '#1A73E8', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.8rem', padding: '0 2px' }}
                  >
                    Retry
                  </button>
                </span>
              )}
            </div>

            {/* Campaign Switcher Trigger & Portal Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                ref={campaignTriggerRef}
                className="btn-outline"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', fontSize: '0.84rem' }}
                onClick={() => {
                  refreshDraftsList();
                  setShowCampaignSwitcher(prev => !prev);
                }}
                aria-haspopup="true"
                aria-expanded={showCampaignSwitcher}
              >
                <span style={{ fontWeight: 600, maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  📁 {campaignTitle || 'Campaign Draft'}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>▼</span>
              </button>

              {showCampaignSwitcher && createPortal(
                <div 
                  ref={campaignMenuRef}
                  style={{
                    position: 'fixed',
                    top: `${campaignDropdownPos.top}px`,
                    left: `${campaignDropdownPos.left}px`,
                    width: `${campaignDropdownPos.width}px`,
                    maxHeight: `${campaignDropdownPos.maxHeight}px`,
                    background: '#FFFFFF',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    boxShadow: 'var(--shadow-modal)',
                    zIndex: 99999,
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>Saved Campaigns</span>
                    <button
                      className="btn-primary"
                      style={{ padding: '4px 8px', fontSize: '0.76rem' }}
                      onClick={() => {
                        setShowCampaignSwitcher(false);
                        handleStartNewCampaign();
                      }}
                    >
                      + New Campaign
                    </button>
                  </div>
                  
                  <div style={{ flex: 1, overflowY: 'auto', marginTop: '6px', minHeight: 0 }}>
                    {savedDraftsList.length === 0 ? (
                      <div style={{ padding: '12px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        No other saved campaigns
                      </div>
                    ) : (
                      savedDraftsList.map(draft => (
                        <div
                          key={draft.campaign_id}
                          onClick={() => {
                            handleSelectCampaign(draft.campaign_id);
                            setShowCampaignSwitcher(false);
                          }}
                          style={{
                            padding: '8px 10px',
                            borderRadius: '6px',
                            background: draft.campaign_id === campaignId ? '#F0F9FF' : 'transparent',
                            border: draft.campaign_id === campaignId ? '1px solid #BAE6FD' : '1px solid transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '4px'
                          }}
                        >
                          <div style={{ overflow: 'hidden', marginRight: '8px', flex: 1 }}>
                            <div 
                              style={{ 
                                fontWeight: 600, 
                                fontSize: '0.82rem', 
                                color: 'var(--text-primary)', 
                                whiteSpace: 'nowrap', 
                                textOverflow: 'ellipsis', 
                                overflow: 'hidden' 
                              }}
                              title={draft.title || draft.campaign_id}
                            >
                              {draft.title || draft.campaign_id}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: '6px', marginTop: '2px', alignItems: 'center' }}>
                              <span className="badge badge-cyan" style={{ fontSize: '0.68rem', padding: '1px 4px' }}>Stage: {draft.current_stage}</span>
                              <span>{draft.updated_at ? new Date(draft.updated_at).toLocaleDateString() : 'Draft'}</span>
                            </div>
                          </div>
                          <button
                            onClick={(e) => handleDeleteCampaign(draft.campaign_id, e)}
                            title="Delete campaign draft"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: '4px',
                              fontSize: '0.85rem'
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>,
                document.body
              )}
            </div>

            {cookingState.isCooking && (cookingState.status === 'running' || cookingState.status === 'finalizing') ? (
              <span className="metric-pill metric-pill-cyan" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="pulsing-cook-dot" />
                <span>{cookingState.status === 'finalizing' ? 'Finalizing Campaign Operation...' : 'Active Operation In Progress...'}</span>
              </span>
            ) : (
              <span className="metric-pill metric-pill-green">
                <span className="pulse-dot" />
                <span>Studio Ready</span>
              </span>
            )}
          </div>
        </div>

        {/* 4-Stage Campaign Journey Stepper */}
        <div 
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '10px',
            background: '#FFFFFF',
            borderRadius: '12px',
            padding: '8px',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-card)'
          }}
        >
          {[
            { 
              id: 'brief', 
              num: '1', 
              title: 'Campaign Brief', 
              desc: briefFileName 
                ? `Uploaded: ${briefFileName.slice(0, 18)}...` 
                : activeOpportunity 
                  ? 'Strategy Selected' 
                  : (briefText ? 'Brief Provided' : 'Upload Brief Document') 
            },
            { 
              id: 'concepts', 
              num: '2', 
              title: 'Choose Concept', 
              desc: activeConcept 
                ? activeConcept.variant_label 
                : conceptsData 
                  ? 'Select Concept' 
                  : 'Generate Concepts' 
            },
            { 
              id: 'assets', 
              num: '3', 
              title: 'Generate & Retouch Artwork', 
              desc: !activeConcept 
                ? 'Concept Required'
                : heroAsset && !heroAssetLoadFailed
                  ? (heroAsset.media_type === 'video' || heroAsset.url?.endsWith('.mp4') ? 'Active Video Selected' : 'Active Artwork Selected')
                  : (generatedImages.length + generatedVideos.length > 0)
                    ? `${generatedImages.length + generatedVideos.length} Candidate${generatedImages.length + generatedVideos.length === 1 ? '' : 's'} Generated`
                    : 'Generate Campaign Visuals'
            },
            { 
              id: 'publish', 
              num: '4', 
              title: 'Publish & Channels', 
              desc: !heroAsset || heroAssetLoadFailed
                ? 'Active Asset Required'
                : publishingStatus?.[publishChannel]?.configured
                  ? `${publishChannel === 'facebook' ? 'Facebook' : publishChannel === 'instagram' ? 'Instagram' : 'Email'} Ready`
                  : 'Configure Channel & Copy'
            }
          ].map((step) => {
            const isActive = currentStage === step.id;
            const isCompleted = (
              (step.id === 'brief' && (conceptsData !== null || briefFileBase64 !== null || activeOpportunity !== null)) ||
              (step.id === 'concepts' && activeConcept !== null) ||
              (step.id === 'assets' && heroAsset !== null && !heroAssetLoadFailed)
            );
            return (
              <button
                key={step.id}
                onClick={() => {
                  const safeStage = resolveSafeStage(
                    step.id as JourneyStage,
                    conceptsData,
                    activeConcept,
                    heroAsset
                  );
                  if (safeStage !== step.id) {
                    if (step.id === 'publish') {
                      notify('Please generate or select artwork before proceeding to publishing', 'error');
                    } else if (step.id === 'assets') {
                      notify('Please generate and choose a concept before proceeding to artwork', 'error');
                    } else if (step.id === 'concepts') {
                      notify('Please configure a brief before generating concepts', 'error');
                    }
                  }
                  setCurrentStage(safeStage);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: isActive ? '#E8F0FE' : 'transparent',
                  border: isActive ? '1.5px solid #1A73E8' : '1px solid transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease'
                }}
              >
                <div 
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: isActive ? '#1A73E8' : isCompleted ? '#E6F4EA' : '#F1F5F9',
                    color: isActive ? '#FFFFFF' : isCompleted ? '#137333' : '#64748B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.88rem'
                  }}
                >
                  {isCompleted && !isActive ? '✓' : step.num}
                </div>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: isActive ? 700 : 600, color: isActive ? '#1A73E8' : 'var(--text-primary)' }}>
                    {step.title}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: isCompleted ? '#137333' : 'var(--text-muted)', fontWeight: isCompleted ? 600 : 400 }}>
                    {step.desc}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Global Live Cooking Banner (Active when process is running, finalizing, completed, or failed) */}
      {cookingState.status !== 'idle' && (
        <CookingBanner 
          title={cookingState.stageName}
          stepMessage={cookingState.stepMessage}
          stepIndex={cookingState.stepIndex}
          totalSteps={cookingState.totalSteps}
          stepsList={cookingState.stepsList}
          progressPercent={cookingState.progressPercent}
          accentColor={cookingState.accentColor}
          status={cookingState.status}
          errorMessage={cookingState.errorMessage}
          onDismiss={dismissCookingBanner}
          onRetry={
            cookingState.stageName.includes('Image') ? () => triggerGenerateImages(imagePrompt, numImagesToGenerate) :
            cookingState.stageName.includes('Video') ? () => triggerGenerateVideo() :
            undefined
          }
        />
      )}

      {/* Consolidated Campaign Context & Primary Action Bar */}
      {(activeOpportunity || activeConcept || heroAsset || campaignTitle) && (
        <div 
          className="glass-card" 
          style={{ 
            padding: '12px 18px', 
            marginBottom: '24px', 
            background: '#F8FAFC', 
            border: '1px solid #CBD5E1',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '14px'
          }}
        >
          {/* Left: Campaign Title & Selected Concept Variant / Hook */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="badge badge-cyan" style={{ fontSize: '0.75rem' }}>Campaign</span>
              <span 
                style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={activeOpportunity?.title || conceptsData?.campaign_title || briefFileName || campaignTitle || 'Custom Campaign'}
              >
                {activeOpportunity?.title || conceptsData?.campaign_title || briefFileName || campaignTitle || 'Custom Campaign'}
              </span>
            </div>

            {activeConcept && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge badge-amber" style={{ fontSize: '0.72rem' }}>
                  {activeConcept.variant_label}
                </span>
                <span 
                  style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={activeConcept.hook}
                >
                  "{activeConcept.hook}"
                </span>
              </div>
            )}
          </div>

          {/* Right: Active Artwork Thumbnail/Status & Stage 3 Primary Action */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            {heroAsset && (
              <div 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '10px',
                  background: '#FFFFFF',
                  padding: '4px 10px 4px 6px',
                  borderRadius: '8px',
                  border: heroAssetLoadFailed ? '1px solid #FCD34D' : '1px solid #CBD5E1',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                }}
              >
                {heroAssetLoadFailed ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="badge badge-amber" style={{ fontSize: '0.72rem' }}>⚠️ Asset Unavailable</span>
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ padding: '2px 8px', fontSize: '0.72rem', border: 'none', textDecoration: 'underline', color: '#1A73E8', background: 'transparent', cursor: 'pointer' }}
                      onClick={() => setCurrentStage('assets')}
                    >
                      Choose Alternate
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ position: 'relative', width: '38px', height: '38px', borderRadius: '6px', overflow: 'hidden', background: '#0F172A', flexShrink: 0 }}>
                      {heroAsset.media_type === 'video' || heroAsset.url?.endsWith('.mp4') ? (
                        <>
                          <video 
                            src={resolveImageSrc(heroAsset.url)} 
                            muted 
                            autoPlay 
                            loop 
                            playsInline 
                            onError={() => setHeroAssetLoadFailed(true)}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                          />
                          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ color: '#FFF', fontSize: '10px' }}>▶</span>
                          </div>
                        </>
                      ) : (
                        <img 
                          src={resolveImageSrc(heroAsset.base64 || heroAsset.url)} 
                          alt="Artwork thumb" 
                          onError={() => setHeroAssetLoadFailed(true)}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        />
                      )}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span 
                          className={heroAsset.media_type === 'video' || heroAsset.url?.endsWith('.mp4') ? 'badge badge-cyan' : 'badge badge-emerald'} 
                          style={{ fontSize: '0.70rem', padding: '1px 6px' }}
                        >
                          {heroAsset.media_type === 'video' || heroAsset.url?.endsWith('.mp4') ? 'Active Video' : 'Active Artwork'}
                        </span>
                        {heroAsset.is_retouched && (
                          <span className="badge badge-emerald" style={{ fontSize: '0.66rem', padding: '1px 5px', background: '#DCFCE7', color: '#166534' }}>
                            ✨ Retouched
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px', maxWidth: '160px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {heroAsset.title || 'Selected Candidate'}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Stage 3 Primary Progression Action */}
            {currentStage === 'assets' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {!activeConcept ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.74rem', color: '#DC2626', fontWeight: 600 }}>Concept Required</span>
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ padding: '6px 12px', fontSize: '0.80rem' }}
                      onClick={() => setCurrentStage('concepts')}
                    >
                      Choose Concept
                    </button>
                    <button 
                      className="btn-primary" 
                      style={{ padding: '8px 16px', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, opacity: 0.5, cursor: 'not-allowed' }}
                      disabled
                      title="Select a concept first to enable publishing"
                    >
                      <span>Continue to Publishing</span>
                      <IconArrowRight size={14} />
                    </button>
                  </div>
                ) : !heroAsset || (!heroAsset.url && !heroAsset.base64) ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Active Artwork Required</span>
                    <button 
                      className="btn-primary" 
                      style={{ padding: '8px 16px', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, opacity: 0.5, cursor: 'not-allowed' }}
                      disabled
                      title="Select an active artwork candidate below to proceed to publishing"
                    >
                      <span>Continue to Publishing</span>
                      <IconArrowRight size={14} />
                    </button>
                  </div>
                ) : heroAssetLoadFailed ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.74rem', color: '#D97706', fontWeight: 600 }}>Asset Unavailable</span>
                    <button 
                      className="btn-primary" 
                      style={{ padding: '8px 16px', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, opacity: 0.5, cursor: 'not-allowed' }}
                      disabled
                      title="Please choose an accessible artwork candidate below"
                    >
                      <span>Continue to Publishing</span>
                      <IconArrowRight size={14} />
                    </button>
                  </div>
                ) : (
                  <button 
                    className="btn-primary" 
                    style={{ padding: '8px 18px', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
                    onClick={handleProceedToPublish}
                  >
                    <span>Continue to Publishing</span>
                    <IconArrowRight size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STAGE 1: BRIEF INGESTION (ENCOURAGING FILE UPLOADS)            */}
      {/* ============================================================== */}
      {/* ============================================================== */}
      {/* STAGE 1: CAMPAIGN BRIEF INGESTION (3 CLEAR ENTRY PATHS)        */}
      {/* ============================================================== */}
      {currentStage === 'brief' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Header Card */}
          <div className="glass-card" style={{ padding: '24px 28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' }}>
              <div>
                <span className="badge badge-cyan" style={{ fontSize: '0.74rem', marginBottom: '6px' }}>
                  Stage 1: Brief Ingestion
                </span>
                <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Originate Your Campaign Brief
                </h2>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: '6px 0 0 0', maxWidth: '780px', lineHeight: 1.5 }}>
                  Select how you want to seed creative direction. Opportunities staged from the Intelligence Radar provide verified audience demand and content gaps.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn-outline"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '6px 12px' }}
                  onClick={handleStartNewCampaign}
                >
                  <span>+ Fresh Campaign</span>
                </button>
              </div>
            </div>

            {/* 3 Clear Selectable Entry Paths */}
            <div className="entry-selector-grid">
              {/* Option 1: Intelligence Opportunity (Recommended) */}
              <div
                className={`entry-option-card ${entryMode === 'opportunity' ? 'selected' : ''}`}
                onClick={() => {
                  setEntryMode('opportunity');
                }}
                tabIndex={0}
                role="button"
                aria-pressed={entryMode === 'opportunity'}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setEntryMode('opportunity'); }}
              >
                <div>
                  <div className="entry-card-header">
                    <div className="entry-card-icon">
                      <IconSparkles size={20} />
                    </div>
                    <span className="badge badge-emerald" style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 6px' }}>
                      RECOMMENDED
                    </span>
                  </div>
                  <div className="entry-card-title">Use an Intelligence Opportunity</div>
                  <div className="entry-card-desc">
                    Deploy pre-qualified breakout trends with verified audience demand, search velocity, and competitor content gap analysis.
                  </div>
                </div>
                <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem' }}>
                  <span style={{ fontWeight: 600, color: entryMode === 'opportunity' ? 'var(--action-primary)' : 'var(--text-muted)' }}>
                    {activeOpportunity ? `✓ ${activeOpportunity.title.slice(0, 26)}...` : 'Choose opportunity'}
                  </span>
                  <span style={{ color: entryMode === 'opportunity' ? 'var(--action-primary)' : '#94A3B8' }}>
                    {entryMode === 'opportunity' ? '● Active' : 'Select →'}
                  </span>
                </div>
              </div>

              {/* Option 2: Upload a Brief Document */}
              <div
                className={`entry-option-card ${entryMode === 'upload' ? 'selected' : ''}`}
                onClick={() => {
                  setEntryMode('upload');
                }}
                tabIndex={0}
                role="button"
                aria-pressed={entryMode === 'upload'}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setEntryMode('upload'); }}
              >
                <div>
                  <div className="entry-card-header">
                    <div className="entry-card-icon">
                      <IconUpload size={20} />
                    </div>
                    <span className="badge" style={{ fontSize: '0.68rem', background: '#F1F5F9', color: '#475569', padding: '2px 6px' }}>
                      PDF • DOCX • MD
                    </span>
                  </div>
                  <div className="entry-card-title">Upload a Brief</div>
                  <div className="entry-card-desc">
                    Import an existing editorial dossier, client PDF, Word document (.docx), or strategy notes to extract directives automatically.
                  </div>
                </div>
                <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem' }}>
                  <span style={{ fontWeight: 600, color: entryMode === 'upload' ? 'var(--action-primary)' : 'var(--text-muted)' }}>
                    {briefFileName ? `✓ ${briefFileName.slice(0, 24)}...` : 'Drop or browse files'}
                  </span>
                  <span style={{ color: entryMode === 'upload' ? 'var(--action-primary)' : '#94A3B8' }}>
                    {entryMode === 'upload' ? '● Active' : 'Select →'}
                  </span>
                </div>
              </div>

              {/* Option 3: Write a Manual Brief */}
              <div
                className={`entry-option-card ${entryMode === 'manual' ? 'selected' : ''}`}
                onClick={() => {
                  setEntryMode('manual');
                }}
                tabIndex={0}
                role="button"
                aria-pressed={entryMode === 'manual'}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setEntryMode('manual'); }}
              >
                <div>
                  <div className="entry-card-header">
                    <div className="entry-card-icon">
                      <IconFileText size={20} />
                    </div>
                    <span className="badge" style={{ fontSize: '0.68rem', background: '#F1F5F9', color: '#475569', padding: '2px 6px' }}>
                      CUSTOM
                    </span>
                  </div>
                  <div className="entry-card-title">Write a Brief</div>
                  <div className="entry-card-desc">
                    Formulate campaign subject, strategic objectives, target audience personas, and creative notes in structured fields.
                  </div>
                </div>
                <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.76rem' }}>
                  <span style={{ fontWeight: 600, color: entryMode === 'manual' ? 'var(--action-primary)' : 'var(--text-muted)' }}>
                    {manualTopic || manualObjective ? 'Structured Brief' : 'Enter details'}
                  </span>
                  <span style={{ color: entryMode === 'manual' ? 'var(--action-primary)' : '#94A3B8' }}>
                    {entryMode === 'manual' ? '● Active' : 'Select →'}
                  </span>
                </div>
              </div>
            </div>

            {/* PATH 1 CONTENT: Intelligence Opportunity */}
            {entryMode === 'opportunity' && (
              <div className="animate-fade-in" style={{ marginTop: '10px' }}>
                {oppNotFoundError && (
                  <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <IconAlertTriangle size={18} color="#D97706" />
                    <span style={{ fontSize: '0.84rem', color: '#92400E' }}>
                      The opportunity previously linked to this campaign is no longer available in the active radar dataset. Please choose another opportunity below or switch to Upload/Write a brief.
                    </span>
                  </div>
                )}

                {/* Staged & Confirmed Opportunity Banner */}
                {activeOpportunity && !showOppPicker ? (
                  <div className="staged-confirmed-card active-opp">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span className="badge badge-emerald" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
                          <IconCheck size={13} />
                          <span>Active Intelligence Opportunity</span>
                        </span>
                        <span className="badge badge-cyan" style={{ fontSize: '0.75rem' }}>
                          Score: {Math.round(activeOpportunity.score * 100)}%
                        </span>
                        {activeOpportunity.audience_label && (
                          <span className="badge badge-purple" style={{ fontSize: '0.75rem' }}>
                            {activeOpportunity.audience_label}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        className="btn-outline"
                        style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        onClick={() => setShowOppPicker(true)}
                      >
                        <IconRefresh size={13} />
                        <span>Change Opportunity</span>
                      </button>
                    </div>

                    <div>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px 0', lineHeight: 1.4 }}>
                        {activeOpportunity.title}
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', marginTop: '12px' }}>
                        <div style={{ background: '#FFFFFF', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                            Strategic Angle &amp; Rationale
                          </div>
                          <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
                            {activeOpportunity.strategic_rationale || activeOpportunity.recommended_angle || 'Capitalize on accelerating search interest with high-utility content.'}
                          </div>
                        </div>

                        <div style={{ background: '#FFFFFF', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                            Identified Content Gap / Void
                          </div>
                          <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                            {activeOpportunity.content_gap || 'Unsatisfied search volume with fragmented competitor media.'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', paddingTop: '8px', borderTop: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#1A73E8', fontWeight: 600 }}>
                        <IconSparkles size={14} color="#1A73E8" />
                        <span>Ready: Will generate 3 distinct concept angles from this verified opportunity.</span>
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn-outline"
                          style={{ padding: '5px 10px', fontSize: '0.76rem' }}
                          onClick={() => onSelectBrief(activeOpportunity)}
                        >
                          View Full Brief
                        </button>
                        {onDownloadPdf && (
                          <button
                            type="button"
                            className="btn-outline"
                            style={{ padding: '5px 10px', fontSize: '0.76rem' }}
                            onClick={() => onDownloadPdf(activeOpportunity.opportunity_id)}
                          >
                            PDF
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Opportunity Search & Picker Panel */
                  <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {activeOpportunity ? 'Choose a Different Intelligence Opportunity' : 'Select an Intelligence Opportunity'}
                        </h4>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          Browse verified breakout opportunities from your workspace radar.
                        </div>
                      </div>

                      {activeOpportunity && (
                        <button
                          type="button"
                          className="btn-outline"
                          style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                          onClick={() => setShowOppPicker(false)}
                        >
                          Keep Current Opportunity
                        </button>
                      )}
                    </div>

                    {/* Search & Filter Controls */}
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
                      <div style={{ position: 'relative', flex: '1 1 260px' }}>
                        <IconSearch size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                        <input
                          type="text"
                          className="input-glass"
                          style={{ paddingLeft: '32px', fontSize: '0.84rem' }}
                          placeholder="Search opportunities by title, topic, or audience..."
                          value={oppSearchQuery}
                          onChange={(e) => setOppSearchQuery(e.target.value)}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        {[
                          { id: 'all', label: `All (${opportunities.length})` },
                          { id: 'staged', label: `Staged (${selectedOpps.length})` },
                          { id: 'high_score', label: `High Score (${highScoreOpps.length})` }
                        ].map(f => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setOppFilter(f.id as any)}
                            style={{
                              padding: '5px 12px',
                              borderRadius: '6px',
                              fontSize: '0.78rem',
                              border: oppFilter === f.id ? '1.5px solid #1A73E8' : '1px solid var(--border-subtle)',
                              background: oppFilter === f.id ? '#E8F0FE' : '#FFFFFF',
                              color: oppFilter === f.id ? '#1A73E8' : 'var(--text-secondary)',
                              fontWeight: oppFilter === f.id ? 700 : 500,
                              cursor: 'pointer'
                            }}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Opportunities Grid */}
                    {filteredOpportunities.length === 0 ? (
                      <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                        {opportunities.length === 0 ? (
                          <span>No intelligence opportunities found. Run an investigation from Intelligence Radar, or switch to Upload/Write a Brief.</span>
                        ) : (
                          <span>No opportunities match your filter. Try clearing the search query.</span>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '12px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
                        {filteredOpportunities.map(opp => {
                          const isSelected = activeOpportunity?.opportunity_id === opp.opportunity_id;
                          return (
                            <div
                              key={opp.opportunity_id}
                              onClick={() => handleSwitchToOpportunity(opp)}
                              style={{
                                padding: '14px',
                                borderRadius: '8px',
                                background: isSelected ? '#EBF3FE' : '#FFFFFF',
                                border: isSelected ? '2px solid #1A73E8' : '1px solid var(--border-subtle)',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                transition: 'all 0.15s ease',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                              }}
                            >
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                  <span className="badge badge-purple" style={{ fontSize: '0.72rem' }}>
                                    {opp.audience_label || 'Demographic'}
                                  </span>
                                  <span className="badge badge-cyan" style={{ fontSize: '0.72rem', flexShrink: 0 }}>
                                    Score: {Math.round(opp.score * 100)}%
                                  </span>
                                </div>
                                <h5 style={{ fontSize: '0.92rem', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-primary)', lineHeight: 1.35 }}>
                                  {opp.title}
                                </h5>
                                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>
                                  {opp.content_gap || opp.recommended_angle}
                                </p>
                              </div>

                              <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid #F1F5F9' }}>
                                <span style={{ fontSize: '0.78rem', color: isSelected ? '#1A73E8' : '#64748B', fontWeight: isSelected ? 700 : 500 }}>
                                  {isSelected ? '✓ Selected' : 'Click to Select'}
                                </span>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button
                                    type="button"
                                    className="btn-outline"
                                    style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                                    onClick={(e) => { e.stopPropagation(); onSelectBrief(opp); }}
                                  >
                                    View Brief
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* PATH 2 CONTENT: Upload a Brief Document */}
            {entryMode === 'upload' && (
              <div className="animate-fade-in" style={{ marginTop: '10px' }}>
                {briefUploadError && (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.84rem', color: '#991B1B' }}>
                    <IconAlertTriangle size={18} color="#DC2626" />
                    <span>{briefUploadError}</span>
                  </div>
                )}

                {briefFileName ? (
                  /* Uploaded File Validated Card */
                  <div style={{ background: '#FFFFFF', border: '1.5px solid #1A73E8', borderRadius: '10px', padding: '20px 24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#E8F0FE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1A73E8' }}>
                          <IconFileText size={24} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {briefFileName}
                            </span>
                            <span className="badge badge-emerald" style={{ fontSize: '0.72rem' }}>
                              ✓ Ready
                            </span>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                            {briefFileSize ? `${(briefFileSize / 1024).toFixed(1)} KB` : 'Document'} • Format: {briefFileMime?.split('/')[1]?.toUpperCase() || 'DOCUMENT'}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <label 
                          htmlFor="replace-brief-file"
                          className="btn-outline"
                          style={{ padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                          <IconUpload size={13} />
                          <span>Replace File</span>
                          <input 
                            id="replace-brief-file"
                            type="file"
                            accept=".pdf,.docx,.doc,.md,.txt"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                handleBriefFileUpload(e.target.files[0]);
                              }
                            }}
                          />
                        </label>

                        <button
                          type="button"
                          className="btn-outline"
                          style={{ padding: '6px 12px', fontSize: '0.8rem', color: '#DC2626' }}
                          onClick={handleClearBriefFile}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Compact Drag & Drop Target */
                  <label 
                    htmlFor="compact-brief-upload" 
                    className="studio-dropzone active"
                    style={{
                      display: 'block',
                      padding: '32px 24px',
                      textAlign: 'center',
                      borderRadius: '10px',
                      background: '#F8FAFF',
                      border: '2px dashed #93C5FD',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <input 
                      id="compact-brief-upload" 
                      type="file" 
                      accept=".pdf,.docx,.doc,.md,.txt" 
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleBriefFileUpload(e.target.files[0]);
                        }
                      }}
                    />

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#FFFFFF', border: '1px solid #CBD5E1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1A73E8' }}>
                        <IconUpload size={22} />
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Drag &amp; drop brief file here, or click to browse
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#64748B' }}>
                        Supported formats: PDF (.pdf), Word (.docx), Markdown (.md), or Plain text (.txt) • Up to 25 MB
                      </div>
                    </div>
                  </label>
                )}
              </div>
            )}

            {/* PATH 3 CONTENT: Structured Manual Brief */}
            {entryMode === 'manual' && (
              <div className="animate-fade-in" style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                  <div>
                    <label className="subheading-label">
                      Campaign Subject or Headline Trend <span style={{ color: '#DC2626' }}>*</span>
                    </label>
                    <input 
                      type="text"
                      className="input-glass"
                      placeholder="e.g. Modern Tactical Pressing &amp; Midfielder Renaissance"
                      value={manualTopic}
                      onChange={(e) => handleManualFieldChange('topic', e.target.value)}
                    />
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      The overarching trend, product subject, or campaign topic.
                    </div>
                  </div>

                  <div>
                    <label className="subheading-label">
                      Intended Target Audience / Persona
                    </label>
                    <input 
                      type="text"
                      className="input-glass"
                      placeholder="e.g. Gen-Z Football Creators, Sports Analysts"
                      value={targetAudienceInput}
                      onChange={(e) => handleManualFieldChange('audience', e.target.value)}
                    />
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Who this campaign speaks to (demographics, community, or interests).
                    </div>
                  </div>
                </div>

                <div>
                  <label className="subheading-label">
                    Primary Campaign Objective or Key Takeaway
                  </label>
                  <textarea 
                    className="input-glass"
                    rows={2}
                    placeholder="e.g. Educate creators on tactical pressing evolution and position our analysis tool as the premier solution..."
                    value={manualObjective}
                    onChange={(e) => handleManualFieldChange('objective', e.target.value)}
                    style={{ fontSize: '0.86rem' }}
                  />
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    What core message, call-to-action, or problem should be solved?
                  </div>
                </div>

                <div>
                  <label className="subheading-label">
                    Creative Notes &amp; Angle Directives (Optional)
                  </label>
                  <textarea 
                    className="input-glass"
                    rows={3}
                    placeholder="e.g. Tone should be sharp and authoritative. Contrast 2010s tiki-taka with 2026 vertical transitions..."
                    value={manualNotes}
                    onChange={(e) => handleManualFieldChange('notes', e.target.value)}
                    style={{ fontSize: '0.86rem' }}
                  />
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Specific angles, pain points, or brand guidelines.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* CAMPAIGN SETTINGS (Compact & Collapsible) */}
          <div className="campaign-settings-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Campaign Parameters &amp; Preferences
                  </span>
                  <span className="badge" style={{ fontSize: '0.72rem', background: '#F1F5F9', color: '#475569' }}>
                    {numAssetsConfig} Images • {campaignGoal.toUpperCase()} • {brandTone.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Audience: <strong>{targetAudienceInput || activeOpportunity?.audience_label || 'Auto-detected'}</strong>
                </div>
              </div>

              <button
                type="button"
                className="btn-outline"
                style={{ fontSize: '0.78rem', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
              >
                <span>{isSettingsExpanded ? 'Hide Settings ▴' : 'Customize Settings ▾'}</span>
              </button>
            </div>

            {isSettingsExpanded && (
              <div className="animate-fade-in" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
                <div className="grid-3" style={{ gap: '14px', marginBottom: '14px' }}>
                  <div>
                    <label className="subheading-label">Campaign Goal</label>
                    <select 
                      className="select-glass"
                      value={campaignGoal}
                      onChange={(e) => setCampaignGoal(e.target.value)}
                    >
                      <option value="engagement">High Social Engagement &amp; Buzz</option>
                      <option value="awareness">Brand Awareness &amp; Reach</option>
                      <option value="conversion">Conversion &amp; Click-Through</option>
                      <option value="education">Audience Education &amp; Trust</option>
                    </select>
                  </div>

                  <div>
                    <label className="subheading-label">Brand Tone</label>
                    <select 
                      className="select-glass"
                      value={brandTone}
                      onChange={(e) => setBrandTone(e.target.value)}
                    >
                      <option value="authoritative">Authoritative &amp; Evidence-Backed</option>
                      <option value="playful">Playful, Bold &amp; Provocative</option>
                      <option value="inspiring">Inspiring &amp; Emotive</option>
                      <option value="urgent">Urgent &amp; Trend-Jacking</option>
                    </select>
                  </div>

                  <div>
                    <label className="subheading-label">Visual Assets to Synthesize</label>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      {[2, 4].map(count => (
                        <button
                          key={count}
                          type="button"
                          onClick={() => {
                            setNumAssetsConfig(count);
                            setNumImagesToGenerate(count);
                          }}
                          style={{
                            flex: 1,
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: numAssetsConfig === count ? '2px solid #1A73E8' : '1px solid var(--border-subtle)',
                            background: numAssetsConfig === count ? '#E8F0FE' : '#FFFFFF',
                            color: numAssetsConfig === count ? '#1A73E8' : 'var(--text-primary)',
                            fontWeight: numAssetsConfig === count ? 700 : 500,
                            cursor: 'pointer',
                            fontSize: '0.82rem'
                          }}
                        >
                          {count} Images {count === 4 ? '(Default)' : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* PROGRESSION & VALIDATION BAR */}
          <div className="progression-bar-card">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {readiness.valid ? (
                  <span className="badge badge-emerald" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.76rem', fontWeight: 700 }}>
                    <IconCheck size={13} />
                    <span>Ready for Concept Generation</span>
                  </span>
                ) : (
                  <span className="badge badge-amber" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.76rem', fontWeight: 700 }}>
                    <IconAlertTriangle size={13} />
                    <span>Prerequisite Required</span>
                  </span>
                )}
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {readiness.title}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {readiness.desc}
              </div>
            </div>

            <button 
              type="button"
              className="btn-primary" 
              style={{
                padding: '14px 28px',
                fontSize: '0.96rem',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontWeight: 700,
                opacity: !isBriefReady ? 0.6 : 1,
                cursor: !isBriefReady ? 'not-allowed' : 'pointer'
              }}
              onClick={handleGenerateConcepts}
              disabled={!isBriefReady || isGeneratingConcepts}
            >
              {isGeneratingConcepts ? (
                <>
                  <span className="pulsing-cook-dot" style={{ background: '#FFFFFF' }} />
                  <span>Synthesizing Concepts (3 Angles)...</span>
                </>
              ) : (
                <>
                  <IconSparkles size={18} />
                  <span>Continue to Concepts (3 Angles) →</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STAGE 2: CHOOSE CREATIVE CONCEPT                               */}
      {/* ============================================================== */}
      {currentStage === 'concepts' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Header Card with Campaign Context */}
          <div className="glass-card" style={{ padding: '24px 28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px', marginBottom: '18px' }}>
              <div>
                <span className="badge badge-cyan" style={{ fontSize: '0.74rem', marginBottom: '6px' }}>
                  Stage 2: Strategic Concepts
                </span>
                <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Select a Creative Campaign Concept
                </h2>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: '6px 0 0 0', maxWidth: '820px', lineHeight: 1.5 }}>
                  Three distinct strategic editorial angles synthesized from your brief. Compare the strategic hook, rationale, and visual direction below, then select the concept that best aligns with your goals.
                </p>
              </div>

              <button 
                type="button"
                className="btn-outline" 
                style={{ padding: '8px 16px', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                onClick={handleGenerateConcepts}
                disabled={isGeneratingConcepts}
                title="Regenerate all 3 strategic concepts from the current brief"
              >
                <IconRefresh size={14} className={isGeneratingConcepts ? 'rotating-spinner' : ''} />
                <span>{isGeneratingConcepts ? 'Synthesizing...' : 'Re-Generate Concepts'}</span>
              </button>
            </div>

            {/* Strategic Context Strip */}
            {conceptsData && (
              <div style={{ background: '#F8FAFC', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', fontSize: '0.82rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.7rem' }}>Campaign Topic:</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{conceptsData.campaign_title || campaignTitle}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.7rem' }}>Target Audience:</span>
                  <span className="badge badge-purple" style={{ fontSize: '0.72rem' }}>{conceptsData.target_audience || targetAudienceInput || 'Target Demographic'}</span>
                </div>
                {conceptsData.core_friction_point && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 280px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.7rem', flexShrink: 0 }}>Core Friction:</span>
                    <span style={{ color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {conceptsData.core_friction_point}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3 Consistent Side-by-Side Strategic Concept Cards */}
          <div className="concept-cards-grid">
            {conceptsData?.variants.map((v) => {
              const isSelected = activeConcept?.id === v.id;
              const badgeClass = v.variant_type === 'trend_jacker' ? 'badge-amber' : v.variant_type === 'educational_solution' ? 'badge-cyan' : 'badge-emerald';
              const approachTag = v.variant_type === 'trend_jacker' 
                ? 'Urgency & Tension' 
                : v.variant_type === 'educational_solution' 
                ? 'Value & Utility' 
                : 'Narrative & Empathy';

              return (
                <div 
                  key={v.id}
                  className={`concept-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelectConcept(v)}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSelected}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectConcept(v); }}
                >
                  <div>
                    {/* Concept Name & Approach Hierarchy */}
                    <div className="concept-card-top">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span className={`badge ${badgeClass}`} style={{ fontSize: '0.74rem', fontWeight: 700 }}>
                          {v.variant_label}
                        </span>
                        <span className="badge" style={{ background: '#F1F5F9', color: '#475569', fontSize: '0.68rem', fontWeight: 600 }}>
                          {approachTag}
                        </span>
                      </div>

                      {v.audience_fit_score !== undefined && (
                        <span className="badge badge-emerald" style={{ fontSize: '0.72rem', flexShrink: 0 }}>
                          Fit: {Math.round(v.audience_fit_score * 100)}%
                        </span>
                      )}
                    </div>

                    {/* Headline - Natural Wrapping */}
                    <h3 className="concept-headline">
                      {v.title}
                    </h3>

                    {/* Primary Hook Card */}
                    <div className="concept-hook-card">
                      <div className="concept-hook-label">Scroll-Stopping Hook</div>
                      <div className="concept-hook-text">"{v.hook}"</div>
                    </div>

                    {/* Strategic Angle & Editorial Rationale */}
                    <div style={{ marginBottom: '12px' }}>
                      <div className="concept-section-title">Strategic Rationale</div>
                      <div className="concept-section-text">
                        {v.angle}
                      </div>
                    </div>

                    {/* Visual Generation Direction */}
                    <div className="concept-visual-direction">
                      <div style={{ fontWeight: 700, marginBottom: '3px', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                        Visual Direction:
                      </div>
                      <div style={{ fontSize: '0.8rem', lineHeight: 1.4 }}>
                        "{v.visual_direction}"
                      </div>
                    </div>

                    {/* Omni-Channel Adaptations Preview */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                      <div className="concept-preview-row">
                        <IconInstagram size={15} color="#E1306C" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)', marginRight: '4px' }}>Instagram:</span>
                          <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {v.instagram_copy}
                          </span>
                        </div>
                      </div>

                      <div className="concept-preview-row">
                        <IconMail size={15} color="#004B93" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)', marginRight: '4px' }}>Email Subject:</span>
                          <span style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {v.email_subject}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Selection Action & Inspection Button */}
                  <div className="concept-card-actions">
                    {isSelected ? (
                      <button 
                        type="button"
                        className="btn-primary"
                        style={{ 
                          flex: '1 1 140px', 
                          padding: '9px 12px', 
                          fontSize: '0.82rem', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          gap: '6px',
                          whiteSpace: 'nowrap',
                          cursor: 'default'
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <IconCheck size={15} />
                        <span>Selected Concept</span>
                      </button>
                    ) : (
                      <button 
                        type="button"
                        className="btn-outline"
                        style={{ 
                          flex: '1 1 140px', 
                          padding: '9px 12px', 
                          fontSize: '0.82rem', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          gap: '6px',
                          whiteSpace: 'nowrap'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectConcept(v);
                        }}
                      >
                        <span>Use this concept</span>
                      </button>
                    )}

                    <button 
                      type="button"
                      className="btn-outline"
                      style={{ 
                        padding: '9px 12px', 
                        fontSize: '0.82rem', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        whiteSpace: 'nowrap'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setInspectingConcept(v);
                      }}
                      title="Inspect full editorial rationale, complete social captions, email body, and visual prompts"
                    >
                      <IconFileText size={14} />
                      <span>Full Concept</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* STAGE 2 PROGRESSION & SELECTION CONFIRMATION BAR */}
          <div className="progression-bar-card">
            <div style={{ flex: '1 1 320px' }}>
              {activeConcept ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span className="badge badge-emerald" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.76rem', fontWeight: 700 }}>
                      <IconCheck size={13} />
                      <span>Selected Concept</span>
                    </span>
                    <span style={{ fontSize: '0.94rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {activeConcept.title}
                    </span>
                    <span className="badge badge-cyan" style={{ fontSize: '0.72rem' }}>
                      {activeConcept.variant_label}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.45 }}>
                    Proceeding will enter Campaign Image Studio and synthesize {numAssetsConfig} high-resolution visual assets tailored to this concept's visual direction.
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="badge badge-amber" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.76rem', fontWeight: 700 }}>
                      <IconAlertTriangle size={13} />
                      <span>Action Required</span>
                    </span>
                    <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Please select one of the 3 campaign concepts above to continue.
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-outline"
                style={{ padding: '12px 18px', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => setCurrentStage('brief')}
              >
                <span>← Back to Brief</span>
              </button>

              <button
                type="button"
                className="btn-primary"
                style={{
                  padding: '12px 24px',
                  fontSize: '0.92rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 700,
                  opacity: (!activeConcept || isGeneratingImages) ? 0.65 : 1,
                  cursor: (!activeConcept || isGeneratingImages) ? 'not-allowed' : 'pointer'
                }}
                onClick={handleProceedToArtworkGeneration}
                disabled={!activeConcept || isGeneratingImages}
              >
                {isGeneratingImages ? (
                  <>
                    <span className="pulsing-cook-dot" style={{ background: '#FFFFFF' }} />
                    <span>Synthesizing {numAssetsConfig} Images...</span>
                  </>
                ) : (
                  <>
                    <IconSparkles size={16} />
                    <span>
                      {generatedImages.length > 0 && artworkConceptIdRef.current === activeConcept?.id
                        ? 'Continue to Artwork Studio →'
                        : `Continue to Artwork Generation (${numAssetsConfig} Images) →`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* CONCEPT CHANGE CONFIRMATION MODAL (Requirement 6)               */}
      {/* ============================================================== */}
      {conceptChangePending && (
        <div className="concept-modal-backdrop" onClick={handleCancelConceptChange}>
          <div className="concept-change-dialog animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '16px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#FFFBEB', border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D97706', flexShrink: 0 }}>
                <IconAlertTriangle size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Change Selected Campaign Concept?
                </h3>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.45 }}>
                  You currently have visual artwork generated for <strong>"{artworkConceptTitleRef.current || activeConcept?.title}"</strong>.
                </div>
              </div>
            </div>

            <div style={{ background: '#F8FAFC', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px', marginBottom: '20px', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Switching to <strong>"{conceptChangePending.title}"</strong> ({conceptChangePending.variant_label}) introduces a different strategic angle and visual direction. How would you like to handle your visual assets?
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                className="btn-primary"
                style={{ padding: '12px 18px', fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 700 }}
                onClick={handleConfirmChangeConceptWithFreshArtwork}
              >
                <IconSparkles size={16} />
                <span>Generate Fresh Artwork for this Concept ({numAssetsConfig} Images)</span>
              </button>

              <button
                type="button"
                className="btn-outline"
                style={{ padding: '11px 18px', fontSize: '0.86rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                onClick={handleConfirmChangeConceptKeepArtwork}
              >
                <IconCheck size={15} />
                <span>Keep Existing Artwork &amp; Update Concept Copy</span>
              </button>

              <button
                type="button"
                className="btn-outline"
                style={{ padding: '9px 18px', fontSize: '0.82rem', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={handleCancelConceptChange}
              >
                <span>Cancel</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* FULL CONCEPT DETAILS MODAL (Requirement 3 & 4)                  */}
      {/* ============================================================== */}
      {inspectingConcept && (
        <div className="concept-modal-backdrop" onClick={() => setInspectingConcept(null)}>
          <div className="concept-details-modal animate-fade-in" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', background: '#FAFCFF' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <span className="badge badge-cyan" style={{ fontSize: '0.74rem', fontWeight: 700 }}>
                    {inspectingConcept.variant_label}
                  </span>
                  <span className="badge" style={{ background: '#F1F5F9', color: '#475569', fontSize: '0.7rem' }}>
                    Type: {inspectingConcept.variant_type}
                  </span>
                  {inspectingConcept.audience_fit_score !== undefined && (
                    <span className="badge badge-emerald" style={{ fontSize: '0.72rem' }}>
                      Audience Fit: {Math.round(inspectingConcept.audience_fit_score * 100)}%
                    </span>
                  )}
                </div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.35 }}>
                  {inspectingConcept.title}
                </h3>
              </div>

              <button
                type="button"
                className="btn-outline"
                style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '6px' }}
                onClick={() => setInspectingConcept(null)}
              >
                Close ✕
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
              {/* Hook & Strategic Angle */}
              <div>
                <div className="concept-hook-label" style={{ marginBottom: '6px' }}>Scroll-Stopping Hook</div>
                <div style={{ background: '#F8FAFC', borderLeft: '4px solid var(--action-primary)', borderRadius: '6px', padding: '12px 16px', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                  "{inspectingConcept.hook}"
                </div>
              </div>

              <div>
                <div className="concept-section-title">Strategic Rationale &amp; Editorial Angle</div>
                <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.6, background: '#FFFFFF', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px 16px' }}>
                  {inspectingConcept.angle}
                </div>
              </div>

              {/* Visual Direction & Search Cues */}
              <div style={{ background: '#EBF3FE', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '16px' }}>
                <div style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', color: '#1E40AF', letterSpacing: '0.03em', marginBottom: '6px' }}>
                  Visual Styling &amp; Image Directives
                </div>
                <div style={{ fontSize: '0.88rem', color: '#1E3A8A', lineHeight: 1.5, marginBottom: '10px' }}>
                  "{inspectingConcept.visual_direction}"
                </div>
                <div style={{ fontSize: '0.78rem', color: '#3B82F6', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <IconSearch size={14} />
                  <span>Optimal Reference Query: <strong>{inspectingConcept.search_query}</strong></span>
                </div>
              </div>

              {/* Platform Copy Sections */}
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Omni-Channel Campaign Copy
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Instagram Caption */}
                  <div style={{ background: '#FFFFFF', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.86rem', color: '#E1306C' }}>
                        <IconInstagram size={16} />
                        <span>Instagram Caption &amp; Hashtags</span>
                      </div>
                      <button
                        type="button"
                        className="btn-outline"
                        style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                        onClick={() => copyToClipboard(inspectingConcept.instagram_copy, 'Instagram caption')}
                      >
                        <IconCopy size={13} />
                        <span>Copy Caption</span>
                      </button>
                    </div>
                    <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {inspectingConcept.instagram_copy}
                    </div>
                  </div>

                  {/* Facebook Copy */}
                  {inspectingConcept.facebook_copy && (
                    <div style={{ background: '#FFFFFF', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.86rem', color: '#1877F2' }}>
                          <IconFacebook size={16} />
                          <span>Facebook Post Copy</span>
                        </div>
                        <button
                          type="button"
                          className="btn-outline"
                          style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                          onClick={() => copyToClipboard(inspectingConcept.facebook_copy, 'Facebook copy')}
                        >
                          <IconCopy size={13} />
                          <span>Copy Post</span>
                        </button>
                      </div>
                      <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {inspectingConcept.facebook_copy}
                      </div>
                    </div>
                  )}

                  {/* Email Campaign */}
                  <div style={{ background: '#FFFFFF', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '0.86rem', color: '#004B93' }}>
                        <IconMail size={16} />
                        <span>Email Newsletter / Broadcast</span>
                      </div>
                      <button
                        type="button"
                        className="btn-outline"
                        style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                        onClick={() => copyToClipboard(`Subject: ${inspectingConcept.email_subject}\n\n${inspectingConcept.email_body}`, 'Email copy')}
                      >
                        <IconCopy size={13} />
                        <span>Copy Email</span>
                      </button>
                    </div>
                    <div style={{ fontSize: '0.82rem', marginBottom: '8px', color: 'var(--text-secondary)' }}>
                      <strong>Subject Line:</strong> {inspectingConcept.email_subject}
                    </div>
                    {inspectingConcept.email_preview && (
                      <div style={{ fontSize: '0.8rem', marginBottom: '10px', color: '#64748B' }}>
                        <strong>Preheader:</strong> {inspectingConcept.email_preview}
                      </div>
                    )}
                    <div style={{ fontSize: '0.84rem', color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', background: '#F8FAFC', padding: '12px', borderRadius: '6px' }}>
                      {inspectingConcept.email_body}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-subtle)', background: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                {activeConcept?.id === inspectingConcept.id ? (
                  <span className="badge badge-emerald" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', fontWeight: 700 }}>
                    <IconCheck size={14} />
                    <span>Currently Selected Campaign Concept</span>
                  </span>
                ) : (
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Not currently selected for downstream artwork generation.
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-outline"
                  style={{ padding: '8px 16px', fontSize: '0.84rem' }}
                  onClick={() => setInspectingConcept(null)}
                >
                  Close
                </button>

                {activeConcept?.id !== inspectingConcept.id && (
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ padding: '8px 18px', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
                    onClick={() => {
                      handleSelectConcept(inspectingConcept);
                      setInspectingConcept(null);
                    }}
                  >
                    <IconCheck size={14} />
                    <span>Use This Concept</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STAGE 3: IMAGE GENERATION (HIGHLIGHT) & OPTIONAL REFERENCE AID */}
      {/* ============================================================== */}
      {currentStage === 'assets' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* OPTIONAL AID: Recommended Visual References */}
          <div className="glass-card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '14px' }}>
              <div style={{ maxWidth: '580px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="badge badge-cyan" style={{ fontSize: '0.72rem' }}>Inspiration Aid</span>
                  <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                    Recommended Visual References ({curatedAssets.length})
                  </h4>
                  {curationProviderDisplay && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: '#F1F5F9', padding: '2px 8px', borderRadius: '4px' }}>
                      Source: {curationProviderDisplay}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                  Explore visual references for your campaign's style, setting, and composition. Select any reference to ground your visual generation in verified trend context.
                </p>
              </div>

              {/* Usable query field and clearly labelled Search References action */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', flex: '1 1 320px', justifyContent: 'flex-end' }}>
                <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: '420px', minWidth: '200px' }}>
                  <IconSearch size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
                  <input 
                    type="text"
                    className="input-glass"
                    style={{ width: '100%', padding: '7px 28px 7px 30px', fontSize: '0.82rem', boxSizing: 'border-box' }}
                    value={searchQueryInput}
                    title={searchQueryInput ? `Current search query: "${searchQueryInput}"` : 'Enter keywords to find visual references'}
                    onChange={(e) => setSearchQueryInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        triggerCurateAssets(searchQueryInput, numAssetsConfig, {
                          headline: activeConcept?.title,
                          topic: activeOpportunity?.title,
                          visual_direction: activeConcept?.visual_direction
                        });
                      }
                    }}
                    placeholder="Search visual references..."
                  />
                  {searchQueryInput && (
                    <button
                      type="button"
                      onClick={() => setSearchQueryInput('')}
                      title="Clear search query"
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '2px',
                        fontSize: '14px',
                        lineHeight: 1
                      }}
                    >
                      &times;
                    </button>
                  )}
                </div>
                <input
                  type="file"
                  ref={referenceFileInputRef}
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleUploadReferenceImage}
                />
                <button 
                  type="button"
                  className="btn-outline" 
                  style={{
                    padding: '7px 14px',
                    fontSize: '0.80rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 600,
                    flexShrink: 0,
                    background: '#FFFFFF',
                    borderColor: '#CBD5E1',
                    color: 'var(--text-primary)'
                  }}
                  onClick={() => referenceFileInputRef.current?.click()}
                  title="Upload your own reference image (JPG, PNG, WebP)"
                >
                  <IconUpload size={13} color="var(--action-primary)" />
                  <span>Upload Reference Image</span>
                </button>
                <button 
                  type="button"
                  className="btn-primary" 
                  style={{ padding: '7px 14px', fontSize: '0.80rem', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, flexShrink: 0 }}
                  onClick={() => triggerCurateAssets(searchQueryInput, numAssetsConfig, {
                    headline: activeConcept?.title,
                    topic: activeOpportunity?.title,
                    visual_direction: activeConcept?.visual_direction
                  })}
                  disabled={isCuratingAssets}
                >
                  <IconSparkles size={13} className={isCuratingAssets ? 'spin' : ''} />
                  <span>{isCuratingAssets ? 'Searching...' : 'Search References'}</span>
                </button>
              </div>
            </div>

            {/* Curated Reference Cards Adaptive Responsive Layout */}
            {isCuratingAssets ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 
                  (numAssetsConfig || 2) <= 1 
                    ? 'minmax(280px, 580px)' 
                    : (numAssetsConfig || 2) === 2 
                      ? 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))' 
                      : 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
                gap: '16px'
              }}>
                {Array.from({ length: numAssetsConfig || 2 }).map((_, idx) => (
                  <div key={idx} className="skeleton-card skeleton-shimmer" style={{ height: '240px', borderRadius: '10px' }} />
                ))}
              </div>
            ) : curationError ? (
              <div style={{ padding: '16px 20px', background: '#FEF2F2', borderRadius: '8px', border: '1px solid #FECACA', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#991B1B' }}>
                      Unable to retrieve visual references
                    </div>
                    <div style={{ fontSize: '0.80rem', color: '#7F1D1D', marginTop: '4px' }}>
                      {curationError}
                    </div>
                    {searchQueryInput && (
                      <div style={{ fontSize: '0.74rem', color: '#991B1B', marginTop: '4px' }}>
                        Retained query: <span style={{ fontWeight: 600 }}>"{searchQueryInput}"</span>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ padding: '6px 14px', fontSize: '0.78rem', background: '#FFFFFF', color: '#1E293B', borderColor: '#CBD5E1', display: 'flex', alignItems: 'center', gap: '6px' }}
                      onClick={() => referenceFileInputRef.current?.click()}
                    >
                      <IconUpload size={13} color="var(--action-primary)" />
                      <span>Upload Reference Image</span>
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ padding: '6px 14px', fontSize: '0.78rem', background: '#FFFFFF', color: '#991B1B', borderColor: '#FECACA' }}
                      onClick={() => {
                        triggerCurateAssets(searchQueryInput, numAssetsConfig, {
                          headline: activeConcept?.title,
                          topic: activeOpportunity?.title,
                          visual_direction: activeConcept?.visual_direction
                        });
                      }}
                    >
                      Retry Search
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: '0.74rem', color: '#B91C1C', fontStyle: 'italic' }}>
                  Note: Visual reference retrieval is an optional inspiration aid; campaign image generation below remains fully operational.
                </div>
              </div>
            ) : curatedAssets.length === 0 ? (
              <div style={{ padding: '18px 20px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                      No visual references found for "{searchQueryInput || curationLastQuery || activeConcept?.title || 'this campaign'}"
                    </div>
                    <div style={{ fontSize: '0.80rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      Try searching with broader concept keywords, or upload your own reference image below.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ padding: '6px 14px', fontSize: '0.78rem', background: '#FFFFFF', color: '#1E293B', borderColor: '#CBD5E1', display: 'flex', alignItems: 'center', gap: '6px' }}
                      onClick={() => referenceFileInputRef.current?.click()}
                    >
                      <IconUpload size={13} color="var(--action-primary)" />
                      <span>Upload Reference Image</span>
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ padding: '6px 14px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                      onClick={() => {
                        const query = activeOpportunity?.title || activeConcept?.title || searchQueryInput || 'campaign visual';
                        triggerCurateAssets(query, numAssetsConfig, {
                          headline: activeConcept?.title,
                          topic: activeOpportunity?.title,
                          visual_direction: activeConcept?.visual_direction
                        });
                      }}
                    >
                      <IconRefresh size={12} />
                      <span>Search Suggested</span>
                    </button>
                  </div>
                </div>

                {/* Helpful Query Suggestion Pills */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>Suggested Queries:</span>
                  {activeOpportunity?.title && (
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ padding: '3px 8px', fontSize: '0.74rem', background: '#FFF' }}
                      onClick={() => {
                        setSearchQueryInput(activeOpportunity.title);
                        triggerCurateAssets(activeOpportunity.title, numAssetsConfig, {
                          headline: activeConcept?.title,
                          topic: activeOpportunity.title,
                          visual_direction: activeConcept?.visual_direction
                        });
                      }}
                    >
                      Topic: "{activeOpportunity.title}"
                    </button>
                  )}
                  {activeConcept?.title && (
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ padding: '3px 8px', fontSize: '0.74rem', background: '#FFF' }}
                      onClick={() => {
                        setSearchQueryInput(activeConcept.title);
                        triggerCurateAssets(activeConcept.title, numAssetsConfig, {
                          headline: activeConcept.title,
                          topic: activeOpportunity?.title,
                          visual_direction: activeConcept.visual_direction
                        });
                      }}
                    >
                      Concept: "{activeConcept.title.slice(0, 32)}..."
                    </button>
                  )}
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontStyle: 'italic', marginLeft: 'auto' }}>
                    Note: References are an optional inspiration aid; image generation below is fully independent.
                  </span>
                </div>
              </div>
            ) : (
              <div 
                style={{
                  display: 'grid',
                  gridTemplateColumns: 
                    curatedAssets.length <= 1 
                      ? 'minmax(280px, 580px)' 
                      : curatedAssets.length === 2 
                        ? 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))' 
                        : curatedAssets.length === 3 
                          ? 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' 
                          : 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
                  gap: '16px'
                }}
              >
                {curatedAssets.map((item, idx) => {
                  const isReferenced = selectedReferenceAsset?.id === item.id;
                  const cardKey = item.id || `ref_${idx}_${item.image_url}`;
                  const isBroken = brokenImageIds[cardKey];

                  return (
                    <div 
                      key={cardKey}
                      onClick={() => handleToggleReferenceAsset(item)}
                      style={{
                        borderRadius: '10px',
                        overflow: 'hidden',
                        background: isReferenced ? '#F0F7FF' : '#FFFFFF',
                        border: isReferenced ? '2px solid #1A73E8' : '1px solid #E2E8F0',
                        boxShadow: isReferenced ? '0 2px 8px rgba(26,115,232,0.18)' : '0 1px 3px rgba(0,0,0,0.05)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100%'
                      }}
                    >
                      {/* Visual Preview Container with consistent 16:10 aspect ratio */}
                      <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 10', background: '#0F172A', overflow: 'hidden' }}>
                        {isBroken ? (
                          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', color: 'var(--text-muted)', gap: '6px' }}>
                            <IconSparkles size={16} color="#94A3B8" />
                            <span style={{ fontSize: '0.72rem', fontWeight: 500 }}>Reference Preview</span>
                          </div>
                        ) : (
                          <img 
                            src={item.thumbnail_url || item.image_url} 
                            alt={item.title}
                            onError={() => setBrokenImageIds(prev => ({ ...prev, [cardKey]: true }))}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            loading="lazy"
                          />
                        )}

                        {/* Top-Left Badges: Compact Selected indicator & Watermark warning */}
                        <div style={{ position: 'absolute', top: '8px', left: '8px', display: 'flex', gap: '4px', flexWrap: 'wrap', maxWidth: '80%' }}>
                          {isReferenced && (
                            <span style={{ fontSize: '0.68rem', fontWeight: 600, background: '#1A73E8', color: '#FFF', padding: '2px 8px', borderRadius: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              ✓ Selected Reference
                            </span>
                          )}
                          {item.is_watermarked && (
                            <span 
                              style={{ fontSize: '0.64rem', fontWeight: 600, padding: '2px 6px', background: 'rgba(254, 243, 199, 0.95)', color: '#92400E', border: '1px solid #FCD34D', borderRadius: '4px', backdropFilter: 'blur(2px)' }}
                              title="This external reference contains a visible host watermark"
                            >
                              ⚠️ Watermarked Preview
                            </span>
                          )}
                        </div>

                        {/* Top-Right Badge: Clear External Reference Tag or Your Upload */}
                        <div style={{ position: 'absolute', top: '8px', right: '8px' }}>
                          {item.source_domain === 'Local Upload' ? (
                            <span style={{ fontSize: '0.62rem', fontWeight: 600, background: '#7C3AED', color: '#FFFFFF', padding: '2px 6px', borderRadius: '4px', backdropFilter: 'blur(3px)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              Your Upload
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.62rem', fontWeight: 600, background: 'rgba(15, 23, 42, 0.75)', color: '#E2E8F0', padding: '2px 6px', borderRadius: '4px', backdropFilter: 'blur(3px)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              External Ref
                            </span>
                          )}
                        </div>

                        {/* Remove button for user-uploaded references */}
                        {item.source_domain === 'Local Upload' && (
                          <button
                            type="button"
                            onClick={(e) => handleRemoveUploadedReference(e, item.id)}
                            title="Remove uploaded reference"
                            style={{
                              position: 'absolute',
                              bottom: '8px',
                              left: '8px',
                              background: 'rgba(15, 23, 42, 0.8)',
                              border: '1px solid rgba(255, 255, 255, 0.2)',
                              color: '#FCA5A5',
                              padding: '2px 7px',
                              borderRadius: '4px',
                              fontSize: '0.65rem',
                              cursor: 'pointer',
                              fontWeight: 600,
                              zIndex: 3
                            }}
                          >
                            &times; Remove
                          </button>
                        )}

                        {/* Bottom-Right Badge: Genuine retrieval relevance score */}
                        {typeof item.overall_score === 'number' && item.overall_score > 0 && (
                          <div style={{ position: 'absolute', bottom: '8px', right: '8px' }}>
                            <span 
                              style={{ fontSize: '0.66rem', fontWeight: 600, background: 'rgba(15, 23, 42, 0.82)', color: '#FFFFFF', padding: '2px 7px', borderRadius: '4px', backdropFilter: 'blur(3px)' }}
                              title={`Retrieval relevance score (${Math.round((item.relevance_score ?? item.overall_score) * 100)}%): Evaluated based on semantic keyword match against campaign concept and visual direction`}
                            >
                              {Math.round((item.relevance_score ?? item.overall_score) * 100)}% Relevance
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Card Content & Provenance Information */}
                      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'space-between', gap: '10px' }}>
                        <div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.title}>
                            {item.title}
                          </div>

                          {/* Source Transparency & Subtle View Source Link */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '6px' }}>
                            <div 
                              style={{ fontSize: '0.72rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} 
                              title={item.source_domain || 'Web source'}
                            >
                              <span>{item.source_domain === 'Local Upload' ? '📁' : '🌐'}</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {item.source_domain === 'Local Upload' ? 'Custom User Upload' : (item.source_domain || 'Web Reference')}
                              </span>
                            </div>

                            {item.source_domain !== 'Local Upload' && (item.source_url || item.image_url) && (
                              <a
                                href={item.source_url || item.image_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title="View original webpage context (opens in new tab)"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '2px',
                                  fontSize: '0.70rem',
                                  fontWeight: 500,
                                  color: '#1A73E8',
                                  textDecoration: 'none',
                                  padding: '2px 7px',
                                  borderRadius: '4px',
                                  background: '#EFF6FF',
                                  border: '1px solid #BFDBFE',
                                  flexShrink: 0
                                }}
                              >
                                <span>View Source ↗</span>
                              </a>
                            )}
                          </div>

                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '6px', fontStyle: 'italic' }}>
                            {item.source_domain === 'Local Upload' 
                              ? 'Your uploaded image • Injected as reference style guidance' 
                              : 'Style inspiration only • Not cleared for commercial reuse'}
                          </div>
                        </div>

                        {/* Interactive Selection Footer */}
                        <div style={{ 
                          paddingTop: '8px', 
                          borderTop: '1px solid ' + (isReferenced ? '#BFDBFE' : '#F1F5F9'),
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between',
                          fontSize: '0.74rem'
                        }}>
                          <span style={{ fontWeight: isReferenced ? 700 : 500, color: isReferenced ? '#1A73E8' : 'var(--text-secondary)' }}>
                            {isReferenced ? '✓ Active Inspiration Aid' : 'Click to Use as Reference'}
                          </span>
                          <span style={{ fontSize: '0.70rem', color: isReferenced ? '#1A73E8' : 'var(--text-muted)' }}>
                            {isReferenced ? 'Deselect' : 'Select'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* CREATIVE MEDIA STUDIO SWITCHER: Images vs Google Veo Cinematic Video */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
              <div style={{ display: 'inline-flex', background: '#F1F5F9', padding: '4px', borderRadius: '10px', border: '1px solid #CBD5E1' }}>
                <button
                  type="button"
                  onClick={() => setMediaMode('image')}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '7px',
                    border: 'none',
                    background: mediaMode === 'image' ? '#FFFFFF' : 'transparent',
                    color: mediaMode === 'image' ? '#1A73E8' : '#64748B',
                    fontWeight: mediaMode === 'image' ? 700 : 500,
                    fontSize: '0.86rem',
                    cursor: 'pointer',
                    boxShadow: mediaMode === 'image' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <IconSparkles size={15} />
                  <span>Campaign Images ({generatedImages.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMediaMode('video')}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '7px',
                    border: 'none',
                    background: mediaMode === 'video' ? '#FFFFFF' : 'transparent',
                    color: mediaMode === 'video' ? '#0F9D9A' : '#64748B',
                    fontWeight: mediaMode === 'video' ? 700 : 500,
                    fontSize: '0.86rem',
                    cursor: 'pointer',
                    boxShadow: mediaMode === 'video' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <IconVideo size={15} />
                  <span>Cinematic Video (Google Veo) {generatedVideos.length > 0 ? `(${generatedVideos.length})` : ''}</span>
                  <span className="badge badge-purple" style={{ fontSize: '0.68rem', padding: '1px 6px', background: '#EDE9FE', color: '#7C3AED' }}>Veo</span>
                </button>
              </div>

              {mediaMode === 'video' && startingImageForVideo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--brand-teal-subtle)', border: '1px solid var(--brand-teal-border)', padding: '6px 12px', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.78rem', color: '#0F766E', fontWeight: 600 }}>Mode: Image-to-Video Animation</span>
                  <button 
                    type="button" 
                    onClick={() => setStartingImageForVideo(null)}
                    style={{ background: 'none', border: 'none', color: '#0F9D9A', cursor: 'pointer', fontSize: '0.74rem', textDecoration: 'underline' }}
                  >
                    Clear starting frame
                  </button>
                </div>
              )}
            </div>

            {mediaMode === 'image' ? (
              /* HERO HIGHLIGHT: CAMPAIGN IMAGE GENERATION STUDIO (Default: 4 Images) */
              <div className="glass-card" style={{ border: '2px solid #1A73E8', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px', marginBottom: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span className="badge badge-cyan" style={{ fontSize: '0.75rem', fontWeight: 700 }}>Hero Feature</span>
                      <span style={{ fontSize: '0.82rem', color: '#1A73E8', fontWeight: 600 }}>Multi-Candidate Creative Synthesis</span>
                    </div>
                    <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                      Generate Campaign Artwork ({numImagesToGenerate} Images)
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                      Generate high-resolution visual artwork candidates tailored to your selected concept. Choose your favorite candidate as the active campaign artwork.
                    </p>
                  </div>

                  {/* Controls: Count, Aspect Ratio, Style */}
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <label className="subheading-label" style={{ marginBottom: '4px' }}>Images to Generate</label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {[1, 2, 4].map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setNumImagesToGenerate(c)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              border: numImagesToGenerate === c ? '2px solid #1A73E8' : '1px solid var(--border-subtle)',
                              background: numImagesToGenerate === c ? '#E8F0FE' : '#FFFFFF',
                              color: numImagesToGenerate === c ? '#1A73E8' : 'var(--text-primary)',
                              fontWeight: numImagesToGenerate === c ? 700 : 500,
                              cursor: 'pointer',
                              fontSize: '0.82rem'
                            }}
                          >
                            {c} {c === 4 ? '(Default)' : ''}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="subheading-label" style={{ marginBottom: '4px' }}>Aspect Ratio</label>
                      <select 
                        className="select-glass" 
                        style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                        value={aspectRatio}
                        onChange={(e) => setAspectRatio(e.target.value)}
                      >
                        <option value="1:1">1:1 (Square Feed)</option>
                        <option value="4:5">4:5 (Portrait Feed)</option>
                        <option value="16:9">16:9 (Landscape Banner)</option>
                      </select>
                    </div>

                    <div>
                      <label className="subheading-label" style={{ marginBottom: '4px' }}>Style Preset</label>
                      <select 
                        className="select-glass" 
                        style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                        value={stylePreset}
                        onChange={(e) => setStylePreset(e.target.value)}
                      >
                        <option value="photorealistic">Photorealistic</option>
                        <option value="cinematic">Cinematic</option>
                        <option value="minimalist">Minimalist Editorial</option>
                        <option value="vibrant">Vibrant Pop</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Prompt Editor */}
                <div style={{ marginBottom: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="subheading-label">Visual Generation Prompt</label>
                    {selectedReferenceAsset && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className={`badge ${selectedReferenceAsset.source_domain === 'Local Upload' ? 'badge-purple' : 'badge-cyan'}`} style={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <span>{selectedReferenceAsset.source_domain === 'Local Upload' ? '📁 Custom Ref:' : 'Inspiration Attached:'}</span>
                          <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {selectedReferenceAsset.title}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedReferenceAsset(null);
                            setImagePrompt(activeConcept?.visual_direction || activeConcept?.search_query || '');
                            notify('Removed reference inspiration aid.', 'info');
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            fontSize: '14px',
                            lineHeight: 1,
                            padding: '0 2px'
                          }}
                          title="Detach reference"
                        >
                          &times;
                        </button>
                      </div>
                    )}
                  </div>
                  <textarea 
                    className="input-glass"
                    rows={3}
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    placeholder="Describe the desired visual aesthetic, foreground, lighting, and composition..."
                    style={{ fontSize: '0.88rem' }}
                  />
                </div>

                {/* Action Bar */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginBottom: '24px' }}>
                  <button 
                    className="btn-primary" 
                    style={{ padding: '12px 28px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}
                    onClick={() => triggerGenerateImages(imagePrompt, numImagesToGenerate)}
                    disabled={isGeneratingImages}
                  >
                    {isGeneratingImages ? (
                      <>
                        <span className="pulsing-cook-dot" style={{ background: '#FFFFFF' }} />
                        <span>Synthesizing {numImagesToGenerate} Images...</span>
                      </>
                    ) : (
                      <>
                        <IconSparkles size={16} />
                        <span>Generate {numImagesToGenerate} Campaign Images →</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Generated Campaign Images Gallery */}
                <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '20px' }}>
                  <h4 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                    Generated Campaign Images ({isGeneratingImages ? `Cooking ${numImagesToGenerate}...` : `${generatedImages.length} Candidates`})
                  </h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Click any generated image to make it your active artwork candidate, or click "Animate (Veo)" to generate a cinematic video from it.
                  </p>

                  {isGeneratingImages ? (
                    /* Shimmer Skeletons for generating images */
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                      {Array.from({ length: numImagesToGenerate }).map((_, idx) => (
                        <div key={idx} className="skeleton-card" style={{ height: '280px' }}>
                          <div className="skeleton-shimmer" style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: '0.82rem', color: '#94A3B8', fontWeight: 600 }}>
                              Synthesizing Candidate #{idx + 1}...
                            </span>
                          </div>
                          <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div className="skeleton-shimmer" style={{ height: '14px', width: '80%', borderRadius: '4px' }} />
                            <div className="skeleton-shimmer" style={{ height: '10px', width: '50%', borderRadius: '4px' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : generatedImages.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '36px', background: '#F8FAFC', borderRadius: '8px' }}>
                      <IconSparkles size={28} color="#1A73E8" />
                      <div style={{ marginTop: '10px', fontWeight: 600, fontSize: '0.95rem' }}>No campaign images generated yet</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Click "Generate {numImagesToGenerate} Campaign Images" above to synthesize your creative visuals.
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                      {generatedImages.map((img, idx) => {
                        const isSelected = heroAsset?.url === img.url;
                        return (
                          <div 
                            key={img.id}
                            onClick={() => {
                              const isRetouched = img.enhanced_prompt?.startsWith('[Retouched]');
                              setHeroAsset({
                                url: img.url,
                                base64: img.image_base64,
                                title: isRetouched ? img.enhanced_prompt?.replace('[Retouched] ', 'Retouched: ') : `Campaign Image Candidate #${idx + 1}`,
                                media_type: 'image',
                                is_retouched: isRetouched,
                                retouch_prompt: isRetouched ? img.enhanced_prompt?.replace('[Retouched] ', '') : undefined
                              });
                              setHeroAssetLoadFailed(false);
                            }}
                            style={{
                              borderRadius: '10px',
                              overflow: 'hidden',
                              background: '#FFFFFF',
                              border: isSelected ? '2.5px solid #1A73E8' : '1px solid var(--border-subtle)',
                              boxShadow: isSelected ? 'var(--shadow-modal)' : 'var(--shadow-card)',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between'
                            }}
                          >
                            <div style={{ position: 'relative', height: '220px', background: '#0F172A' }}>
                              <img 
                                src={resolveImageSrc(img.image_base64 || img.url)} 
                                alt={`Candidate ${idx + 1}`}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                              <div style={{ position: 'absolute', top: '8px', left: '8px' }}>
                                {img.enhanced_prompt?.startsWith('[Retouched]') ? (
                                  <span className="badge badge-emerald" style={{ background: '#059669', color: '#FFF', fontSize: '0.72rem', fontWeight: 700, boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
                                    ✨ Retouched
                                  </span>
                                ) : (
                                  <span className="badge badge-cyan" style={{ background: 'rgba(0,0,0,0.6)', color: '#FFF', fontSize: '0.72rem' }}>
                                    Candidate #{idx + 1}
                                  </span>
                                )}
                              </div>
                              {isSelected && (
                                <div style={{ position: 'absolute', bottom: '8px', left: '8px' }}>
                                  <span className="badge badge-emerald" style={{ background: '#188038', color: '#FFF', fontSize: '0.74rem' }}>
                                    ✓ Active Artwork
                                  </span>
                                </div>
                              )}
                            </div>

                            <div style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: isSelected ? '#1A73E8' : 'var(--text-primary)' }}>
                                {isSelected ? '✓ Selected' : 'Click to Select'}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAnimateImageWithVeo(img);
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '5px 9px',
                                  borderRadius: '6px',
                                  border: '1px solid var(--brand-teal-border)',
                                  background: 'var(--brand-teal-subtle)',
                                  color: '#0F766E',
                                  fontSize: '0.74rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                                title="Animate this candidate with Google Veo"
                              >
                                <IconVideo size={12} />
                                <span>Animate (Veo)</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* GOOGLE VEO VIDEO GENERATION STUDIO */
              <div className="glass-card" style={{ border: '2px solid #8B5CF6', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px', marginBottom: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span className="badge badge-purple" style={{ fontSize: '0.75rem', fontWeight: 700, background: '#EDE9FE', color: '#6D28D9' }}>Google Veo Engine</span>
                      <span style={{ fontSize: '0.82rem', color: '#7C3AED', fontWeight: 600 }}>High-Fidelity Generative Video</span>
                    </div>
                    <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                      {startingImageForVideo ? 'Animate Candidate with Google Veo (Image-to-Video)' : 'Generate Cinematic Campaign Video with Google Veo'}
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                      {startingImageForVideo 
                        ? 'Transforms your chosen campaign candidate into dynamic high-definition motion with temporal coherence.'
                        : 'Synthesize cinematic, high-definition promotional videos with photorealistic lighting and realistic camera movement.'}
                    </p>
                  </div>

                  {/* Controls: Aspect Ratio, Duration, FPS */}
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <label className="subheading-label" style={{ marginBottom: '4px' }}>Aspect Ratio</label>
                      <select 
                        className="select-glass" 
                        style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                        value={videoAspectRatio}
                        onChange={(e) => setVideoAspectRatio(e.target.value)}
                      >
                        <option value="16:9">16:9 (Landscape / YouTube)</option>
                        <option value="9:16">9:16 (Reels / TikTok / Shorts)</option>
                        <option value="1:1">1:1 (Square Feed)</option>
                      </select>
                    </div>

                    <div>
                      <label className="subheading-label" style={{ marginBottom: '4px' }}>Duration</label>
                      <select 
                        className="select-glass" 
                        style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                        value={videoDuration}
                        onChange={(e) => setVideoDuration(Number(e.target.value))}
                      >
                        <option value={4}>4 seconds</option>
                        <option value={6}>6 seconds</option>
                        <option value={8}>8 seconds</option>
                      </select>
                    </div>

                    <div>
                      <label className="subheading-label" style={{ marginBottom: '4px' }}>Frame Rate</label>
                      <select 
                        className="select-glass" 
                        style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                        value={videoFps}
                        onChange={(e) => setVideoFps(Number(e.target.value))}
                      >
                        <option value={24}>24 fps (Cinematic)</option>
                        <option value={30}>30 fps (Smooth Web)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Operational readiness notice if Veo engine lacks API credentials */}
                {studioHealth && !studioHealth.has_gemini_key && (
                  <div style={{ marginBottom: '16px', background: '#FEF7E0', border: '1px solid #FEEFC3', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <IconInfo size={20} color="#B06000" />
                    <div style={{ flex: 1, fontSize: '0.84rem', color: '#B06000' }}>
                      <strong>Video Engine Offline:</strong> Google Veo 2 video synthesis requires an active Gemini API key (<code style={{ background: '#FFF', padding: '1px 5px', borderRadius: '4px' }}>GEMINI_API_KEY</code>). Video generation is disabled until credentials are configured. Campaign image generation remains fully available.
                    </div>
                  </div>
                )}

                {/* Starting frame pill if Image-to-Video */}
                {startingImageForVideo && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: 'var(--brand-teal-subtle)', border: '1px solid var(--brand-teal-border)', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px' }}>
                    <img 
                      src={resolveImageSrc(startingImageForVideo.image_base64 || startingImageForVideo.url)} 
                      alt="Starting frame" 
                      style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--brand-teal-border)' }} 
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#581C87' }}>Starting Frame Locked</div>
                      <div style={{ fontSize: '0.78rem', color: '#7E22CE' }}>Veo will use this image as the anchor frame and simulate fluid motion based on your prompt.</div>
                    </div>
                    <button 
                      type="button" 
                      className="btn-outline" 
                      style={{ fontSize: '0.75rem', padding: '4px 10px', borderColor: 'var(--brand-teal-border)', color: '#0F766E' }}
                      onClick={() => setStartingImageForVideo(null)}
                    >
                      Remove Frame (Use Text-to-Video)
                    </button>
                  </div>
                )}

                {/* Prompt Editor */}
                <div style={{ marginBottom: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label className="subheading-label">Veo Motion &amp; Cinematography Prompt</label>
                      {activeConcept && (
                        <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          (Aligned with: <strong style={{ color: '#475569' }}>{activeConcept.title}</strong>)
                        </span>
                      )}
                    </div>
                    {activeConcept && (activeConcept.veo_motion_prompt || activeConcept.visual_direction) && videoPrompt !== (activeConcept.veo_motion_prompt || activeConcept.visual_direction) && (
                      <button
                        type="button"
                        onClick={() => setVideoPrompt(activeConcept.veo_motion_prompt || activeConcept.visual_direction || '')}
                        style={{ background: 'none', border: 'none', color: '#0F9D9A', fontSize: '0.72rem', cursor: 'pointer', textDecoration: 'underline' }}
                        title="Sync with the active creative concept"
                      >
                        Reset to Concept Motion Prompt
                      </button>
                    )}
                  </div>
                  <textarea 
                    className="input-glass"
                    rows={3}
                    value={videoPrompt}
                    onChange={(e) => setVideoPrompt(e.target.value)}
                    placeholder="Describe camera motion (e.g. slow cinematic push-in, orbital tracking), subject physics, lighting transitions, and mood..."
                    style={{ fontSize: '0.88rem' }}
                  />
                </div>

                {/* Action Bar */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginBottom: '24px' }}>
                  <button 
                    className="btn-primary" 
                    style={{ 
                      padding: '12px 28px', 
                      fontSize: '0.95rem', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px', 
                      fontWeight: 700, 
                      background: studioHealth && !studioHealth.has_gemini_key ? '#94A3B8' : '#0F9D9A',
                      cursor: studioHealth && !studioHealth.has_gemini_key ? 'not-allowed' : 'pointer'
                    }}
                    onClick={() => {
                      if (studioHealth && !studioHealth.has_gemini_key) {
                        notify('Video synthesis requires GEMINI_API_KEY to be configured in backend settings.', 'info');
                        return;
                      }
                      triggerGenerateVideo(videoPrompt);
                    }}
                    disabled={isGeneratingVideo || (studioHealth !== null && !studioHealth.has_gemini_key)}
                  >
                    {isGeneratingVideo ? (
                      <>
                        <span className="pulsing-cook-dot" style={{ background: '#FFFFFF' }} />
                        <span>Synthesizing Veo Video...</span>
                      </>
                    ) : (
                      <>
                        <IconVideo size={16} />
                        <span>Generate Cinematic Video with Google Veo →</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Generated Videos Gallery */}
                <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '20px' }}>
                  <h4 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '6px', color: 'var(--text-primary)' }}>
                    Generated Campaign Videos ({isGeneratingVideo ? 'Cooking...' : `${generatedVideos.length} Video${generatedVideos.length === 1 ? '' : 's'}`})
                  </h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Preview generated videos. Select any video as the active hero asset to publish to social channels or download as MP4.
                  </p>

                  {isGeneratingVideo ? (
                    <div style={{ height: '240px', borderRadius: '10px', background: '#FAF5FF', border: '1.5px dashed #C084FC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                      <span className="pulsing-cook-dot" style={{ background: '#7C3AED', width: '16px', height: '16px' }} />
                      <span style={{ fontSize: '0.92rem', color: '#6D28D9', fontWeight: 600 }}>Google Veo is rendering video temporal frames...</span>
                      <span style={{ fontSize: '0.78rem', color: '#9333EA' }}>This high-fidelity generation simulates fluid physics and photorealistic motion.</span>
                    </div>
                  ) : generatedVideos.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '36px', background: '#F8FAFC', borderRadius: '8px' }}>
                      <IconVideo size={28} color="#0F9D9A" />
                      <div style={{ marginTop: '10px', fontWeight: 600, fontSize: '0.95rem' }}>No campaign videos generated yet</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Click "Generate Cinematic Video with Google Veo" above to synthesize dynamic video content.
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                      {generatedVideos.map((vid, idx) => {
                        const isSelected = heroAsset?.url === vid.video_url;
                        return (
                          <div 
                            key={vid.id || idx}
                            onClick={() => {
                              setHeroAsset({ 
                                url: vid.video_url, 
                                title: `Veo Video (${vid.aspect_ratio}, ${vid.duration_seconds}s)`, 
                                media_type: 'video' 
                              });
                              setHeroAssetLoadFailed(false);
                            }}
                            style={{
                              borderRadius: '10px',
                              overflow: 'hidden',
                              background: '#FFFFFF',
                              border: isSelected ? '2.5px solid #0F9D9A' : '1px solid var(--border-subtle)',
                              boxShadow: isSelected ? '0 4px 18px rgba(15,157,154,0.2)' : 'var(--shadow-card)',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between'
                            }}
                          >
                            <div style={{ position: 'relative', height: '220px', background: '#0F172A' }}>
                              <video 
                                src={resolveImageSrc(vid.video_url)} 
                                controls 
                                playsInline 
                                preload="metadata"
                                onClick={(e) => e.stopPropagation()}
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                              />
                              <div style={{ position: 'absolute', top: '8px', left: '8px', pointerEvents: 'none' }}>
                                <span className="badge badge-cyan" style={{ background: 'rgba(0,0,0,0.7)', color: '#FFF', fontSize: '0.72rem' }}>
                                  {vid.model_used || 'Google Veo'} &bull; {vid.duration_seconds}s
                                </span>
                              </div>
                              {isSelected && (
                                <div style={{ position: 'absolute', bottom: '8px', left: '8px', pointerEvents: 'none' }}>
                                  <span className="badge badge-emerald" style={{ background: '#188038', color: '#FFF', fontSize: '0.74rem' }}>
                                    ✓ Active Asset
                                  </span>
                                </div>
                              )}
                            </div>

                            <div style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: isSelected ? '#0F9D9A' : 'var(--text-primary)' }}>
                                  {isSelected ? '✓ Selected for Publishing' : 'Click to Set as Active Hero Asset'}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                                  {vid.aspect_ratio} &bull; {vid.fps} FPS &bull; {vid.duration_seconds}s
                                </div>
                              </div>
                              <a
                                href={resolveImageSrc(vid.video_url)}
                                download={`veo_campaign_${vid.id}.mp4`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{ fontSize: '0.74rem', color: '#0F766E', textDecoration: 'none', fontWeight: 600, padding: '4px 8px', borderRadius: '4px', background: 'var(--brand-teal-subtle)', border: '1px solid var(--brand-teal-border)' }}
                              >
                                Download MP4
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Active Asset Focus Dock */}
          {heroAsset && (
            <div className="glass-card animate-fade-in" style={{ background: '#FFFFFF', border: heroAssetLoadFailed ? '1.5px solid var(--status-error)' : '1.5px solid #1A73E8', padding: '20px', boxShadow: '0 4px 20px rgba(26,115,232,0.1)' }}>
              {heroAssetLoadFailed ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#FCE8E6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <IconAlertTriangle size={24} color="var(--status-error)" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--status-error)' }}>
                        Selected Asset Unavailable or Inaccessible
                      </div>
                      <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        The asset URL could not be loaded or is unavailable from local media storage. Please select an alternate candidate from the gallery above or generate new visuals.
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {generatedImages.length > 0 && (
                      <button
                        type="button"
                        className="btn-primary"
                        style={{ fontSize: '0.84rem', padding: '8px 16px' }}
                        onClick={() => {
                          const first = generatedImages[0];
                          setHeroAsset({
                            url: first.url,
                            base64: first.image_base64,
                            title: 'Campaign Image Candidate #1',
                            media_type: 'image'
                          });
                          setHeroAssetLoadFailed(false);
                        }}
                      >
                        Select Candidate #1
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ fontSize: '0.84rem', padding: '8px 16px' }}
                      onClick={() => {
                        setHeroAsset(null);
                        setHeroAssetLoadFailed(false);
                      }}
                    >
                      Clear Selection
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: (isRetouchOpen || heroAsset.media_type === 'video' || heroAsset.url.endsWith('.mp4')) ? '18px' : '0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ position: 'relative', width: '70px', height: '70px', borderRadius: '8px', overflow: 'hidden', background: '#0F172A', border: '2px solid #1A73E8', flexShrink: 0 }}>
                        {heroAsset.media_type === 'video' || heroAsset.url.endsWith('.mp4') ? (
                          <video 
                            src={resolveImageSrc(heroAsset.url)} 
                            autoPlay 
                            loop 
                            muted 
                            playsInline 
                            onError={() => setHeroAssetLoadFailed(true)} 
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                          />
                        ) : (
                          <img 
                            src={resolveImageSrc(heroAsset.base64 || heroAsset.url)} 
                            alt="Active" 
                            onError={() => setHeroAssetLoadFailed(true)} 
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                          />
                        )}
                        {isEditingAsset && (
                          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="pulsing-cook-dot" style={{ background: '#FFF' }} />
                          </div>
                        )}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                            {heroAsset.media_type === 'video' || heroAsset.url.endsWith('.mp4') ? 'Selected Campaign Video' : 'Selected Campaign Artwork'}
                          </span>
                          <span className="badge badge-emerald">Active Selection</span>
                          {(heroAsset.is_retouched || heroAsset.title?.startsWith('Retouched:')) && (
                            <span className="badge badge-emerald" style={{ background: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC', fontSize: '0.72rem', fontWeight: 700 }}>
                              ✨ Retouched
                            </span>
                          )}
                          {(heroAsset.media_type === 'video' || heroAsset.url.endsWith('.mp4')) && (
                            <span className="badge badge-purple" style={{ background: '#EDE9FE', color: '#7C3AED', fontSize: '0.72rem' }}>
                              Google Veo
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {heroAsset.title || 'Active Campaign Asset'} &bull; Selected for Stage 4 publishing.
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      {!(heroAsset.media_type === 'video' || heroAsset.url.endsWith('.mp4')) && (
                        <button 
                          className={isRetouchOpen ? 'btn-primary' : 'btn-outline'} 
                          style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem' }}
                          onClick={() => setIsRetouchOpen(!isRetouchOpen)}
                        >
                          <IconBrush size={16} />
                          <span>{isRetouchOpen ? 'Hide Retouch Studio' : 'Edit with Natural Language'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Dedicated Responsive Showcase for Active Video Asset */}
                  {(heroAsset.media_type === 'video' || heroAsset.url.endsWith('.mp4')) && (
                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="badge badge-cyan" style={{ fontSize: '0.78rem', fontWeight: 700 }}>
                            Active Campaign Video (Veo 2)
                          </span>
                          <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                            High-definition MP4 asset preview with playback controls
                          </span>
                        </div>
                        <a
                          href={resolveImageSrc(heroAsset.url)}
                          download="campaign_video.mp4"
                          target="_blank"
                          rel="noreferrer"
                          className="btn-outline"
                          style={{ fontSize: '0.78rem', padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none', color: '#0F766E', borderColor: 'var(--brand-teal-border)', background: 'var(--brand-teal-subtle)' }}
                        >
                          <IconDownload size={14} />
                          <span>Download MP4</span>
                        </a>
                      </div>

                      <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1.5px solid #0F9D9A', background: '#0F172A', maxHeight: '380px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <video 
                          src={resolveImageSrc(heroAsset.url)} 
                          controls 
                          playsInline 
                          preload="auto"
                          style={{ width: '100%', maxHeight: '380px', objectFit: 'contain' }} 
                        />
                      </div>
                    </div>
                  )}

              {/* Prominent Showcase for Retouched / Updated Asset */}
              {(heroAsset.is_retouched || heroAsset.title?.startsWith('Retouched:')) && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span className="badge badge-emerald" style={{ fontSize: '0.78rem', fontWeight: 700, background: '#DCFCE7', color: '#166534', border: '1px solid #86EFAC' }}>
                        ✨ Updated Asset Ready
                      </span>
                      <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                        Retouch applied: <strong style={{ color: 'var(--text-primary)' }}>"{heroAsset.retouch_prompt || editorPrompt || heroAsset.title?.replace('Retouched: ', '')}"</strong>
                      </span>
                    </div>
                    {heroAsset.original_url && (
                      <button
                        type="button"
                        onClick={() => {
                          setHeroAsset({
                            url: heroAsset.original_url!,
                            base64: heroAsset.original_base64,
                            title: 'Campaign Artwork (Original)',
                            media_type: 'image',
                            is_retouched: false
                          });
                          notify('Reverted back to original unretouched artwork.', 'info');
                        }}
                        className="btn-outline"
                        style={{ padding: '4px 10px', fontSize: '0.75rem', color: '#64748B' }}
                      >
                        Revert to Original
                      </button>
                    )}
                  </div>

                  {/* Side-by-Side Comparison if Original Available, or Large HD Showcase */}
                  {heroAsset.original_url ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', alignItems: 'stretch' }}>
                      {/* Before: Original Artwork */}
                      <div style={{ borderRadius: '10px', overflow: 'hidden', border: '1px solid #E2E8F0', background: '#F8FAFC', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '8px 12px', background: '#F1F5F9', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#475569' }}>ORIGINAL BEFORE RETOUCH</span>
                          <span style={{ fontSize: '0.72rem', color: '#64748B' }}>Candidate</span>
                        </div>
                        <div style={{ position: 'relative', height: '280px', background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <img 
                            src={resolveImageSrc(heroAsset.original_base64 || heroAsset.original_url)} 
                            alt="Original Before Retouch" 
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                          />
                        </div>
                      </div>

                      {/* After: Updated Retouched Artwork */}
                      <div style={{ borderRadius: '10px', overflow: 'hidden', border: '2px solid #059669', background: '#F0FDF4', boxShadow: '0 4px 18px rgba(5,150,105,0.18)', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '8px 12px', background: '#DCFCE7', borderBottom: '1px solid #86EFAC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#166534' }}>✨ UPDATED ARTWORK (ACTIVE FOR PUBLISHING)</span>
                          <span className="badge badge-emerald" style={{ background: '#166534', color: '#FFF', fontSize: '0.68rem', padding: '2px 6px' }}>✓ Selected</span>
                        </div>
                        <div style={{ position: 'relative', height: '280px', background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <img 
                            src={resolveImageSrc(heroAsset.base64 || heroAsset.url)} 
                            alt="Updated Retouched Artwork" 
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                          />
                          <div style={{ position: 'absolute', bottom: '10px', right: '10px', display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => handleAnimateImageWithVeo({
                                id: 'retouched_active',
                                url: heroAsset.url,
                                image_base64: heroAsset.base64,
                                mime_type: 'image/png'
                              })}
                              style={{
                                fontSize: '0.74rem',
                                padding: '5px 10px',
                                background: '#0F9D9A',
                                color: '#FFF',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title="Animate with Google Veo"
                            >
                              <IconVideo size={12} />
                              <span>Animate</span>
                            </button>
                            <a
                              href={resolveImageSrc(heroAsset.base64 || heroAsset.url)}
                              download="retouched_campaign_artwork.png"
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                fontSize: '0.74rem',
                                padding: '5px 10px',
                                background: 'rgba(0,0,0,0.75)',
                                color: '#FFF',
                                borderRadius: '4px',
                                textDecoration: 'none',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <IconDownload size={12} />
                              <span>Download HD</span>
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Large Full Showcase Preview */
                    <div style={{ borderRadius: '10px', overflow: 'hidden', border: '2px solid #059669', background: '#F0FDF4', padding: '16px', display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ width: '280px', height: '280px', borderRadius: '8px', overflow: 'hidden', background: '#0F172A', flexShrink: 0 }}>
                        <img 
                          src={resolveImageSrc(heroAsset.base64 || heroAsset.url)} 
                          alt="Updated Retouched Asset" 
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: '260px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <span className="badge badge-emerald" style={{ fontSize: '0.78rem', fontWeight: 700 }}>Updated Retouched Artwork</span>
                          <span style={{ fontSize: '0.78rem', color: '#059669', fontWeight: 600 }}>Active for Publishing</span>
                        </div>
                        <h4 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
                          {heroAsset.title}
                        </h4>
                        <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
                          The retouched visual incorporates your natural language edits and is ready for multi-channel publishing or animated video conversion with Google Veo.
                        </p>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn-outline"
                            style={{ fontSize: '0.82rem', padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            onClick={() => handleAnimateImageWithVeo({
                              id: 'retouched_active',
                              url: heroAsset.url,
                              image_base64: heroAsset.base64,
                              mime_type: 'image/png'
                            })}
                          >
                            <IconVideo size={14} />
                            <span>Animate with Google Veo</span>
                          </button>
                          <a
                            href={resolveImageSrc(heroAsset.base64 || heroAsset.url)}
                            download="retouched_campaign_artwork.png"
                            target="_blank"
                            rel="noreferrer"
                            className="btn-outline"
                            style={{ fontSize: '0.82rem', padding: '6px 14px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                          >
                            <IconDownload size={14} />
                            <span>Download HD PNG</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Inline Natural Language Retouch Drawer */}
              {isRetouchOpen && (
                <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '18px', marginTop: '12px' }}>
                  <h4 style={{ fontSize: '0.98rem', fontWeight: 700, marginBottom: '6px' }}>Natural Language Retouch Studio</h4>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                    Describe how you want to modify this visual in plain English (e.g. replace background, adjust lighting, add objects, change style).
                  </p>

                  <div className="grid-2" style={{ marginBottom: '14px' }}>
                    <div>
                      <label className="subheading-label">Editing Mode</label>
                      <select 
                        className="select-glass"
                        value={editorMode}
                        onChange={(e) => setEditorMode(e.target.value as any)}
                      >
                        <option value="replace_background">Replace Background</option>
                        <option value="modify_object">Modify / Swap Specific Element</option>
                        <option value="style_transfer">Harmonize &amp; Style Transfer</option>
                      </select>
                    </div>

                    <div>
                      <label className="subheading-label">Natural Language Instruction</label>
                      <input 
                        type="text" 
                        className="input-glass"
                        placeholder="e.g. Replace the background with an upscale bright modern cafe patio"
                        value={editorPrompt}
                        onChange={(e) => setEditorPrompt(e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button 
                      className="btn-outline" 
                      style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                      onClick={() => setIsRetouchOpen(false)}
                    >
                      Cancel
                    </button>
                    <button 
                      className="btn-primary" 
                      style={{ padding: '8px 20px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                      onClick={handleExecuteRetouch}
                      disabled={isEditingAsset}
                    >
                      <IconSparkles size={14} />
                      <span>{isEditingAsset ? 'Applying Retouch...' : 'Apply Retouch'}</span>
                    </button>
                  </div>
                </div>
              )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* STAGE 4: PUBLISH & LAUNCH ROOM                                 */}
      {/* ============================================================== */}
      {currentStage === 'publish' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Header Card with In-Place Credentials Trigger */}
          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <div>
                <span className="badge badge-emerald" style={{ marginBottom: '6px' }}>Stage 4: Launch Room</span>
                <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', fontWeight: 700, margin: 0 }}>
                  Publish Campaign Across Channels
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Select your destination platform, fine-tune channel copy, and dispatch directly with in-place credentials.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                {publishingStatus && (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span className={`badge ${publishingStatus.instagram?.configured ? 'badge-emerald' : 'badge-amber'}`} style={{ fontSize: '0.74rem' }}>
                      IG: {publishingStatus.instagram?.configured ? 'Ready' : 'Needs Key'}
                    </span>
                    <span className={`badge ${publishingStatus.facebook?.configured ? 'badge-emerald' : 'badge-amber'}`} style={{ fontSize: '0.74rem' }}>
                      FB: {publishingStatus.facebook?.configured ? 'Ready' : 'Needs Key'}
                    </span>
                    <span className={`badge ${publishingStatus.email?.configured ? 'badge-emerald' : 'badge-amber'}`} style={{ fontSize: '0.74rem' }}>
                      Email: {publishingStatus.email?.configured ? 'Ready' : 'Needs Key'}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  className={showCredentialsPanel ? 'btn-primary' : 'btn-outline'}
                  style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => setShowCredentialsPanel(!showCredentialsPanel)}
                >
                  <IconKey size={14} />
                  <span>{showCredentialsPanel ? 'Hide Credentials' : 'Configure Channel Credentials'}</span>
                </button>
              </div>
            </div>

            {/* In-Place Credentials Drawer */}
            {showCredentialsPanel && (
              <div 
                style={{ 
                  background: '#F8FAFC', 
                  borderRadius: '10px', 
                  border: '1.5px solid #CBD5E1', 
                  padding: '18px', 
                  marginBottom: '20px' 
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <IconLock size={16} color="var(--action-primary)" />
                    <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                      In-Place Channel Credentials Configuration
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      className={`btn-ghost ${publishChannel === 'facebook' ? 'active' : ''}`}
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        borderRadius: '6px',
                        background: publishChannel === 'facebook' ? '#1877F2' : '#F1F5F9',
                        color: publishChannel === 'facebook' ? '#FFF' : '#475569',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                      onClick={() => setPublishChannel('facebook')}
                    >
                      Facebook {(fbPageId.trim() && fbAccessToken.trim()) ? '● Ready' : ''}
                    </button>
                    <button
                      type="button"
                      className={`btn-ghost ${publishChannel === 'instagram' ? 'active' : ''}`}
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        borderRadius: '6px',
                        background: publishChannel === 'instagram' ? '#E1306C' : '#F1F5F9',
                        color: publishChannel === 'instagram' ? '#FFF' : '#475569',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                      onClick={() => setPublishChannel('instagram')}
                    >
                      Instagram {(igUserId.trim() && igAccessToken.trim()) ? '● Ready' : ''}
                    </button>
                    <button
                      type="button"
                      className={`btn-ghost ${publishChannel === 'email' ? 'active' : ''}`}
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        borderRadius: '6px',
                        background: publishChannel === 'email' ? '#4F46E5' : '#F1F5F9',
                        color: publishChannel === 'email' ? '#FFF' : '#475569',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                      onClick={() => setPublishChannel('email')}
                    >
                      Email {((sendgridApiKey.trim() || smtpHost.trim()) && fromEmail.trim()) ? '● Ready' : ''}
                    </button>
                  </div>
                </div>

                {publishChannel === 'instagram' && (
                  <div className="grid-2">
                    <div>
                      <label className="subheading-label">Instagram User ID / Business Account ID</label>
                      <input 
                        type="text" 
                        className="input-glass"
                        placeholder="e.g. 17841405309211844"
                        value={igUserId}
                        onChange={(e) => setIgUserId(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="subheading-label">Instagram Graph Access Token</label>
                      <input 
                        type="password" 
                        className="input-glass"
                        placeholder="IGQVJ... or EAAG..."
                        value={igAccessToken}
                        onChange={(e) => setIgAccessToken(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {publishChannel === 'facebook' && (
                  <div className="grid-2">
                    <div>
                      <label className="subheading-label">Facebook Page ID</label>
                      <input 
                        type="text" 
                        className="input-glass"
                        placeholder="e.g. 109876543210987"
                        value={fbPageId}
                        onChange={(e) => setFbPageId(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="subheading-label">Facebook Page Access Token</label>
                      <input 
                        type="password" 
                        className="input-glass"
                        placeholder="EAA..."
                        value={fbAccessToken}
                        onChange={(e) => setFbAccessToken(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {publishChannel === 'email' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="grid-2">
                      <div>
                        <label className="subheading-label">Delivery Provider</label>
                        <select 
                          className="select-glass"
                          value={emailDeliveryMode}
                          onChange={(e) => setEmailDeliveryMode(e.target.value as any)}
                        >
                          <option value="sendgrid">SendGrid SDK (API Key)</option>
                          <option value="smtp">Standard SMTP Relay</option>
                        </select>
                      </div>
                      <div>
                        <label className="subheading-label">From Sender Email</label>
                        <input 
                          type="email" 
                          className="input-glass"
                          placeholder="newsletter@brand.com"
                          value={fromEmail}
                          onChange={(e) => setFromEmail(e.target.value)}
                        />
                      </div>
                    </div>

                    {emailDeliveryMode === 'sendgrid' ? (
                      <div>
                        <label className="subheading-label">SendGrid API Key</label>
                        <input 
                          type="password" 
                          className="input-glass"
                          placeholder="SG...."
                          value={sendgridApiKey}
                          onChange={(e) => setSendgridApiKey(e.target.value)}
                        />
                      </div>
                    ) : (
                      <div className="grid-4">
                        <div>
                          <label className="subheading-label">SMTP Host</label>
                          <input 
                            type="text" 
                            className="input-glass"
                            placeholder="smtp.mailgun.org"
                            value={smtpHost}
                            onChange={(e) => setSmtpHost(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="subheading-label">Port</label>
                          <input 
                            type="number" 
                            className="input-glass"
                            placeholder="587"
                            value={smtpPort}
                            onChange={(e) => setSmtpPort(Number(e.target.value))}
                          />
                        </div>
                        <div>
                          <label className="subheading-label">Username</label>
                          <input 
                            type="text" 
                            className="input-glass"
                            placeholder="postmaster@..."
                            value={smtpUsername}
                            onChange={(e) => setSmtpUsername(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="subheading-label">Password</label>
                          <input 
                            type="password" 
                            className="input-glass"
                            value={smtpPassword}
                            onChange={(e) => setSmtpPassword(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Platform Channel Tabs */}
            <div className="tab-container" style={{ marginBottom: '0' }}>
              <button
                className={`tab-btn ${publishChannel === 'instagram' ? 'active' : ''}`}
                onClick={() => setPublishChannel('instagram')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <IconInstagram size={16} color="#E1306C" />
                <span>Instagram Feed</span>
              </button>
              <button
                className={`tab-btn ${publishChannel === 'facebook' ? 'active' : ''}`}
                onClick={() => setPublishChannel('facebook')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <IconFacebook size={16} color="#1877F2" />
                <span>Facebook Page</span>
              </button>
              <button
                className={`tab-btn ${publishChannel === 'email' ? 'active' : ''}`}
                onClick={() => setPublishChannel('email')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <IconMail size={16} color="#004B93" />
                <span>Email Campaign &amp; Template Studio</span>
              </button>
            </div>
          </div>

          {/* CHANNEL 1: INSTAGRAM PUBLISHER */}
          {publishChannel === 'instagram' && (
            <div className="grid-2">
              {/* Format & Copy Configuration Card */}
              <div className="glass-card">
                {/* Format Selector: Post, Reel, Story */}
                <div style={{ marginBottom: '16px' }}>
                  <label className="subheading-label" style={{ marginBottom: '8px', display: 'block' }}>
                    Publish Destination &amp; Format
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    <button
                      type="button"
                      className={igTargetFormat === 'POST' ? 'btn-primary' : 'btn-outline'}
                      style={{
                        padding: '10px 12px',
                        fontSize: '0.82rem',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px',
                        borderColor: igTargetFormat === 'POST' ? '#E1306C' : undefined,
                        background: igTargetFormat === 'POST' ? '#E1306C' : undefined,
                        color: igTargetFormat === 'POST' ? '#FFFFFF' : undefined,
                      }}
                      onClick={() => setIgTargetFormat('POST')}
                    >
                      <IconImage size={18} />
                      <span style={{ fontWeight: 600 }}>Feed Post</span>
                    </button>

                    <button
                      type="button"
                      className={igTargetFormat === 'REEL' ? 'btn-primary' : 'btn-outline'}
                      style={{
                        padding: '10px 12px',
                        fontSize: '0.82rem',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px',
                        borderColor: igTargetFormat === 'REEL' ? '#833AB4' : undefined,
                        background: igTargetFormat === 'REEL' ? 'linear-gradient(135deg, #833AB4, #FD1D1D)' : undefined,
                        color: igTargetFormat === 'REEL' ? '#FFFFFF' : undefined,
                      }}
                      onClick={() => setIgTargetFormat('REEL')}
                    >
                      <IconVideo size={18} />
                      <span style={{ fontWeight: 600 }}>Reel</span>
                    </button>

                    <button
                      type="button"
                      className={igTargetFormat === 'STORY' ? 'btn-primary' : 'btn-outline'}
                      style={{
                        padding: '10px 12px',
                        fontSize: '0.82rem',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px',
                        borderColor: igTargetFormat === 'STORY' ? '#F77737' : undefined,
                        background: igTargetFormat === 'STORY' ? 'linear-gradient(135deg, #F58529, #DD2A7B)' : undefined,
                        color: igTargetFormat === 'STORY' ? '#FFFFFF' : undefined,
                      }}
                      onClick={() => setIgTargetFormat('STORY')}
                    >
                      <IconLightning size={18} />
                      <span style={{ fontWeight: 600 }}>Story</span>
                    </button>
                  </div>
                </div>

                {/* Video URL Input for Reels & Video Stories */}
                {(igTargetFormat === 'REEL' || (igTargetFormat === 'STORY' && igStoryMediaType === 'VIDEO')) && (
                  <div style={{ marginBottom: '16px', padding: '12px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #CBD5E1' }}>
                    <label className="subheading-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <IconVideo size={14} color="#833AB4" />
                      <span>Video Asset URL / Media Path (.mp4, .mov)</span>
                    </label>
                    <input
                      type="text"
                      className="input-glass"
                      style={{ marginTop: '6px' }}
                      placeholder="https://your-public-host.com/video.mp4 or /api/v1/content-studio/media/..."
                      value={customVideoUrl}
                      onChange={(e) => setCustomVideoUrl(e.target.value)}
                    />
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Meta requires a public URL for video ingestion. Local assets are automatically synced to GCS and signed.
                    </div>
                  </div>
                )}

                {/* Reels Option: Share to Feed Checkbox */}
                {igTargetFormat === 'REEL' && (
                  <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      id="igShareToFeed"
                      checked={igShareToFeed}
                      onChange={(e) => setIgShareToFeed(e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: '#E1306C' }}
                    />
                    <label htmlFor="igShareToFeed" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
                      Also share Reel to Main Profile Feed grid
                    </label>
                  </div>
                )}

                {/* Story Media Type Switcher */}
                {igTargetFormat === 'STORY' && (
                  <div style={{ marginBottom: '16px' }}>
                    <label className="subheading-label" style={{ marginBottom: '6px', display: 'block' }}>
                      Story Media Content
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className={igStoryMediaType === 'IMAGE' ? 'btn-primary' : 'btn-outline'}
                        style={{ padding: '6px 14px', fontSize: '0.78rem' }}
                        onClick={() => setIgStoryMediaType('IMAGE')}
                      >
                        Photo Story
                      </button>
                      <button
                        type="button"
                        className={igStoryMediaType === 'VIDEO' ? 'btn-primary' : 'btn-outline'}
                        style={{ padding: '6px 14px', fontSize: '0.78rem' }}
                        onClick={() => setIgStoryMediaType('VIDEO')}
                      >
                        Video Story
                      </button>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                      Instagram Stories display full-screen immersive media. (Captions are not attached to Stories by Meta Graph API).
                    </div>
                  </div>
                )}

                {/* Caption & Hashtags Editor (for POST and REEL) */}
                {igTargetFormat !== 'STORY' ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label className="subheading-label" style={{ margin: 0 }}>
                        {igTargetFormat === 'REEL' ? 'Reel Caption &amp; Hashtags' : 'Instagram Caption &amp; Hashtags'}
                      </label>
                      <button 
                        type="button"
                        className="btn-outline"
                        style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                        onClick={() => copyToClipboard(instagramCaption, 'Instagram Caption')}
                      >
                        <IconCopy size={12} />
                        <span>Copy</span>
                      </button>
                    </div>
                    <div style={{ marginBottom: '14px' }}>
                      <textarea 
                        className="input-glass"
                        rows={7}
                        value={instagramCaption}
                        onChange={(e) => setInstagramCaption(e.target.value)}
                        placeholder="Write your Instagram caption..."
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {instagramCaption.length}/2200
                      </div>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                      <label className="subheading-label">Active Hashtags</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {(activeConcept?.hashtags || ['trend', 'innovation', 'creator']).map((tag, idx) => (
                          <span key={idx} className="metric-pill metric-pill-cyan" style={{ fontSize: '0.78rem' }}>
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}
 
                {!publishingStatus?.instagram?.configured && (!igUserId.trim() || !igAccessToken.trim()) && (
                  <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '8px', background: '#FEF3C7', border: '1px solid #FCD34D', color: '#92400E', fontSize: '0.82rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span>⚠️ Instagram credentials not detected.</span>
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ padding: '3px 8px', fontSize: '0.75rem', background: '#FFF' }}
                      onClick={() => {
                        setPublishChannel('instagram');
                        setShowCredentialsPanel(true);
                      }}
                    >
                      Configure Credentials
                    </button>
                  </div>
                )}

                {/* Dispatch Button */}
                <button 
                  className="btn-primary" 
                  style={{
                    width: '100%',
                    padding: '12px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    background: igTargetFormat === 'REEL' ? 'linear-gradient(135deg, #833AB4, #FD1D1D)' : (igTargetFormat === 'STORY' ? 'linear-gradient(135deg, #F58529, #DD2A7B)' : '#E1306C'),
                    boxShadow: '0 4px 14px rgba(225, 48, 108, 0.3)'
                  }}
                  onClick={handlePublishInstagram}
                  disabled={isPublishing}
                >
                  {igTargetFormat === 'REEL' ? <IconVideo size={16} /> : (igTargetFormat === 'STORY' ? <IconLightning size={16} /> : <IconSend size={16} />)}
                  <span>
                    {isPublishing
                      ? 'Publishing to Instagram...'
                      : igTargetFormat === 'REEL'
                      ? 'Publish Reel to Instagram'
                      : igTargetFormat === 'STORY'
                      ? 'Publish Story to Instagram'
                      : 'Publish to Instagram Feed'}
                  </span>
                </button>
              </div>

              {/* Dynamic Mobile Phone Mockup Preview */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                  <IconSmartphone size={16} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Instagram {igTargetFormat === 'REEL' ? 'Reel Preview' : (igTargetFormat === 'STORY' ? 'Story Preview' : 'Feed Mockup')}
                  </span>
                </div>

                <div 
                  style={{
                    width: '320px',
                    borderRadius: '28px',
                    border: '8px solid #1E293B',
                    background: '#0F172A',
                    overflow: 'hidden',
                    boxShadow: 'var(--shadow-modal)',
                    position: 'relative'
                  }}
                >
                  {/* FEED POST MOCKUP */}
                  {igTargetFormat === 'POST' && (
                    <div style={{ background: '#FFFFFF', minHeight: '440px', display: 'flex', flexDirection: 'column' }}>
                      {/* Fake IG Header */}
                      <div style={{ padding: '12px 14px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(45deg, #F58529, #DD2A7B, #8134AF)' }} />
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0F172A' }}>trend.contenter</span>
                      </div>

                      {/* Media (Video or Image) */}
                      <div style={{ width: '100%', height: '280px', background: '#0F172A', position: 'relative' }}>
                        {heroAsset?.url ? (
                          heroAsset.media_type === 'video' || heroAsset.url.endsWith('.mp4') || heroAsset.url.includes('.mp4') ? (
                            <video
                              src={resolveImageSrc(heroAsset.url)}
                              autoPlay
                              loop
                              muted
                              playsInline
                              controls
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <img src={resolveImageSrc(heroAsset.base64 || heroAsset.url)} alt="IG preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          )
                        ) : (
                          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: '0.8rem' }}>No Artwork Selected</div>
                        )}
                      </div>

                      {/* Fake Actions & Caption */}
                      <div style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '8px', fontSize: '1rem' }}>
                          <span>❤️</span><span>💬</span><span>↗️</span>
                        </div>
                        <div style={{ fontSize: '0.82rem', lineHeight: 1.4, color: '#1E293B' }}>
                          <strong style={{ marginRight: '6px' }}>trend.contenter</strong>
                          {instagramCaption ? `${instagramCaption.slice(0, 100)}...` : 'Your post caption will appear here.'}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* REEL MOCKUP */}
                  {igTargetFormat === 'REEL' && (
                    <div style={{ height: '480px', position: 'relative', overflow: 'hidden', background: '#0F172A' }}>
                      {/* Video/Image Background */}
                      {customVideoUrl ? (
                        <video src={customVideoUrl} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : heroAsset?.url ? (
                        heroAsset.media_type === 'video' || heroAsset.url.endsWith('.mp4') || heroAsset.url.includes('.mp4') ? (
                          <video src={resolveImageSrc(heroAsset.url)} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <img src={resolveImageSrc(heroAsset.base64 || heroAsset.url)} alt="Reel preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        )
                      ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>Video Preview</div>
                      )}

                      {/* Top Reels Badge */}
                      <div style={{ position: 'absolute', top: '14px', left: '14px', display: 'flex', alignItems: 'center', gap: '6px', color: '#FFFFFF', fontSize: '0.82rem', fontWeight: 700, textShadow: '0 2px 4px rgba(0,0,0,0.6)' }}>
                        <IconVideo size={16} />
                        <span>Reels</span>
                      </div>

                      {/* Right Action Stack */}
                      <div style={{ position: 'absolute', right: '12px', bottom: '60px', display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center', color: '#FFFFFF', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '0.72rem' }}>
                          <span style={{ fontSize: '1.25rem' }}>❤️</span>
                          <span>18.4K</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '0.72rem' }}>
                          <span style={{ fontSize: '1.25rem' }}>💬</span>
                          <span>420</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '0.72rem' }}>
                          <span style={{ fontSize: '1.25rem' }}>↗️</span>
                          <span>Share</span>
                        </div>
                      </div>

                      {/* Bottom Caption & Profile Overlay */}
                      <div style={{ position: 'absolute', bottom: '0', left: '0', right: '50px', padding: '16px 14px', background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)', color: '#FFFFFF' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'linear-gradient(45deg, #F58529, #DD2A7B)' }} />
                          <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>trend.contenter</span>
                        </div>
                        <div style={{ fontSize: '0.78rem', lineHeight: 1.3, maxHeight: '42px', overflow: 'hidden' }}>
                          {instagramCaption ? `${instagramCaption.slice(0, 85)}...` : 'Your Reel caption will overlay here.'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#E2E8F0', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>🎵 Original Audio - trend.contenter</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STORY MOCKUP */}
                  {igTargetFormat === 'STORY' && (
                    <div style={{ height: '480px', position: 'relative', overflow: 'hidden', background: '#0F172A' }}>
                      {/* Media Background */}
                      {customVideoUrl ? (
                        <video src={customVideoUrl} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : heroAsset?.url ? (
                        heroAsset.media_type === 'video' || heroAsset.url.endsWith('.mp4') || heroAsset.url.includes('.mp4') ? (
                          <video src={resolveImageSrc(heroAsset.url)} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <img src={resolveImageSrc(heroAsset.base64 || heroAsset.url)} alt="Story preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        )
                      ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>Story Media</div>
                      )}

                      {/* Top Story Progress Bars */}
                      <div style={{ position: 'absolute', top: '10px', left: '10px', right: '10px', display: 'flex', gap: '4px' }}>
                        <div style={{ flex: 1, height: '2px', background: '#FFFFFF', borderRadius: '2px' }} />
                        <div style={{ flex: 1, height: '2px', background: 'rgba(255,255,255,0.4)', borderRadius: '2px' }} />
                      </div>

                      {/* Profile Header */}
                      <div style={{ position: 'absolute', top: '20px', left: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: '#FFFFFF', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '2px solid #E1306C', background: 'linear-gradient(45deg, #F58529, #DD2A7B)' }} />
                        <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>trend.contenter</span>
                        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.8)' }}>Just now</span>
                      </div>

                      {/* Bottom Story Message Bar */}
                      <div style={{ position: 'absolute', bottom: '12px', left: '12px', right: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ flex: 1, padding: '8px 12px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.6)', background: 'rgba(0,0,0,0.3)', color: '#FFFFFF', fontSize: '0.75rem' }}>
                          Send message...
                        </div>
                        <span style={{ fontSize: '1.2rem', color: '#FFFFFF' }}>❤️</span>
                        <span style={{ fontSize: '1.2rem', color: '#FFFFFF' }}>✈️</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* CHANNEL 2: FACEBOOK PUBLISHER */}
          {publishChannel === 'facebook' && (
            <div className="grid-2">
              {/* Format & Copy Configuration Card */}
              <div className="glass-card">
                {/* Format Selector: Feed Post vs Reel */}
                <div style={{ marginBottom: '16px' }}>
                  <label className="subheading-label" style={{ marginBottom: '8px', display: 'block' }}>
                    Publish Destination &amp; Format
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                    <button
                      type="button"
                      className={fbTargetFormat === 'POST' ? 'btn-primary' : 'btn-outline'}
                      style={{
                        padding: '10px 14px',
                        fontSize: '0.84rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        borderColor: fbTargetFormat === 'POST' ? '#1877F2' : undefined,
                        background: fbTargetFormat === 'POST' ? '#1877F2' : undefined,
                        color: fbTargetFormat === 'POST' ? '#FFFFFF' : undefined,
                      }}
                      onClick={() => setFbTargetFormat('POST')}
                    >
                      <IconMonitor size={16} />
                      <span style={{ fontWeight: 600 }}>Page Feed Post</span>
                    </button>

                    <button
                      type="button"
                      className={fbTargetFormat === 'REEL' ? 'btn-primary' : 'btn-outline'}
                      style={{
                        padding: '10px 14px',
                        fontSize: '0.84rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        borderColor: fbTargetFormat === 'REEL' ? '#0062E0' : undefined,
                        background: fbTargetFormat === 'REEL' ? 'linear-gradient(135deg, #1877F2, #00C6FF)' : undefined,
                        color: fbTargetFormat === 'REEL' ? '#FFFFFF' : undefined,
                      }}
                      onClick={() => setFbTargetFormat('REEL')}
                    >
                      <IconVideo size={16} />
                      <span style={{ fontWeight: 600 }}>Facebook Reel</span>
                    </button>
                  </div>
                </div>

                {/* Feed Post Media Type Switcher: Photo vs Video */}
                {fbTargetFormat === 'POST' && (
                  <div style={{ marginBottom: '14px' }}>
                    <label className="subheading-label" style={{ marginBottom: '6px', display: 'block' }}>
                      Post Media Content
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className={fbPostMediaType === 'IMAGE' ? 'btn-primary' : 'btn-outline'}
                        style={{ padding: '6px 14px', fontSize: '0.78rem' }}
                        onClick={() => setFbPostMediaType('IMAGE')}
                      >
                        Photo Post
                      </button>
                      <button
                        type="button"
                        className={fbPostMediaType === 'VIDEO' ? 'btn-primary' : 'btn-outline'}
                        style={{ padding: '6px 14px', fontSize: '0.78rem' }}
                        onClick={() => setFbPostMediaType('VIDEO')}
                      >
                        Video Post
                      </button>
                    </div>
                  </div>
                )}

                {/* Video Inputs (Title & Video URL) for Video Post & Facebook Reel */}
                {(fbTargetFormat === 'REEL' || (fbTargetFormat === 'POST' && fbPostMediaType === 'VIDEO')) && (
                  <div style={{ marginBottom: '16px', padding: '14px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #CBD5E1', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <label className="subheading-label">
                        {fbTargetFormat === 'REEL' ? 'Reel Title (Optional)' : 'Video Title (Optional)'}
                      </label>
                      <input
                        type="text"
                        className="input-glass"
                        style={{ marginTop: '4px' }}
                        placeholder="e.g. Next-Gen AI Trends Explainer"
                        value={fbVideoTitle}
                        onChange={(e) => setFbVideoTitle(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="subheading-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <IconVideo size={14} color="#1877F2" />
                        <span>Video Asset URL / Media Path (.mp4, .mov)</span>
                      </label>
                      <input
                        type="text"
                        className="input-glass"
                        style={{ marginTop: '4px' }}
                        placeholder="https://your-public-host.com/video.mp4 or /api/v1/content-studio/media/..."
                        value={fbCustomVideoUrl}
                        onChange={(e) => setFbCustomVideoUrl(e.target.value)}
                      />
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Meta Graph API directly ingests hosted video streams. Local assets are automatically synced to GCS.
                      </div>
                    </div>
                  </div>
                )}

                {/* Post Caption & Narrative */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label className="subheading-label" style={{ margin: 0 }}>
                    {fbTargetFormat === 'REEL' ? 'Reel Caption &amp; Description' : 'Post Caption &amp; Narrative'}
                  </label>
                  <button 
                    type="button"
                    className="btn-outline"
                    style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                    onClick={() => copyToClipboard(facebookPostCopy, 'Facebook Post')}
                  >
                    <IconCopy size={12} />
                    <span>Copy</span>
                  </button>
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <textarea 
                    className="input-glass"
                    rows={7}
                    value={facebookPostCopy}
                    onChange={(e) => setFacebookPostCopy(e.target.value)}
                    placeholder="Write your Facebook post..."
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {facebookPostCopy.length} characters
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label className="subheading-label">Active Hashtags</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {(activeConcept?.hashtags || ['trend', 'innovation', 'creator']).map((tag, idx) => (
                      <span key={idx} className="metric-pill metric-pill-cyan" style={{ fontSize: '0.78rem' }}>
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                {!publishingStatus?.facebook?.configured && (!fbPageId.trim() || !fbAccessToken.trim()) && (
                  <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '8px', background: '#FEF3C7', border: '1px solid #FCD34D', color: '#92400E', fontSize: '0.82rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span>⚠️ Facebook credentials not detected.</span>
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ padding: '3px 8px', fontSize: '0.75rem', background: '#FFF' }}
                      onClick={() => {
                        setPublishChannel('facebook');
                        setShowCredentialsPanel(true);
                      }}
                    >
                      Configure Credentials
                    </button>
                  </div>
                )}

                <button 
                  className="btn-primary" 
                  style={{
                    width: '100%',
                    padding: '12px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    background: fbTargetFormat === 'REEL' ? 'linear-gradient(135deg, #1877F2, #00C6FF)' : '#1877F2',
                    boxShadow: '0 4px 14px rgba(24, 119, 242, 0.3)'
                  }}
                  onClick={handlePublishFacebook}
                  disabled={isPublishing}
                >
                  {fbTargetFormat === 'REEL' ? <IconVideo size={16} /> : <IconSend size={16} />}
                  <span>
                    {isPublishing
                      ? 'Publishing to Facebook...'
                      : fbTargetFormat === 'REEL'
                      ? 'Publish Facebook Reel'
                      : fbPostMediaType === 'VIDEO'
                      ? 'Publish Video to Facebook Page'
                      : 'Publish to Facebook Page'}
                  </span>
                </button>
              </div>

              {/* Dynamic Live Mockup */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                  <IconMonitor size={16} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Facebook {fbTargetFormat === 'REEL' ? 'Reel Preview' : (fbPostMediaType === 'VIDEO' ? 'Video Post Preview' : 'Feed Mockup')}
                  </span>
                </div>

                {/* REEL MOCKUP */}
                {fbTargetFormat === 'REEL' ? (
                  <div 
                    style={{
                      width: '320px',
                      height: '480px',
                      borderRadius: '28px',
                      border: '8px solid #1E293B',
                      background: '#0F172A',
                      overflow: 'hidden',
                      boxShadow: 'var(--shadow-modal)',
                      position: 'relative'
                    }}
                  >
                    {/* Video/Image Background */}
                    {fbCustomVideoUrl ? (
                      <video src={fbCustomVideoUrl} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : heroAsset?.url ? (
                      heroAsset.media_type === 'video' || heroAsset.url.endsWith('.mp4') || heroAsset.url.includes('.mp4') ? (
                        <video src={resolveImageSrc(heroAsset.url)} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <img src={resolveImageSrc(heroAsset.base64 || heroAsset.url)} alt="FB Reel preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      )
                    ) : (
                      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>Reel Preview</div>
                    )}

                    {/* Top FB Reels Badge */}
                    <div style={{ position: 'absolute', top: '14px', left: '14px', display: 'flex', alignItems: 'center', gap: '6px', color: '#FFFFFF', fontSize: '0.82rem', fontWeight: 700, textShadow: '0 2px 4px rgba(0,0,0,0.6)' }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>f</div>
                      <span>Reels</span>
                    </div>

                    {/* Right Engagement Actions */}
                    <div style={{ position: 'absolute', right: '12px', bottom: '60px', display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center', color: '#FFFFFF', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '0.72rem' }}>
                        <span style={{ fontSize: '1.25rem' }}>👍</span>
                        <span>24.8K</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '0.72rem' }}>
                        <span style={{ fontSize: '1.25rem' }}>💬</span>
                        <span>810</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '0.72rem' }}>
                        <span style={{ fontSize: '1.25rem' }}>↗️</span>
                        <span>Share</span>
                      </div>
                    </div>

                    {/* Bottom Title & Caption Overlay */}
                    <div style={{ position: 'absolute', bottom: '0', left: '0', right: '50px', padding: '16px 14px', background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)', color: '#FFFFFF' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#1877F2', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem' }}>TC</div>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Trend Contenter Official</span>
                      </div>
                      {fbVideoTitle && (
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '4px', color: '#60A5FA' }}>
                          {fbVideoTitle}
                        </div>
                      )}
                      <div style={{ fontSize: '0.78rem', lineHeight: 1.3, maxHeight: '42px', overflow: 'hidden' }}>
                        {facebookPostCopy ? `${facebookPostCopy.slice(0, 85)}...` : 'Your Facebook Reel caption will appear here.'}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* DESKTOP FEED POST MOCKUP (PHOTO OR VIDEO) */
                  <div style={{ width: '100%', maxWidth: '420px', background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '16px', boxShadow: 'var(--shadow-card)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                      <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#1877F2', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>TC</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0F172A' }}>Trend Contenter Official</div>
                        <div style={{ fontSize: '0.74rem', color: '#64748B' }}>Just now &bull; 🌐</div>
                      </div>
                    </div>

                    {fbPostMediaType === 'VIDEO' && fbVideoTitle && (
                      <h5 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', fontWeight: 700, color: '#1E293B' }}>
                        {fbVideoTitle}
                      </h5>
                    )}

                    <p style={{ fontSize: '0.88rem', color: '#1E293B', marginBottom: '12px', lineHeight: 1.5 }}>
                      {facebookPostCopy ? facebookPostCopy.slice(0, 160) : 'Your Facebook update copy appears here...'}
                    </p>

                    <div style={{ width: '100%', height: '240px', background: '#0F172A', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
                      {fbPostMediaType === 'VIDEO' && fbCustomVideoUrl ? (
                        <video src={fbCustomVideoUrl} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : heroAsset?.url ? (
                        heroAsset.media_type === 'video' || heroAsset.url.endsWith('.mp4') || heroAsset.url.includes('.mp4') ? (
                          <video
                            src={resolveImageSrc(heroAsset.url)}
                            autoPlay
                            loop
                            muted
                            playsInline
                            controls
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <img src={resolveImageSrc(heroAsset.base64 || heroAsset.url)} alt="FB preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        )
                      ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>No Artwork Selected</div>
                      )}
                      {fbPostMediaType === 'VIDEO' && !fbCustomVideoUrl && (!heroAsset?.url || (heroAsset.media_type !== 'video' && !heroAsset.url.endsWith('.mp4') && !heroAsset.url.includes('.mp4'))) && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
                          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', color: '#1877F2' }}>▶</div>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #F1F5F9', color: '#64748B', fontSize: '0.82rem', fontWeight: 600 }}>
                      <span>👍 Like</span>
                      <span>💬 Comment</span>
                      <span>↗️ Share</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CHANNEL 3: CONFIGURABLE EMAIL STUDIO */}
          {publishChannel === 'email' && (
            <div className="grid-2">
              {/* Left Column: Template Configurator */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Campaign Email Template Designer
                </h4>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Customize header styling, visual palette, and CTA button destinations with automatic responsive fallback.
                </p>

                {/* Theme Selector */}
                <div>
                  <label className="subheading-label">Email Color Theme</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                    {Object.entries(EMAIL_THEMES).map(([k, t]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          setEmailTheme(k);
                          setEmailAccentColor(t.primary);
                        }}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: emailTheme === k ? `2px solid ${t.primary}` : '1px solid var(--border-subtle)',
                          background: emailTheme === k ? t.bg : '#FFFFFF',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          textAlign: 'left'
                        }}
                      >
                        <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: t.primary }} />
                        <span style={{ fontSize: '0.82rem', fontWeight: emailTheme === k ? 600 : 400 }}>{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid-2">
                  <div>
                    <label className="subheading-label">Brand Header</label>
                    <input 
                      type="text" 
                      className="input-glass"
                      value={emailBrandHeading}
                      onChange={(e) => setEmailBrandHeading(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="subheading-label">Subtitle</label>
                    <input 
                      type="text" 
                      className="input-glass"
                      value={emailBrandSubtitle}
                      onChange={(e) => setEmailBrandSubtitle(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="subheading-label">Subject Line</label>
                  <input 
                    type="text" 
                    className="input-glass"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Enter email subject line..."
                  />
                </div>

                <div>
                  <label className="subheading-label">Hero Headline</label>
                  <input 
                    type="text" 
                    className="input-glass"
                    value={emailHeadline}
                    onChange={(e) => setEmailHeadline(e.target.value)}
                    placeholder="Main bold headline..."
                  />
                </div>

                <div>
                  <label className="subheading-label">Email Body Content</label>
                  <textarea 
                    className="input-glass"
                    rows={6}
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    placeholder="Email body text..."
                  />
                </div>

                {/* Hero Visual Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                  <input 
                    type="checkbox"
                    id="includeHeroImageCheck"
                    checked={emailIncludeHeroImage}
                    onChange={(e) => setEmailIncludeHeroImage(e.target.checked)}
                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                  />
                  <label htmlFor="includeHeroImageCheck" style={{ fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer', margin: 0 }}>
                    Include Campaign Hero Image in Header
                  </label>
                </div>

                <div className="grid-2">
                  <div>
                    <label className="subheading-label">Primary CTA Label</label>
                    <input 
                      type="text" 
                      className="input-glass"
                      value={emailPrimaryCtaText}
                      onChange={(e) => setEmailPrimaryCtaText(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="subheading-label">Primary CTA Link URL</label>
                    <input 
                      type="text" 
                      className="input-glass"
                      value={emailPrimaryCtaUrl}
                      onChange={(e) => setEmailPrimaryCtaUrl(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid-2">
                  <div>
                    <label className="subheading-label">Secondary CTA Label (Optional)</label>
                    <input 
                      type="text" 
                      className="input-glass"
                      value={emailSecondaryBtnText}
                      onChange={(e) => setEmailSecondaryBtnText(e.target.value)}
                      placeholder="e.g. View Research Dossier"
                    />
                  </div>
                  <div>
                    <label className="subheading-label">Secondary CTA URL</label>
                    <input 
                      type="text" 
                      className="input-glass"
                      value={emailSecondaryBtnUrl}
                      onChange={(e) => setEmailSecondaryBtnUrl(e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                </div>

                <div>
                  <label className="subheading-label">Email Footer Disclaimer / Note</label>
                  <input 
                    type="text" 
                    className="input-glass"
                    value={emailFooterText}
                    onChange={(e) => setEmailFooterText(e.target.value)}
                  />
                </div>

                <div>
                  <label className="subheading-label">Recipient Emails (Comma-separated)</label>
                  <input 
                    type="text" 
                    className="input-glass"
                    value={emailRecipients}
                    onChange={(e) => setEmailRecipients(e.target.value)}
                    placeholder="subscriber1@brand.com, team@agency.com"
                  />
                </div>

                {!publishingStatus?.email?.configured && (
                  <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '8px', background: '#FEF3C7', border: '1px solid #FCD34D', color: '#92400E', fontSize: '0.82rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span>⚠️ Email provider (SendGrid) credentials not detected.</span>
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ padding: '3px 8px', fontSize: '0.75rem', background: '#FFF' }}
                      onClick={() => {
                        setPublishChannel('email');
                        setShowCredentialsPanel(true);
                      }}
                    >
                      Configure Credentials
                    </button>
                  </div>
                )}

                <button 
                  className="btn-primary" 
                  style={{ width: '100%', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: emailAccentColor }}
                  onClick={handlePublishEmail}
                  disabled={isPublishing}
                >
                  <IconSend size={16} />
                  <span>{isPublishing ? 'Dispatching Campaign Email...' : 'Dispatch Campaign Email'}</span>
                </button>
              </div>

              {/* Right Column: Live Dual-View Email Preview */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <IconMail size={16} />
                    <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>Interactive Email Preview</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn-outline"
                      style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                      onClick={() => copyToClipboard(`${emailSubject}\n\n${emailHeadline}\n\n${emailBody}`, 'Email Content')}
                    >
                      <IconCopy size={12} />
                      <span>Copy</span>
                    </button>

                    <div style={{ display: 'flex', gap: '6px', background: '#E2E8F0', padding: '3px', borderRadius: '6px' }}>
                      <button
                        type="button"
                        onClick={() => setEmailPreviewMode('desktop')}
                        style={{
                          padding: '4px 10px',
                          border: 'none',
                          borderRadius: '4px',
                          background: emailPreviewMode === 'desktop' ? '#FFFFFF' : 'transparent',
                          cursor: 'pointer',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <IconMonitor size={12} />
                        <span>Desktop</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmailPreviewMode('mobile')}
                        style={{
                          padding: '4px 10px',
                          border: 'none',
                          borderRadius: '4px',
                          background: emailPreviewMode === 'mobile' ? '#FFFFFF' : 'transparent',
                          cursor: 'pointer',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <IconSmartphone size={12} />
                        <span>Mobile</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Email Mockup Container */}
                <div 
                  style={{
                    width: emailPreviewMode === 'mobile' ? '320px' : '100%',
                    maxWidth: '520px',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: 'var(--shadow-modal)',
                    background: selectedPalette.bg,
                    padding: '24px 16px',
                    border: '1px solid var(--border-subtle)',
                    transition: 'width 0.3s ease'
                  }}
                >
                  {/* Fake Email Client Subject Header */}
                  <div style={{ background: '#FFFFFF', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px', border: '1px solid #E2E8F0', fontSize: '0.8rem' }}>
                    <span style={{ color: '#64748B' }}>Subject: </span>
                    <strong style={{ color: '#0F172A' }}>{emailSubject || 'Campaign Intelligence Update'}</strong>
                  </div>

                  {/* Rendered Email Card */}
                  <div style={{ background: selectedPalette.card, borderRadius: '10px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
                    {/* Header */}
                    <div style={{ padding: '16px 20px', background: emailAccentColor, color: '#FFFFFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '0.5px' }}>{emailBrandHeading || 'TREND CONTENT'}</div>
                        <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>{emailBrandSubtitle || 'Intelligence Notification'}</div>
                      </div>
                      <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: '12px' }}>LIVE</span>
                    </div>

                    {/* Hero Asset */}
                    {emailIncludeHeroImage && heroAsset?.url && (
                      <div style={{ width: '100%', height: '180px', background: '#0F172A' }}>
                        {heroAsset.media_type === 'video' || heroAsset.url.endsWith('.mp4') ? (
                          <video src={resolveImageSrc(heroAsset.url)} controls autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <img src={resolveImageSrc(heroAsset.base64 || heroAsset.url)} alt="Email hero" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        )}
                      </div>
                    )}

                    {/* Stripe */}
                    <div style={{ height: '4px', background: '#E8112D' }} />

                    {/* Body */}
                    <div style={{ padding: '24px 20px', color: selectedPalette.text }}>
                      {emailHeadline && (
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: emailAccentColor, margin: '0 0 12px 0', lineHeight: 1.25 }}>
                          {emailHeadline}
                        </h2>
                      )}

                      <div style={{ fontSize: '0.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {emailBody || 'Your campaign update text will render cleanly here in high-legibility formatting.'}
                      </div>

                      {/* Primary & Secondary CTAs */}
                      <div style={{ marginTop: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <a 
                          href={emailPrimaryCtaUrl || '#'}
                          onClick={(e) => e.preventDefault()}
                          style={{
                            display: 'inline-block',
                            background: emailAccentColor,
                            color: '#FFFFFF',
                            padding: '10px 22px',
                            borderRadius: '6px',
                            textDecoration: 'none',
                            fontWeight: 700,
                            fontSize: '0.85rem'
                          }}
                        >
                          {emailPrimaryCtaText || 'Explore Campaign'} →
                        </a>
                        {emailSecondaryBtnText && (
                          <a 
                            href={emailSecondaryBtnUrl || '#'}
                            onClick={(e) => e.preventDefault()}
                            style={{
                              display: 'inline-block',
                              background: '#F1F5F9',
                              color: '#334155',
                              padding: '10px 18px',
                              borderRadius: '6px',
                              textDecoration: 'none',
                              fontWeight: 600,
                              fontSize: '0.85rem',
                              border: '1px solid #CBD5E1'
                            }}
                          >
                            {emailSecondaryBtnText}
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Footer */}
                    <div style={{ padding: '14px 20px', background: selectedPalette.bg, borderTop: '1px solid var(--border-subtle)', textAlign: 'center', fontSize: '0.72rem', color: '#64748B' }}>
                      <div>{emailFooterText}</div>
                      <div style={{ marginTop: '4px', opacity: 0.8 }}>&copy; Trend Contenter Studio</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Dispatch History Log */}
          {publishHistory.length > 0 && (
            <div className="glass-card">
              <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px' }}>Published Campaign Log (This Session)</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {publishHistory.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className={`badge ${item.platform === 'instagram' ? 'badge-amber' : item.platform === 'facebook' ? 'badge-cyan' : 'badge-emerald'}`}>
                        {item.platform.toUpperCase()}
                      </span>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{item.title}</span>
                      <span style={{ fontSize: '0.78rem', color: '#64748B' }}>Ref: {item.id}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '0.78rem', color: '#64748B' }}>{item.timestamp}</span>
                      {item.url && (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: '#1A73E8', fontWeight: 600 }}>
                          View Live →
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
