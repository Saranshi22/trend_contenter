import React, { useState, useEffect, useRef } from 'react';
import type { 
  Opportunity, 
  GeneratedImageItem, 
  GenerateImageResponse,
  RecommendImagesResponse,
  RecommendedImageItem,
  ContentExperimentVariant,
  GenerateExperimentsResponse,
  PublishingStatusResponse,
  PublishResult
} from '../types';
import { API_BASE } from '../apiConfig';
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
  IconLock
} from '../components/Icons';

interface ContentStudioPageProps {
  opportunities: Opportunity[];
  onSelectBrief: (opp: Opportunity) => void;
  onDownloadPdf: (oppId: string) => void;
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
// Live Cooking Progress Banner Component
// ==============================================================
interface CookingBannerProps {
  title: string;
  stepMessage: string;
  stepIndex: number;
  totalSteps: number;
  stepsList: string[];
  progressPercent: number;
  accentColor?: string;
}

const CookingBanner: React.FC<CookingBannerProps> = ({
  title,
  stepMessage,
  stepIndex,
  stepsList,
  progressPercent,
  accentColor = '#1A73E8'
}) => {
  return (
    <div className="cooking-banner animate-fade-in" style={{ borderColor: accentColor }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="pulsing-cook-dot" style={{ background: accentColor }} />
          <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {title}
          </h4>
          <span className="badge badge-cyan" style={{ fontSize: '0.74rem' }}>
            In Progress
          </span>
        </div>
        <div style={{ fontSize: '0.86rem', fontWeight: 700, color: accentColor }}>
          {progressPercent}% Complete
        </div>
      </div>

      {/* Progress Track */}
      <div style={{ width: '100%', height: '8px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden', marginBottom: '14px' }}>
        <div 
          style={{ 
            height: '100%', 
            width: `${progressPercent}%`, 
            background: `linear-gradient(90deg, ${accentColor}, #0F9D9A)`, 
            borderRadius: '4px', 
            transition: 'width 0.4s ease' 
          }} 
        />
      </div>

      {/* Active Step Message */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#FFFFFF', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', marginBottom: '12px' }}>
        <IconSparkles size={16} color={accentColor} />
        <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          {stepMessage}
        </span>
      </div>

      {/* Real-time Checklist */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {stepsList.map((step, idx) => {
          const isDone = idx < stepIndex;
          const isCurrent = idx === stepIndex;
          return (
            <div 
              key={idx} 
              style={{
                fontSize: '0.74rem',
                padding: '4px 8px',
                borderRadius: '4px',
                background: isDone ? '#E6F4EA' : isCurrent ? '#E8F0FE' : '#F1F5F9',
                color: isDone ? '#137333' : isCurrent ? accentColor : '#64748B',
                fontWeight: isCurrent ? 700 : 500,
                border: isCurrent ? `1px solid ${accentColor}` : '1px solid transparent',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.25s ease'
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
  onDownloadPdf
}) => {
  // -------------------------------------------------------------
  // Content Supply Chain Journey State
  // -------------------------------------------------------------
  const [currentStage, setCurrentStage] = useState<JourneyStage>('brief');
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Stage 1: Campaign Profile & Brief State
  const selectedOpps = opportunities.filter(o => o.status === 'selected');
  const [activeOpportunity, setActiveOpportunity] = useState<Opportunity | null>(selectedOpps[0] || null);
  const [briefText, setBriefText] = useState<string>('');
  const [briefFileBase64, setBriefFileBase64] = useState<string | null>(null);
  const [briefFileName, setBriefFileName] = useState<string | null>(null);
  const [briefFileMime, setBriefFileMime] = useState<string>('application/pdf');
  const [numAssetsConfig, setNumAssetsConfig] = useState<number>(4); // Default 4 images & 4 recommended
  const [showSecondaryBriefOptions, setShowSecondaryBriefOptions] = useState<boolean>(false);
  const [campaignGoal, setCampaignGoal] = useState<string>('engagement');
  const [brandTone, setBrandTone] = useState<string>('authoritative');
  const [targetAudienceInput, setTargetAudienceInput] = useState<string>('');

  // Stage 2: Content Concepts State
  const [isGeneratingConcepts, setIsGeneratingConcepts] = useState<boolean>(false);
  const [conceptsData, setConceptsData] = useState<GenerateExperimentsResponse | null>(null);
  const [activeConcept, setActiveConcept] = useState<ContentExperimentVariant | null>(null);

  // Stage 3: Image Generation (HIGHLIGHT) & Recommended Visual Assets (OPTIONAL AID)
  const [isGeneratingImages, setIsGeneratingImages] = useState<boolean>(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImageItem[]>([]);
  const [imagePrompt, setImagePrompt] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<string>('1:1');
  const [stylePreset, setStylePreset] = useState<string>('photorealistic');
  const [numImagesToGenerate, setNumImagesToGenerate] = useState<number>(4); // Default 4
  const [heroAsset, setHeroAsset] = useState<{ url: string; base64?: string; title?: string } | null>(null);

  // Optional Aid: Recommended References from Google Search
  const [isCuratingAssets, setIsCuratingAssets] = useState<boolean>(false);
  const [curatedAssets, setCuratedAssets] = useState<RecommendedImageItem[]>([]);
  const [searchQueryInput, setSearchQueryInput] = useState<string>('');
  const [selectedReferenceAsset, setSelectedReferenceAsset] = useState<RecommendedImageItem | null>(null);

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
  const [facebookPostCopy, setFacebookPostCopy] = useState<string>('');
  
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
    stageName: string;
    stepMessage: string;
    stepIndex: number;
    totalSteps: number;
    stepsList: string[];
    progressPercent: number;
    accentColor: string;
  }>({
    isCooking: false,
    stageName: '',
    stepMessage: '',
    stepIndex: 0,
    totalSteps: 0,
    stepsList: [],
    progressPercent: 0,
    accentColor: '#1A73E8'
  });

  const cookingIntervalRef = useRef<any>(null);

  const startCooking = (stageName: string, stepsList: string[], accentColor: string = '#1A73E8') => {
    if (cookingIntervalRef.current) clearInterval(cookingIntervalRef.current);
    
    let currentStep = 0;
    setCookingState({
      isCooking: true,
      stageName,
      stepMessage: stepsList[0] || 'Cooking campaign assets...',
      stepIndex: 0,
      totalSteps: stepsList.length,
      stepsList,
      progressPercent: 15,
      accentColor
    });

    cookingIntervalRef.current = setInterval(() => {
      currentStep++;
      if (currentStep < stepsList.length) {
        const pct = Math.min(92, Math.round(((currentStep + 1) / stepsList.length) * 88));
        setCookingState(prev => ({
          ...prev,
          stepIndex: currentStep,
          stepMessage: stepsList[currentStep] || prev.stepMessage,
          progressPercent: pct
        }));
      }
    }, 2200);
  };

  const stopCooking = (finalMsg?: string) => {
    if (cookingIntervalRef.current) {
      clearInterval(cookingIntervalRef.current);
      cookingIntervalRef.current = null;
    }
    setCookingState(prev => ({
      ...prev,
      progressPercent: 100,
      stepMessage: finalMsg || 'Asset ready!'
    }));
    setTimeout(() => {
      setCookingState(prev => ({ ...prev, isCooking: false, progressPercent: 0 }));
    }, 600);
  };

  useEffect(() => {
    return () => {
      if (cookingIntervalRef.current) clearInterval(cookingIntervalRef.current);
    };
  }, []);

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

  useEffect(() => {
    fetchPublishingStatus();
  }, []);

  // Sync opportunity context when activeOpportunity changes
  useEffect(() => {
    if (activeOpportunity) {
      setTargetAudienceInput(activeOpportunity.audience_label || '');
      setBriefText(
        `Campaign Opportunity: ${activeOpportunity.title}\n` +
        `Target Audience: ${activeOpportunity.audience_label || 'Target Demographic'}\n` +
        `Content Void / Gap: ${activeOpportunity.content_gap || ''}\n` +
        `Recommended Angle: ${activeOpportunity.recommended_angle || ''}`
      );
    }
  }, [activeOpportunity]);

  // Sync copy and prompts when activeConcept changes
  useEffect(() => {
    if (activeConcept) {
      setInstagramCaption(activeConcept.instagram_copy);
      setFacebookPostCopy(activeConcept.facebook_copy);
      setEmailSubject(activeConcept.email_subject);
      setEmailHeadline(activeConcept.hook || activeConcept.title);
      setEmailBody(activeConcept.email_body);
      setEmailPrimaryCtaText(activeConcept.email_cta_text || 'Explore Campaign');
      setEmailPrimaryCtaUrl(activeConcept.email_cta_url || 'https://trendcontenter.com/');
      setSearchQueryInput(activeConcept.search_query);
      setImagePrompt(activeConcept.visual_direction || activeConcept.search_query);
      setSelectedReferenceAsset(null);
    }
  }, [activeConcept]);

  // Handle Drag & Drop Brief File (Encouraged Primary Action)
  const handleBriefFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(',')[1];
      setBriefFileBase64(base64);
      setBriefFileName(file.name);
      setBriefFileMime(file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'text/markdown'));
      notify(`Loaded brief document: ${file.name}`, 'success');
    };
    reader.readAsDataURL(file);
  };

  // STEP 1 -> STEP 2: Turn Brief into Creative Concepts
  const handleGenerateConcepts = async () => {
    if (!briefText && !briefFileBase64 && !activeOpportunity) {
      notify('Please upload your campaign brief document to proceed.', 'error');
      return;
    }

    setIsGeneratingConcepts(true);
    startCooking('Synthesizing Creative Concepts from Brief', [
      briefFileName ? `Digesting uploaded brief "${briefFileName}"...` : 'Extracting audience pain points & market friction...',
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

      if (briefFileBase64) {
        payload.brief_file_base64 = briefFileBase64;
        payload.brief_file_mime = briefFileMime;
      } else if (briefText) {
        payload.brief_text = briefText;
      }

      if (activeOpportunity && !briefFileBase64) {
        payload.opportunity_id = activeOpportunity.opportunity_id;
      }

      const res = await fetch(`${API_BASE}/content-studio/experiments/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data: GenerateExperimentsResponse = await res.json();
        setConceptsData(data);
        if (data.variants && data.variants.length > 0) {
          setActiveConcept(data.variants[0]);
        }
        stopCooking('Creative Concepts ready!');
        setCurrentStage('concepts');
        notify('Creative Concepts generated from your brief!', 'success');
      } else {
        const err = await res.json();
        stopCooking();
        notify(`Concepts generation failed: ${err.detail || 'Server error'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      stopCooking();
      notify('Network error generating concepts.', 'error');
    } finally {
      setIsGeneratingConcepts(false);
    }
  };

  // STEP 2 -> STEP 3: Select Concept & Proceed to Image Generation Studio
  const handleSelectConceptAndProceed = async (concept: ContentExperimentVariant) => {
    setActiveConcept(concept);
    setImagePrompt(concept.visual_direction || concept.search_query);
    setSearchQueryInput(concept.search_query);
    setCurrentStage('assets');
    notify(`Selected "${concept.title}". Preparing generation studio...`, 'info');

    // Automatically curate recommended visual references as optional inspiration aid
    triggerCurateAssets(concept.search_query, numAssetsConfig);

    // Automatically generate 4 initial campaign images based on the chosen concept
    triggerGenerateImages(concept.visual_direction || concept.search_query, numAssetsConfig);
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
      const res = await fetch(`${API_BASE}/content-studio/images/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          number_of_images: count,
          aspect_ratio: aspectRatio,
          style_preset: stylePreset,
          enhance_prompt: true
        })
      });

      if (res.ok) {
        const data: GenerateImageResponse = await res.json();
        setGeneratedImages(data.images || []);
        if (data.images && data.images.length > 0) {
          setHeroAsset({
            url: data.images[0].url,
            base64: data.images[0].image_base64,
            title: `Generated Campaign Image #1`
          });
          stopCooking(`Generated ${data.images.length} campaign visuals!`);
          notify(`Generated ${data.images.length} new campaign images!`, 'success');
        } else {
          stopCooking('No images generated.');
          notify('No image candidates generated. Try adjusting prompt keywords.', 'info');
        }
      } else {
        const err = await res.json();
        stopCooking();
        notify(`Image generation failed: ${err.detail || 'Server error'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      stopCooking();
      notify('Network error generating images.', 'error');
    } finally {
      setIsGeneratingImages(false);
    }
  };

  // Curate Recommended Assets from Google Search (OPTIONAL INSPIRATION AID)
  const triggerCurateAssets = async (query: string, count: number = numAssetsConfig) => {
    if (!query.trim()) return;
    setIsCuratingAssets(true);
    try {
      const res = await fetch(`${API_BASE}/content-studio/images/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: query,
          num_results: count,
          reranker_model: 'gemini'
        })
      });

      if (res.ok) {
        const data: RecommendImagesResponse = await res.json();
        setCuratedAssets(data.recommendations || []);
      }
    } catch (err) {
      console.warn('Could not curate recommended reference imagery:', err);
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
      const enriched = `${base}. Style and aesthetic inspired by: ${item.title}`;
      setImagePrompt(enriched);
      notify(`Using "${item.title.slice(0, 32)}..." as visual inspiration aid!`, 'success');
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
          setHeroAsset({
            url: editedImg.url,
            base64: editedImg.image_base64,
            title: `Retouched: ${editorPrompt.slice(0, 30)}`
          });
          stopCooking('Retouch applied successfully!');
          notify('Natural language edit applied successfully!', 'success');
          setIsRetouchOpen(false);
        }
      } else {
        const err = await res.json();
        stopCooking();
        notify(`Retouch failed: ${err.detail || 'Could not apply edit'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      stopCooking();
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

  // Publish to Facebook
  const handlePublishFacebook = async () => {
    if (!heroAsset || !heroAsset.url) {
      notify('Please select an artwork asset for Facebook publishing.', 'error');
      return;
    }
    setIsPublishing(true);
    startCooking('Publishing to Facebook Page', [
      'Connecting to Facebook Graph gateway...',
      'Validating Page ID and Access Token...',
      'Uploading media container & post caption...',
      'Confirming live publication...'
    ], '#1877F2');

    try {
      const payload: any = {
        image_url: resolvePublishImageUrl(heroAsset.url),
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
        stopCooking('Published to Facebook!');
        notify(data.message || 'Published to Facebook Page!', 'success');
        setPublishHistory(prev => [
          { platform: 'facebook', id: data.post_id || 'fb_post', url: data.url || undefined, timestamp: new Date().toLocaleTimeString(), title: activeConcept?.title || 'Facebook Post' },
          ...prev
        ]);
        fetchPublishingStatus();
      } else {
        const err = await res.json();
        stopCooking();
        notify(`Facebook publish failed: ${err.detail || 'Check credentials'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      stopCooking();
      notify('Network error publishing to Facebook.', 'error');
    } finally {
      setIsPublishing(false);
    }
  };

  // Publish to Instagram
  const handlePublishInstagram = async () => {
    if (!heroAsset || !heroAsset.url) {
      notify('Please select an artwork asset for Instagram publishing.', 'error');
      return;
    }
    setIsPublishing(true);
    startCooking('Publishing to Instagram Feed', [
      'Connecting to Instagram Content Publishing API...',
      'Validating Instagram User ID & Token...',
      'Creating media container & attaching caption...',
      'Publishing container to live feed...'
    ], '#E1306C');

    try {
      const payload: any = {
        image_url: resolvePublishImageUrl(heroAsset.url),
        text: instagramCaption,
        hashtags: activeConcept?.hashtags || []
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
        stopCooking('Published to Instagram!');
        notify(data.message || 'Published to Instagram Feed!', 'success');
        setPublishHistory(prev => [
          { platform: 'instagram', id: data.post_id || 'ig_post', url: data.url || undefined, timestamp: new Date().toLocaleTimeString(), title: activeConcept?.title || 'Instagram Post' },
          ...prev
        ]);
        fetchPublishingStatus();
      } else {
        const err = await res.json();
        stopCooking();
        notify(`Instagram publish failed: ${err.detail || 'Check credentials'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      stopCooking();
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
        stopCooking('Email broadcast dispatched!');
        notify(data.message || 'Campaign Email successfully sent!', 'success');
        setPublishHistory(prev => [
          { platform: 'email', id: data.post_id || 'email_msg', timestamp: new Date().toLocaleTimeString(), title: emailSubject || 'Email Campaign' },
          ...prev
        ]);
        fetchPublishingStatus();
      } else {
        const err = await res.json();
        stopCooking();
        notify(`Email dispatch failed: ${err.detail || 'Check credentials'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      stopCooking();
      notify('Network error dispatching email.', 'error');
    } finally {
      setIsPublishing(false);
    }
  };

  const selectedPalette = EMAIL_THEMES[emailTheme] || EMAIL_THEMES.modern_blue;

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

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {cookingState.isCooking ? (
              <span className="metric-pill metric-pill-cyan" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="pulsing-cook-dot" />
                <span>Active Operation In Progress...</span>
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
            { id: 'brief', num: '1', title: 'Campaign Brief', desc: briefFileName ? `Uploaded: ${briefFileName.slice(0, 18)}...` : activeOpportunity ? 'Strategy Selected' : 'Upload Brief Document' },
            { id: 'concepts', num: '2', title: 'Choose Concept', desc: activeConcept ? activeConcept.variant_label : 'Select Creative Angle' },
            { id: 'assets', num: '3', title: 'Generate & Retouch Artwork', desc: heroAsset ? 'Active Artwork Ready' : 'Generate 4 Campaign Visuals' },
            { id: 'publish', num: '4', title: 'Publish & Channels', desc: 'Setup & Dispatch Live' }
          ].map((step) => {
            const isActive = currentStage === step.id;
            const isCompleted = (
              (step.id === 'brief' && (conceptsData !== null || briefFileBase64 !== null || activeOpportunity !== null)) ||
              (step.id === 'concepts' && activeConcept !== null) ||
              (step.id === 'assets' && heroAsset !== null)
            );
            return (
              <button
                key={step.id}
                onClick={() => setCurrentStage(step.id as JourneyStage)}
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

      {/* Global Live Cooking Banner (Active when any process is cooking) */}
      {cookingState.isCooking && (
        <CookingBanner 
          title={cookingState.stageName}
          stepMessage={cookingState.stepMessage}
          stepIndex={cookingState.stepIndex}
          totalSteps={cookingState.totalSteps}
          stepsList={cookingState.stepsList}
          progressPercent={cookingState.progressPercent}
          accentColor={cookingState.accentColor}
        />
      )}

      {/* Persistent Campaign Summary Bar */}
      {(activeOpportunity || activeConcept || heroAsset) && (
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
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="badge badge-cyan" style={{ fontSize: '0.75rem' }}>Campaign</span>
              <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                {activeOpportunity?.title || conceptsData?.campaign_title || briefFileName || 'Custom Campaign'}
              </span>
            </div>

            {activeConcept && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="badge badge-amber" style={{ fontSize: '0.72rem' }}>
                  {activeConcept.variant_label}
                </span>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  "{activeConcept.hook.slice(0, 45)}..."
                </span>
              </div>
            )}

            {heroAsset && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="badge badge-emerald" style={{ fontSize: '0.72rem' }}>Active Artwork</span>
                <img src={resolveImageSrc(heroAsset.base64 || heroAsset.url)} alt="Artwork thumb" style={{ width: '24px', height: '24px', borderRadius: '4px', objectFit: 'cover' }} />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {currentStage !== 'publish' && (
              <button 
                className="btn-primary" 
                style={{ padding: '6px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => {
                  if (currentStage === 'brief') setCurrentStage('concepts');
                  else if (currentStage === 'concepts') setCurrentStage('assets');
                  else if (currentStage === 'assets') setCurrentStage('publish');
                }}
              >
                <span>Continue Pipeline</span>
                <IconArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STAGE 1: BRIEF INGESTION (ENCOURAGING FILE UPLOADS)            */}
      {/* ============================================================== */}
      {currentStage === 'brief' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* PRIMARY HERO: Encouraged Brief Document Upload */}
          <div className="glass-card" style={{ border: '2px solid #1A73E8', background: '#FAFCFF', padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px', marginBottom: '18px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span className="badge badge-emerald" style={{ fontSize: '0.78rem', fontWeight: 700 }}>
                    Recommended Workflow
                  </span>
                  <span style={{ fontSize: '0.82rem', color: '#1A73E8', fontWeight: 600 }}>
                    Fastest &amp; Most Comprehensive Strategy
                  </span>
                </div>
                <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Upload Your Campaign Brief Document
                </h2>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '6px 0 0 0', maxWidth: '780px', lineHeight: 1.5 }}>
                  Instead of typing fragmented notes in UI forms, upload your complete editorial brief, client brief PDF, presentation, or brand document. The studio extracts the friction points, audience hook, and aesthetic directives automatically.
                </p>
              </div>

              {/* Asset Generation Count Selector (Default: 4) */}
              <div style={{ background: '#FFFFFF', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Images to Generate &amp; Curate
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[2, 4].map(count => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => {
                        setNumAssetsConfig(count);
                        setNumImagesToGenerate(count);
                      }}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        border: numAssetsConfig === count ? '2px solid #1A73E8' : '1px solid var(--border-subtle)',
                        background: numAssetsConfig === count ? '#E8F0FE' : '#FFFFFF',
                        color: numAssetsConfig === count ? '#1A73E8' : 'var(--text-primary)',
                        fontWeight: numAssetsConfig === count ? 700 : 500,
                        cursor: 'pointer',
                        fontSize: '0.84rem'
                      }}
                    >
                      {count} Images {count === 4 ? '(Default)' : ''}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Drag & Drop Hero Box */}
            <label 
              htmlFor="hero-brief-upload" 
              className="studio-dropzone active"
              style={{
                display: 'block',
                padding: '40px 24px',
                textAlign: 'center',
                borderRadius: '12px',
                background: briefFileName ? '#EBF3FE' : '#F0F7FF',
                border: briefFileName ? '2px solid #1A73E8' : '2px dashed #1A73E8',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                marginBottom: '20px'
              }}
            >
              <input 
                id="hero-brief-upload" 
                type="file" 
                accept=".pdf,.docx,.doc,.md,.txt" 
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleBriefFileUpload(e.target.files[0]);
                  }
                }}
              />

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#FFFFFF', border: '1px solid #CBD5E1', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-sm)' }}>
                  {briefFileName ? <IconCheck size={28} color="#188038" /> : <IconUpload size={28} color="#1A73E8" />}
                </div>

                {briefFileName ? (
                  <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1A73E8' }}>
                      Ready: {briefFileName}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '4px' }}>
                      Click to replace or upload another brief document (PDF, Word, Markdown, Text)
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Drag &amp; drop your brief file here, or click to browse
                    </div>
                    <div style={{ fontSize: '0.84rem', color: '#64748B', marginTop: '4px' }}>
                      Supports PDF dossiers, Word documents (.docx), Markdown briefs, or strategy notes
                    </div>
                  </div>
                )}
              </div>
            </label>

            {/* Campaign Parameters Preview */}
            <div className="grid-3" style={{ marginBottom: '20px' }}>
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
                <label className="subheading-label">Target Audience Override (Optional)</label>
                <input 
                  type="text"
                  className="input-glass"
                  placeholder="e.g. Gen-Z Creators, Founders, B2B Marketers"
                  value={targetAudienceInput}
                  onChange={(e) => setTargetAudienceInput(e.target.value)}
                />
              </div>
            </div>

            {/* Action Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
              <button
                type="button"
                className="btn-outline"
                style={{ padding: '8px 14px', fontSize: '0.82rem' }}
                onClick={() => setShowSecondaryBriefOptions(!showSecondaryBriefOptions)}
              >
                {showSecondaryBriefOptions ? 'Hide Manual Notes / Staged Radar' : '+ Or Use Staged Radar Opportunity / Manual Notes'}
              </button>

              <button 
                className="btn-primary" 
                style={{ padding: '14px 32px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700 }}
                onClick={handleGenerateConcepts}
                disabled={isGeneratingConcepts}
              >
                {isGeneratingConcepts ? (
                  <>
                    <span className="pulsing-cook-dot" style={{ background: '#FFFFFF' }} />
                    <span>Synthesizing Creative Concepts...</span>
                  </>
                ) : (
                  <>
                    <IconSparkles size={18} />
                    <span>Turn Brief into Concepts (3 Angles) &rarr;</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* SECONDARY / COLLAPSIBLE: Staged Opportunities or Manual Notes */}
          {showSecondaryBriefOptions && (
            <div className="glass-card animate-fade-in" style={{ background: '#FFFFFF', border: '1px solid #CBD5E1' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '6px' }}>
                Alternative: Staged Intelligence Opportunities &amp; Notes
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                You can select an opportunity from the Intelligence Radar or type manual strategic notes instead of uploading a brief document.
              </p>

              {/* Staged Opportunities Row */}
              {selectedOpps.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Staged Radar Opportunities ({selectedOpps.length})
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
                    {selectedOpps.map(opp => {
                      const isSelected = activeOpportunity?.opportunity_id === opp.opportunity_id;
                      return (
                        <div 
                          key={opp.opportunity_id}
                          onClick={() => {
                            setActiveOpportunity(opp);
                            notify(`Selected opportunity: ${opp.title}`, 'info');
                          }}
                          style={{
                            padding: '12px',
                            borderRadius: '8px',
                            background: isSelected ? '#EBF3FE' : '#F8FAFC',
                            border: isSelected ? '2px solid #1A73E8' : '1px solid var(--border-subtle)',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <span className="badge badge-cyan" style={{ fontSize: '0.72rem' }}>{opp.audience_label || 'Persona'}</span>
                              <span className="badge badge-emerald" style={{ fontSize: '0.72rem' }}>Score: {Math.round(opp.score * 100)}%</span>
                            </div>
                            <h5 style={{ fontSize: '0.92rem', fontWeight: 600, margin: '0 0 4px 0' }}>{opp.title}</h5>
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>{opp.content_gap || opp.recommended_angle}</p>
                          </div>
                          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', color: isSelected ? '#1A73E8' : 'var(--text-muted)', fontWeight: isSelected ? 700 : 400 }}>
                              {isSelected ? '✓ Selected as Context' : 'Click to Select'}
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
                              {onDownloadPdf && (
                                <button
                                  type="button"
                                  className="btn-outline"
                                  style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                                  onClick={(e) => { e.stopPropagation(); onDownloadPdf(opp.opportunity_id); }}
                                  title="Download Brief PDF"
                                >
                                  PDF
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Manual Brief Notes Textarea */}
              <div>
                <label className="subheading-label">Manual Strategy / Brief Notes</label>
                <textarea 
                  className="input-glass"
                  rows={4}
                  placeholder="Paste additional notes or pain points here if not uploading a file..."
                  value={briefText}
                  onChange={(e) => setBriefText(e.target.value)}
                  style={{ fontSize: '0.86rem' }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* STAGE 2: CHOOSE CREATIVE CONCEPT                               */}
      {/* ============================================================== */}
      {currentStage === 'concepts' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <span className="badge badge-cyan" style={{ marginBottom: '6px' }}>Stage 2: Concepts</span>
                <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', fontWeight: 700, margin: 0 }}>
                  Select a Creative Campaign Concept
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Choose among 3 distinct strategic angles synthesized from your brief. Selecting a concept immediately launches the Campaign Image Studio and curates optional inspiration references.
                </p>
              </div>

              <button 
                className="btn-outline" 
                style={{ padding: '8px 14px', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={handleGenerateConcepts}
                disabled={isGeneratingConcepts}
              >
                <IconRefresh size={14} />
                <span>Re-Generate Concepts</span>
              </button>
            </div>

            {/* 3 Side-by-side Concept Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px' }}>
              {conceptsData?.variants.map((v) => {
                const isSelected = activeConcept?.id === v.id;
                const badgeColor = v.variant_type === 'trend_jacker' ? 'badge-amber' : v.variant_type === 'educational_solution' ? 'badge-cyan' : 'badge-emerald';

                return (
                  <div 
                    key={v.id}
                    style={{
                      borderRadius: '12px',
                      background: isSelected ? '#FFFFFF' : '#F8FAFC',
                      border: isSelected ? '2px solid #1A73E8' : '1px solid var(--border-subtle)',
                      boxShadow: isSelected ? 'var(--shadow-modal)' : 'var(--shadow-card)',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div>
                      {/* Top Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <span className={`badge ${badgeColor}`}>{v.variant_label}</span>
                        <span className="badge badge-emerald">Audience Fit: {Math.round(v.audience_fit_score * 100)}%</span>
                      </div>

                      <h4 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                        {v.title}
                      </h4>

                      {/* Hook */}
                      <div style={{ background: '#F1F5F9', borderRadius: '6px', padding: '10px 12px', marginBottom: '14px', borderLeft: '3px solid #1A73E8' }}>
                        <div style={{ fontSize: '0.74rem', textTransform: 'uppercase', fontWeight: 700, color: '#64748B', marginBottom: '2px' }}>Scroll-Stopping Hook</div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>"{v.hook}"</div>
                      </div>

                      {/* Strategy Angle */}
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '16px' }}>
                        {v.angle}
                      </p>

                      {/* Visual Generation Direction */}
                      <div style={{ background: '#EBF3FE', padding: '10px 12px', borderRadius: '6px', marginBottom: '14px', fontSize: '0.8rem', color: '#1A73E8' }}>
                        <div style={{ fontWeight: 700, marginBottom: '2px' }}>Visual Direction:</div>
                        <div>"{v.visual_direction}"</div>
                      </div>

                      {/* Cross-channel Copy Previews */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', fontSize: '0.78rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                          <IconInstagram size={14} color="#E1306C" />
                          <span style={{ fontWeight: 600 }}>Instagram:</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{v.instagram_copy}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                          <IconMail size={14} color="#004B93" />
                          <span style={{ fontWeight: 600 }}>Email Subject:</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{v.email_subject}</span>
                        </div>
                      </div>
                    </div>

                    <button 
                      className="btn-primary"
                      style={{ width: '100%', padding: '12px 16px', fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                      onClick={() => handleSelectConceptAndProceed(v)}
                    >
                      <IconCheck size={16} />
                      <span>Select Concept &amp; Generate {numAssetsConfig} Images &rarr;</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* STAGE 3: IMAGE GENERATION (HIGHLIGHT) & OPTIONAL REFERENCE AID */}
      {/* ============================================================== */}
      {currentStage === 'assets' && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Active Concept Header */}
          <div className="glass-card" style={{ padding: '16px 20px', background: '#FAFCFF', border: '1px solid #D2E3FC' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="badge badge-amber">{activeConcept?.variant_label || 'Active Concept'}</span>
                  <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                    {activeConcept?.title || 'Campaign Concept'}
                  </span>
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  "{activeConcept?.hook}" &bull; Visual generation tailored to audience resonance.
                </div>
              </div>

              {heroAsset && (
                <button 
                  className="btn-emerald" 
                  style={{ padding: '10px 22px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                  onClick={handleProceedToPublish}
                >
                  <IconSend size={16} />
                  <span>Ready to Publish &rarr;</span>
                </button>
              )}
            </div>
          </div>

          {/* OPTIONAL AID: Recommended Visual References (from Google Search) */}
          <div className="glass-card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="badge badge-cyan" style={{ fontSize: '0.72rem' }}>Optional Inspiration Aid</span>
                  <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                    Recommended Visual References ({curatedAssets.length})
                  </h4>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Curated from Google search to ground creative visuals in verified trends. Click any reference below to use its style/aesthetic as inspiration for generating your images.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input 
                  type="text"
                  className="input-glass"
                  style={{ width: '220px', padding: '6px 10px', fontSize: '0.8rem' }}
                  value={searchQueryInput}
                  onChange={(e) => setSearchQueryInput(e.target.value)}
                  placeholder="Reference search query..."
                />
                <button 
                  className="btn-outline" 
                  style={{ padding: '6px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => triggerCurateAssets(searchQueryInput, numAssetsConfig)}
                  disabled={isCuratingAssets}
                >
                  <IconRefresh size={12} />
                  <span>{isCuratingAssets ? 'Curating...' : 'Refresh'}</span>
                </button>
              </div>
            </div>

            {/* Curated Reference Cards Carousel/Row */}
            {isCuratingAssets ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                {Array.from({ length: numAssetsConfig }).map((_, idx) => (
                  <div key={idx} className="skeleton-card skeleton-shimmer" style={{ height: '140px', borderRadius: '8px' }} />
                ))}
              </div>
            ) : curatedAssets.length === 0 ? (
              <div style={{ padding: '16px', background: '#F8FAFC', borderRadius: '8px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                No reference images found for this query. You can generate images directly using the studio prompt below.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                {curatedAssets.map(item => {
                  const isReferenced = selectedReferenceAsset?.id === item.id;
                  return (
                    <div 
                      key={item.id}
                      onClick={() => handleToggleReferenceAsset(item)}
                      style={{
                        borderRadius: '8px',
                        overflow: 'hidden',
                        background: isReferenced ? '#E8F0FE' : '#FFFFFF',
                        border: isReferenced ? '2px solid #1A73E8' : '1px solid var(--border-subtle)',
                        boxShadow: isReferenced ? 'var(--shadow-card-hover)' : 'var(--shadow-sm)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        flexDirection: 'column'
                      }}
                    >
                      <div style={{ position: 'relative', height: '120px', background: '#0F172A' }}>
                        <img 
                          src={item.thumbnail_url || item.image_url} 
                          alt={item.title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          loading="lazy"
                        />
                        {isReferenced && (
                          <div style={{ position: 'absolute', top: '6px', left: '6px' }}>
                            <span className="badge badge-cyan" style={{ background: '#1A73E8', color: '#FFF', fontSize: '0.68rem' }}>
                              ✓ Using as Inspiration
                            </span>
                          </div>
                        )}
                      </div>

                      <div style={{ padding: '8px 10px' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: isReferenced ? '#1A73E8' : 'var(--text-muted)', marginTop: '4px', fontWeight: isReferenced ? 700 : 400 }}>
                          {isReferenced ? 'Click to Deselect' : 'Click to Use as Reference'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* HERO HIGHLIGHT: CAMPAIGN IMAGE GENERATION STUDIO (Default: 4 Images) */}
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
                  <span className="badge badge-cyan" style={{ fontSize: '0.72rem' }}>
                    Inspiration Attached: {selectedReferenceAsset.title.slice(0, 30)}...
                  </span>
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
                    <span>Generate {numImagesToGenerate} Campaign Images &rarr;</span>
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
                Click any generated image to make it your active artwork. You can retouch it with natural language or proceed directly to publishing.
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
                        onClick={() => setHeroAsset({ url: img.url, base64: img.image_base64, title: `Campaign Image Candidate #${idx + 1}` })}
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
                            <span className="badge badge-cyan" style={{ background: 'rgba(0,0,0,0.6)', color: '#FFF', fontSize: '0.72rem' }}>
                              Candidate #{idx + 1}
                            </span>
                          </div>
                          {isSelected && (
                            <div style={{ position: 'absolute', bottom: '8px', left: '8px' }}>
                              <span className="badge badge-emerald" style={{ background: '#188038', color: '#FFF', fontSize: '0.74rem' }}>
                                ✓ Active Artwork
                              </span>
                            </div>
                          )}
                        </div>

                        <div style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: isSelected ? '#1A73E8' : 'var(--text-primary)' }}>
                            {isSelected ? '✓ Selected for Publishing' : 'Click to Select'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Active Asset Focus Dock: Two Clear Actions (Retouch with Natural Language | Ready to Publish) */}
          {heroAsset && (
            <div className="glass-card animate-fade-in" style={{ background: '#FFFFFF', border: '1.5px solid #1A73E8', padding: '20px', boxShadow: '0 4px 20px rgba(26,115,232,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: isRetouchOpen ? '18px' : '0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ position: 'relative', width: '70px', height: '70px', borderRadius: '8px', overflow: 'hidden', background: '#0F172A', border: '2px solid #1A73E8', flexShrink: 0 }}>
                    <img src={resolveImageSrc(heroAsset.base64 || heroAsset.url)} alt="Active" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    {isEditingAsset && (
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span className="pulsing-cook-dot" style={{ background: '#FFF' }} />
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Selected Campaign Artwork</span>
                      <span className="badge badge-emerald">Ready</span>
                    </div>
                    <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {heroAsset.title || 'Active Visual Asset'} &bull; Ready to publish or adjust with natural language.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <button 
                    className={isRetouchOpen ? 'btn-primary' : 'btn-outline'} 
                    style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem' }}
                    onClick={() => setIsRetouchOpen(!isRetouchOpen)}
                  >
                    <IconBrush size={16} />
                    <span>{isRetouchOpen ? 'Hide Retouch Studio' : 'Edit with Natural Language'}</span>
                  </button>

                  <button 
                    className="btn-emerald" 
                    style={{ padding: '11px 24px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.92rem', fontWeight: 700 }}
                    onClick={handleProceedToPublish}
                  >
                    <IconSend size={16} />
                    <span>Ready to Publish &rarr;</span>
                  </button>
                </div>
              </div>

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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <IconLock size={16} color="var(--action-primary)" />
                    <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                      In-Place Channel Credentials Configuration
                    </span>
                  </div>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Saved for current session dispatch
                  </span>
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
              {/* Copy Editor */}
              <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Instagram Caption &amp; Hashtags</h4>
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
                  <label className="subheading-label">Caption ({instagramCaption.length}/2200)</label>
                  <textarea 
                    className="input-glass"
                    rows={8}
                    value={instagramCaption}
                    onChange={(e) => setInstagramCaption(e.target.value)}
                    placeholder="Write your Instagram caption..."
                  />
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

                <button 
                  className="btn-primary" 
                  style={{ width: '100%', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#E1306C' }}
                  onClick={handlePublishInstagram}
                  disabled={isPublishing}
                >
                  <IconSend size={16} />
                  <span>{isPublishing ? 'Publishing to Instagram...' : 'Publish to Instagram Feed'}</span>
                </button>
              </div>

              {/* Mobile Phone Mockup Preview */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                  <IconSmartphone size={16} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Instagram Mobile Mockup</span>
                </div>

                <div 
                  style={{
                    width: '320px',
                    borderRadius: '24px',
                    border: '8px solid #1E293B',
                    background: '#FFFFFF',
                    overflow: 'hidden',
                    boxShadow: 'var(--shadow-modal)'
                  }}
                >
                  {/* Fake IG Header */}
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(45deg, #F58529, #DD2A7B, #8134AF)' }} />
                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>trend.contenter</span>
                  </div>

                  {/* Image */}
                  <div style={{ width: '100%', height: '280px', background: '#0F172A' }}>
                    {heroAsset?.url ? (
                      <img src={resolveImageSrc(heroAsset.base64 || heroAsset.url)} alt="IG preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: '0.8rem' }}>No Artwork Selected</div>
                    )}
                  </div>

                  {/* Fake Actions & Caption */}
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
                      <span>❤️</span><span>💬</span><span>↗️</span>
                    </div>
                    <div style={{ fontSize: '0.82rem', lineHeight: 1.4 }}>
                      <strong style={{ marginRight: '6px' }}>trend.contenter</strong>
                      {instagramCaption ? `${instagramCaption.slice(0, 110)}...` : 'Your post caption will appear here.'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CHANNEL 2: FACEBOOK PUBLISHER */}
          {publishChannel === 'facebook' && (
            <div className="grid-2">
              {/* Copy Editor */}
              <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Facebook Page Post</h4>
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
                  <label className="subheading-label">Post Caption &amp; Narrative</label>
                  <textarea 
                    className="input-glass"
                    rows={8}
                    value={facebookPostCopy}
                    onChange={(e) => setFacebookPostCopy(e.target.value)}
                    placeholder="Write your Facebook post..."
                  />
                </div>

                <button 
                  className="btn-primary" 
                  style={{ width: '100%', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#1877F2' }}
                  onClick={handlePublishFacebook}
                  disabled={isPublishing}
                >
                  <IconSend size={16} />
                  <span>{isPublishing ? 'Publishing to Facebook...' : 'Publish to Facebook Page'}</span>
                </button>
              </div>

              {/* Desktop Facebook Card Mockup */}
              <div className="glass-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                  <IconMonitor size={16} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Facebook Feed Mockup</span>
                </div>

                <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '16px', boxShadow: 'var(--shadow-card)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#1877F2', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>TC</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Trend Contenter Official</div>
                      <div style={{ fontSize: '0.74rem', color: '#64748B' }}>Just now &bull; 🌐</div>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.88rem', color: '#1E293B', marginBottom: '12px', lineHeight: 1.5 }}>
                    {facebookPostCopy ? facebookPostCopy.slice(0, 160) : 'Your Facebook update copy appears here...'}
                  </p>

                  <div style={{ width: '100%', height: '260px', background: '#0F172A', borderRadius: '6px', overflow: 'hidden' }}>
                    {heroAsset?.url ? (
                      <img src={resolveImageSrc(heroAsset.base64 || heroAsset.url)} alt="FB preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>No Artwork Selected</div>
                    )}
                  </div>
                </div>
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

                    {/* Hero Image */}
                    {emailIncludeHeroImage && heroAsset?.url && (
                      <div style={{ width: '100%', height: '180px', background: '#0F172A' }}>
                        <img src={resolveImageSrc(heroAsset.base64 || heroAsset.url)} alt="Email hero" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                          {emailPrimaryCtaText || 'Explore Campaign'} &rarr;
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
                          View Live &rarr;
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
