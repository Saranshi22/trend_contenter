import React, { useState, useRef, useEffect } from 'react';
import type { 
  Opportunity, 
  GenerateConceptsResponse, 
  ContentConceptItem, 
  GeneratedImageItem, 
  GenerateVideoResponse 
} from '../types';
import { API_BASE } from '../apiConfig';
import {
  IconCheck,
  IconFilePdf,
  IconFileText,
  IconSparkles,
  IconVideo,
  IconImage,
  IconType,
  IconBrush,
  IconDownload,
  IconCopy,
  IconUpload,
  IconAlertTriangle
} from '../components/Icons';

interface ContentStudioPageProps {
  opportunities: Opportunity[];
  onSelectBrief: (opp: Opportunity) => void;
  onDownloadPdf: (oppId: string) => void;
}

type StudioTab = 'concepts' | 'images' | 'videos' | 'editor';

const STYLE_PRESETS = [
  { id: 'none', label: 'Default' },
  { id: 'photorealistic', label: 'Photorealistic' },
  { id: 'cinematic', label: 'Cinematic Movie' },
  { id: 'editorial', label: 'Editorial Magazine' },
  { id: 'minimalist', label: 'Minimalist Flat' },
  { id: '3d', label: '3D Render' },
  { id: 'cyberpunk', label: 'Cyberpunk Neon' }
];

const VIDEO_CINEMATOGRAPHY_PRESETS = [
  'Cinematic slow push-in, shallow depth of field, 4k ultra-detailed',
  'Dynamic 360 orbiting arc shot, golden hour lighting',
  'FPV drone flyover gliding smoothly forward',
  'Macro slow-motion 120fps, crisp droplets and reflections',
  'Low-angle dramatic tilt up with volumetric light beams'
];

export const ContentStudioPage: React.FC<ContentStudioPageProps> = ({
  opportunities,
  onSelectBrief,
  onDownloadPdf
}) => {
  const [activeTab, setActiveTab] = useState<StudioTab>('concepts');
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Staged Opportunities
  const selectedOpps = opportunities.filter(o => o.status === 'selected');
  const [generatingOppId, setGeneratingOppId] = useState<string | null>(null);

  // Concept Studio State
  const [briefText, setBriefText] = useState<string>('');
  const [briefFileBase64, setBriefFileBase64] = useState<string | null>(null);
  const [briefFileName, setBriefFileName] = useState<string | null>(null);
  const [briefFileMime, setBriefFileMime] = useState<string>('application/pdf');
  const [mediaMix, setMediaMix] = useState<'balanced' | 'image_only' | 'video_only'>('balanced');
  const [numConcepts, setNumConcepts] = useState<number>(4);
  const [isGeneratingConcepts, setIsGeneratingConcepts] = useState<boolean>(false);
  const [conceptResult, setConceptResult] = useState<GenerateConceptsResponse | null>(null);

  // Image Studio State (Gemini 3.1 Pro Image)
  const [imagePrompt, setImagePrompt] = useState<string>('');
  const [imageNegativePrompt, setImageNegativePrompt] = useState<string>('');
  const [imageAspectRatio, setImageAspectRatio] = useState<string>('1:1');
  const [imageStylePreset, setImageStylePreset] = useState<string>('photorealistic');
  const [numImages, setNumImages] = useState<number>(1);
  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState<boolean>(false);
  const [isGeneratingImages, setIsGeneratingImages] = useState<boolean>(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImageItem[]>([]);
  const [imageModelUsed, setImageModelUsed] = useState<string>('gemini-3.1-pro-image');

  // Video Studio State (Google Veo)
  const [videoPrompt, setVideoPrompt] = useState<string>('');
  const [videoNegativePrompt, setVideoNegativePrompt] = useState<string>('');
  const [videoAspectRatio, setVideoAspectRatio] = useState<string>('16:9');
  const [videoDuration, setVideoDuration] = useState<number>(5);
  const [videoFps, setVideoFps] = useState<number>(24);
  const [videoStartImageBase64, setVideoStartImageBase64] = useState<string | null>(null);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState<boolean>(false);
  const [generatedVideo, setGeneratedVideo] = useState<GenerateVideoResponse | null>(null);

  // Smart Editor & Typography State
  const [editorMode, setEditorMode] = useState<'replace_background' | 'modify_object' | 'style_transfer' | 'typography'>('replace_background');
  const [editorSourceImage, setEditorSourceImage] = useState<string | null>(null);
  const [editorResultImage, setEditorResultImage] = useState<string | null>(null);
  const [editorPrompt, setEditorPrompt] = useState<string>('');
  const [editorTargetObject, setEditorTargetObject] = useState<string>('');
  const [editorReplacement, setEditorReplacement] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Typography Settings
  const [typoHeadline, setTypoHeadline] = useState<string>('TREND CONTENT');
  const [typoSubtext, setTypoSubtext] = useState<string>('Audience Intelligence Brief');
  const [typoPosition, setTypoPosition] = useState<string>('bottom-banner');
  const [typoFontSize, setTypoFontSize] = useState<number>(44);
  const [typoFontColor, setTypoFontColor] = useState<string>('#FFFFFF');
  const [typoBackgroundBox, setTypoBackgroundBox] = useState<boolean>(true);

  // Inpainting Canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [brushSize, setBrushSize] = useState<number>(30);
  const [hasDrawnMask, setHasDrawnMask] = useState<boolean>(false);

  // Helper for Toasts
  const notify = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const copyToClipboard = (text: string, label: string = 'Content') => {
    navigator.clipboard.writeText(text);
    notify(`${label} copied to clipboard!`, 'success');
  };

  // Drag and drop brief file
  const handleBriefFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const base64 = dataUrl.split(',')[1];
      setBriefFileBase64(base64);
      setBriefFileName(file.name);
      setBriefFileMime(file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'text/markdown'));
      notify(`Loaded brief file: ${file.name}`, 'success');
    };
    reader.readAsDataURL(file);
  };

  // Load sample brief from API
  const handleLoadSampleBrief = async () => {
    try {
      const res = await fetch(`${API_BASE}/content-studio/sample-brief`);
      if (res.ok) {
        const data = await res.json();
        setBriefText(data.content);
        setBriefFileName(data.filename);
        setBriefFileBase64(null);
        notify('Loaded sample brief: CBD Ground Dossier', 'success');
      } else {
        notify('Failed to load sample brief from server.', 'error');
      }
    } catch (err) {
      console.error(err);
      notify('Network error loading sample brief.', 'error');
    }
  };

  // Generate concepts from custom uploaded brief
  const handleGenerateConcepts = async () => {
    if (!briefText && !briefFileBase64) {
      notify('Please enter brief text or upload a PDF/Markdown dossier.', 'error');
      return;
    }

    setIsGeneratingConcepts(true);
    try {
      const payload: any = {
        num_concepts: numConcepts,
        preferred_media_mix: mediaMix
      };

      if (briefFileBase64) {
        payload.file_base64 = briefFileBase64;
        payload.file_mime_type = briefFileMime;
      } else {
        payload.brief_text = briefText;
      }

      const res = await fetch(`${API_BASE}/content-studio/concepts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data: GenerateConceptsResponse = await res.json();
        setConceptResult(data);
        notify(`Successfully generated ${data.concepts.length} concepts!`, 'success');
      } else {
        const errData = await res.json();
        notify(`Concept generation failed: ${errData.detail || 'Server error'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      notify('Network error while generating concepts.', 'error');
    } finally {
      setIsGeneratingConcepts(false);
    }
  };

  // Generate concepts directly from a Staged Opportunity
  const handleGenerateFromOpportunity = async (oppId: string) => {
    setGeneratingOppId(oppId);
    try {
      const res = await fetch(`${API_BASE}/content-studio/concepts/opportunity/${oppId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          num_concepts: numConcepts,
          preferred_media_mix: mediaMix
        })
      });

      if (res.ok) {
        const data: GenerateConceptsResponse = await res.json();
        setConceptResult(data);
        setActiveTab('concepts');
        notify(`Generated ${data.concepts.length} concepts from staged brief!`, 'success');
      } else {
        const err = await res.json();
        notify(`Error: ${err.detail || 'Could not generate concepts'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      notify('Failed to generate concepts from opportunity.', 'error');
    } finally {
      setGeneratingOppId(null);
    }
  };

  // Send concept to Image Studio
  const handleTransferToImageStudio = (concept: ContentConceptItem) => {
    const prompt = concept.image_prompt || concept.generation_prompt;
    setImagePrompt(prompt);
    if (['1:1', '16:9', '9:16', '4:3', '3:4'].includes(concept.aspect_ratio)) {
      setImageAspectRatio(concept.aspect_ratio);
    }
    if (concept.style_preset) {
      setImageStylePreset(concept.style_preset);
    }
    setActiveTab('images');
    notify(`Loaded concept into Image Studio!`, 'info');
  };

  // Send concept to Video Studio
  const handleTransferToVideoStudio = (concept: ContentConceptItem) => {
    const prompt = concept.video_prompt || concept.generation_prompt;
    setVideoPrompt(prompt);
    if (['16:9', '9:16', '1:1'].includes(concept.aspect_ratio)) {
      setVideoAspectRatio(concept.aspect_ratio);
    }
    if (concept.duration_seconds) {
      setVideoDuration(concept.duration_seconds);
    }
    setActiveTab('videos');
    notify(`Loaded concept into Video Studio (Veo)!`, 'info');
  };

  // Enhance Image Prompt
  const handleEnhancePrompt = async () => {
    if (!imagePrompt.trim()) return;
    setIsEnhancingPrompt(true);
    try {
      const res = await fetch(`${API_BASE}/content-studio/prompt/enhance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imagePrompt,
          style_preset: imageStylePreset,
          target_operation: 'generation'
        })
      });
      if (res.ok) {
        const data = await res.json();
        setImagePrompt(data.enhanced_prompt);
        notify('Prompt enhanced with Gemini!', 'success');
      } else {
        notify('Could not enhance prompt.', 'error');
      }
    } catch (err) {
      console.error(err);
      notify('Network error enhancing prompt.', 'error');
    } finally {
      setIsEnhancingPrompt(false);
    }
  };

  // Generate Image with Gemini 3.1 Pro
  const handleGenerateImages = async () => {
    if (!imagePrompt.trim()) {
      notify('Please enter an image prompt.', 'error');
      return;
    }

    setIsGeneratingImages(true);
    try {
      const res = await fetch(`${API_BASE}/content-studio/images/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imagePrompt,
          negative_prompt: imageNegativePrompt || undefined,
          aspect_ratio: imageAspectRatio,
          number_of_images: numImages,
          style_preset: imageStylePreset,
          enhance_prompt: false
        })
      });

      if (res.ok) {
        const data = await res.json();
        setGeneratedImages(data.images || []);
        setImageModelUsed(data.model_used);
        notify(`Generated ${data.images?.length || 0} image(s) with ${data.model_used}!`, 'success');
      } else {
        const err = await res.json();
        notify(`Generation failed: ${err.detail || 'Server error'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      notify('Network error generating images.', 'error');
    } finally {
      setIsGeneratingImages(false);
    }
  };

  // Generate Video with Google Veo
  const handleGenerateVideo = async () => {
    if (!videoPrompt.trim()) {
      notify('Please enter a video action prompt.', 'error');
      return;
    }

    setIsGeneratingVideo(true);
    try {
      const payload: any = {
        prompt: videoPrompt,
        negative_prompt: videoNegativePrompt || undefined,
        aspect_ratio: videoAspectRatio,
        duration_seconds: videoDuration,
        fps: videoFps,
        enhance_prompt: false
      };

      if (videoStartImageBase64) {
        payload.image_base64 = videoStartImageBase64;
      }

      const res = await fetch(`${API_BASE}/content-studio/videos/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data: GenerateVideoResponse = await res.json();
        setGeneratedVideo(data);
        notify(`Video generated successfully with ${data.model_used}!`, 'success');
      } else {
        const err = await res.json();
        notify(`Video generation failed: ${err.detail || 'Server error'}`, 'error');
      }
    } catch (err) {
      console.error(err);
      notify('Network error generating video.', 'error');
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  // Transfer image to Smart Editor
  const handleTransferToEditor = (imgBase64: string) => {
    setEditorSourceImage(imgBase64);
    setEditorResultImage(null);
    setHasDrawnMask(false);
    setActiveTab('editor');
    notify('Loaded image into Smart Editor!', 'info');
  };

  // Handle Source Image Upload in Editor
  const handleEditorImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const b64 = dataUrl.split(',')[1];
      setEditorSourceImage(b64);
      setEditorResultImage(null);
      setHasDrawnMask(false);
      notify('Loaded image into editor!', 'success');
    };
    reader.readAsDataURL(file);
  };

  // Inpainting Canvas initialization and drawing
  useEffect(() => {
    if (activeTab === 'editor' && editorSourceImage && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new window.Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = `data:image/png;base64,${editorSourceImage}`;
    }
  }, [activeTab, editorSourceImage]);

  // Canvas drawing handlers for inpainting mask
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    drawOnCanvas(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const drawOnCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing && e.type !== 'mousedown') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    ctx.fillStyle = 'rgba(239, 68, 68, 0.45)'; // Semi-transparent red overlay
    ctx.beginPath();
    ctx.arc(x, y, brushSize, 0, Math.PI * 2);
    ctx.fill();
    setHasDrawnMask(true);
  };

  const handleClearMask = () => {
    if (!canvasRef.current || !editorSourceImage) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new window.Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      setHasDrawnMask(false);
      notify('Mask cleared', 'info');
    };
    img.src = `data:image/png;base64,${editorSourceImage}`;
  };

  // Execute Edit or Typography
  const handleExecuteEdit = async () => {
    if (!editorSourceImage) {
      notify('Please load or generate an image first.', 'error');
      return;
    }

    setIsEditing(true);
    try {
      if (editorMode === 'typography') {
        // Typography overlay with PIL
        const res = await fetch(`${API_BASE}/content-studio/images/typography`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_base64: editorSourceImage,
            text: typoSubtext ? `${typoHeadline}\n${typoSubtext}` : typoHeadline,
            font_size: typoFontSize,
            font_color: typoFontColor,
            position: typoPosition,
            background_box: typoBackgroundBox,
            shadow: true
          })
        });

        if (res.ok) {
          const data = await res.json();
          setEditorResultImage(data.image_base64);
          notify('Typography rendered successfully!', 'success');
        } else {
          const err = await res.json();
          notify(`Typography failed: ${err.detail || 'Server error'}`, 'error');
        }
      } else {
        // Multimodal Gemini Image Editing
        const payload: any = {
          image_base64: editorSourceImage,
          operation: editorMode,
          prompt: editorPrompt || 'Enhance and refine the composition',
          target_object: editorTargetObject || undefined,
          replacement_prompt: editorReplacement || undefined
        };

        const res = await fetch(`${API_BASE}/content-studio/images/edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const data = await res.json();
          if (data.images && data.images.length > 0) {
            setEditorResultImage(data.images[0].image_base64);
            notify(`Image edited with ${data.model_used}!`, 'success');
          }
        } else {
          const err = await res.json();
          notify(`Edit failed: ${err.detail || 'Server error'}`, 'error');
        }
      }
    } catch (err) {
      console.error(err);
      notify('Network error during editing operation.', 'error');
    } finally {
      setIsEditing(false);
    }
  };

  // Adopt Edited Image as new source
  const handleAdoptEditedImage = () => {
    if (editorResultImage) {
      setEditorSourceImage(editorResultImage);
      setEditorResultImage(null);
      setHasDrawnMask(false);
      notify('Adopted edited image as new base layer!', 'success');
    }
  };

  return (
    <div className="page-container animate-fade-in" style={{ paddingBottom: '60px' }}>
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

      {/* Header & Sub-Navigation */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Content Studio
            </h1>
            <span className="badge badge-cyan" style={{ fontSize: '0.75rem', padding: '3px 8px' }}>
              Gemini 3.1 &amp; Google Veo
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="metric-pill metric-pill-cyan">
              <span className="pulse-dot" />
              <span>Studio Engine: Ready</span>
            </span>
          </div>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', maxWidth: '780px', margin: 0 }}>
          Transform intelligence dossiers into high-converting visual concepts, photorealistic assets with Gemini 3.1 Pro Image, cinematic video with Google Veo, and precision branding.
        </p>
      </div>

      {/* Staged Opportunities Bar */}
      {selectedOpps.length > 0 && (
        <div className="glass-card" style={{ padding: '16px 20px', marginBottom: '24px', background: '#FAFCFF', border: '1px solid #D2E3FC' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="badge badge-emerald">Staged Opportunities ({selectedOpps.length})</span>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                From Trend Intelligence Pipeline
              </span>
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              1-Click generate concepts directly from verified dossiers
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {selectedOpps.map((opp) => (
              <div 
                key={opp.opportunity_id}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span className="badge badge-cyan">{opp.audience_label || 'Target Persona'}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {opp.title}
                    </span>
                    <span className="metric-pill metric-pill-green" style={{ padding: '2px 6px', fontSize: '0.72rem' }}>
                      Score: {Math.round(opp.score * 100)}%
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {opp.recommended_angle || opp.content_gap}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    className="btn-primary"
                    style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                    onClick={() => handleGenerateFromOpportunity(opp.opportunity_id)}
                    disabled={generatingOppId === opp.opportunity_id}
                  >
                    <IconSparkles size={14} />
                    <span>
                      {generatingOppId === opp.opportunity_id ? 'Generating Concepts...' : 'Generate Concepts'}
                    </span>
                  </button>
                  <button
                    className="btn-outline"
                    style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                    onClick={() => onSelectBrief(opp)}
                  >
                    Brief
                  </button>
                  <button
                    className="btn-outline"
                    style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                    onClick={() => onDownloadPdf(opp.opportunity_id)}
                    title="Download Executive PDF"
                  >
                    <IconFilePdf size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Studio Tabs */}
      <div className="tab-container" style={{ marginBottom: '24px' }}>
        <button
          className={`tab-btn ${activeTab === 'concepts' ? 'active' : ''}`}
          onClick={() => setActiveTab('concepts')}
        >
          <IconSparkles size={16} />
          <span>💡 Concept Studio</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'images' ? 'active' : ''}`}
          onClick={() => setActiveTab('images')}
        >
          <IconImage size={16} />
          <span>🎨 Image Studio (Gemini 3.1)</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'videos' ? 'active' : ''}`}
          onClick={() => setActiveTab('videos')}
        >
          <IconVideo size={16} />
          <span>🎬 Video Studio (Veo 2)</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'editor' ? 'active' : ''}`}
          onClick={() => setActiveTab('editor')}
        >
          <IconBrush size={16} />
          <span>✨ Smart Editor &amp; Typography</span>
        </button>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: CONCEPT STUDIO                                          */}
      {/* ============================================================== */}
      {activeTab === 'concepts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Brief Input Card */}
          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: 600, margin: 0 }}>
                  Dossier &amp; Brief Ingestion
                </h3>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Upload a PDF/Markdown dossier or paste executive research notes to generate platform-optimized concepts and prompts.
                </p>
              </div>
              <button
                className="btn-outline"
                style={{ fontSize: '0.82rem', padding: '6px 12px' }}
                onClick={handleLoadSampleBrief}
              >
                <IconFileText size={14} />
                <span>Load CBD Ground Dossier Sample</span>
              </button>
            </div>

            <div className="grid-2" style={{ marginBottom: '16px' }}>
              {/* File Upload Dropzone */}
              <div>
                <label className="subheading-label">Upload Brief File (PDF or Markdown)</label>
                <div 
                  className={`studio-dropzone ${briefFileName ? 'active' : ''}`}
                  onClick={() => document.getElementById('brief-file-input')?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleBriefFileUpload(e.dataTransfer.files[0]);
                    }
                  }}
                >
                  <input
                    id="brief-file-input"
                    type="file"
                    accept=".pdf,.md,.txt"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleBriefFileUpload(e.target.files[0]);
                      }
                    }}
                  />
                  <IconUpload size={28} style={{ color: 'var(--action-primary)', margin: '0 auto 8px' }} />
                  {briefFileName ? (
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                        {briefFileName}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--status-success)', marginTop: '4px' }}>
                        Ready for Gemini multimodal extraction
                      </div>
                      <button
                        className="btn-outline"
                        style={{ fontSize: '0.72rem', padding: '2px 8px', marginTop: '8px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setBriefFileName(null);
                          setBriefFileBase64(null);
                        }}
                      >
                        Remove File
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                        Click to upload or drag &amp; drop
                      </div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        PDF, Markdown, or TXT (Max 15MB)
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Text Brief Area */}
              <div>
                <label className="subheading-label">Or Paste Strategic Notes / Brief</label>
                <textarea
                  className="input-glass"
                  placeholder="Paste executive summary, target persona, competitor voids, or key talking points..."
                  rows={5}
                  value={briefText}
                  onChange={(e) => setBriefText(e.target.value)}
                  style={{ height: '140px', resize: 'vertical' }}
                />
              </div>
            </div>

            {/* Controls Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Media Mix:</span>
                  <select
                    className="select-glass"
                    style={{ width: '130px', height: '34px', fontSize: '0.82rem', padding: '0 8px' }}
                    value={mediaMix}
                    onChange={(e: any) => setMediaMix(e.target.value)}
                  >
                    <option value="balanced">Balanced</option>
                    <option value="image_only">Images Only</option>
                    <option value="video_only">Videos Only</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Concepts Count:</span>
                  <select
                    className="select-glass"
                    style={{ width: '80px', height: '34px', fontSize: '0.82rem', padding: '0 8px' }}
                    value={numConcepts}
                    onChange={(e) => setNumConcepts(parseInt(e.target.value))}
                  >
                    <option value={2}>2</option>
                    <option value={4}>4</option>
                    <option value={6}>6</option>
                  </select>
                </div>
              </div>

              <button
                className="btn-primary"
                onClick={handleGenerateConcepts}
                disabled={isGeneratingConcepts || (!briefText && !briefFileBase64)}
              >
                <IconSparkles size={16} />
                <span>{isGeneratingConcepts ? 'Synthesizing with Gemini...' : 'Generate Platform Concepts'}</span>
              </button>
            </div>
          </div>

          {/* Concepts Results View */}
          {conceptResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Dossier Extraction Overview */}
              <div className="glass-card" style={{ background: '#FAFCFE', border: '1px solid #D6DFEA' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <span className="badge badge-cyan" style={{ marginBottom: '6px' }}>Extracted Intelligence Brief</span>
                    <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', fontWeight: 700, margin: '4px 0' }}>
                      {conceptResult.brief_title}
                    </h3>
                    <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: 0, maxWidth: '800px' }}>
                      {conceptResult.brief_summary}
                    </p>
                  </div>
                  <span className="metric-pill metric-pill-green" style={{ fontSize: '0.78rem' }}>
                    Model: {conceptResult.model_used}
                  </span>
                </div>

                <div className="grid-2" style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)' }}>
                  <div>
                    <div className="subheading-label">Target Audience</div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {conceptResult.target_audience}
                    </div>
                  </div>
                  <div>
                    <div className="subheading-label">Key Friction Points Solved</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {conceptResult.key_friction_points.map((pt, i) => (
                        <span key={i} className="badge badge-neutral" style={{ textTransform: 'none', fontSize: '0.78rem' }}>
                          {pt}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Concept Cards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
                {conceptResult.concepts.map((concept, idx) => (
                  <div key={concept.id || idx} className="concept-card">
                    {/* Header */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span className="badge badge-blue">
                          {concept.target_platform}
                        </span>
                        <span className={`badge ${concept.media_type === 'video' ? 'badge-amber' : 'badge-emerald'}`}>
                          {concept.media_type === 'video' ? '🎬 Google Veo Video' : '🎨 Gemini 3.1 Image'}
                        </span>
                      </div>

                      <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                        {concept.title}
                      </h4>

                      <div className="question-quote" style={{ marginBottom: '12px' }}>
                        "{concept.concept_hook || concept.hook}"
                      </div>

                      <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                        <strong>Rationale:</strong> {concept.platform_optimization_rationale}
                      </div>

                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                        <strong>Scene:</strong> {concept.visual_description}
                      </div>

                      {/* Ready Prompt Box */}
                      <div style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '10px 12px', fontSize: '0.78rem', fontFamily: 'monospace', color: 'var(--text-primary)', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>PROMPT</span>
                          <button
                            className="btn-outline"
                            style={{ padding: '2px 6px', fontSize: '0.7rem', height: '22px' }}
                            onClick={() => copyToClipboard(concept.generation_prompt, 'Prompt')}
                          >
                            <IconCopy size={12} />
                            <span>Copy</span>
                          </button>
                        </div>
                        <div style={{ maxHeight: '72px', overflowY: 'auto', lineHeight: '1.4' }}>
                          {concept.generation_prompt}
                        </div>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Ratio: {concept.aspect_ratio}
                      </span>

                      {concept.media_type === 'video' ? (
                        <button
                          className="btn-primary"
                          style={{ fontSize: '0.82rem', padding: '6px 14px' }}
                          onClick={() => handleTransferToVideoStudio(concept)}
                        >
                          <IconVideo size={14} />
                          <span>Send to Video Studio (Veo)</span>
                        </button>
                      ) : (
                        <button
                          className="btn-primary"
                          style={{ fontSize: '0.82rem', padding: '6px 14px' }}
                          onClick={() => handleTransferToImageStudio(concept)}
                        >
                          <IconImage size={14} />
                          <span>Send to Image Studio (Gemini)</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: IMAGE STUDIO (Gemini 3.1 Pro Image)                      */}
      {/* ============================================================== */}
      {activeTab === 'images' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="glass-card">
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 600, margin: 0 }}>
                  Gemini 3.1 Pro Image Generation
                </h3>
                <span className="badge badge-cyan">gemini-3.1-pro-image</span>
              </div>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0 }}>
                Synthesize high-fidelity photorealistic and artistic images directly with Google's multimodal Gemini image models.
              </p>
            </div>

            {/* Prompt Input */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="subheading-label" style={{ margin: 0 }}>Generation Prompt</label>
                <button
                  className="btn-outline"
                  style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                  onClick={handleEnhancePrompt}
                  disabled={isEnhancingPrompt || !imagePrompt.trim()}
                >
                  <IconSparkles size={13} />
                  <span>{isEnhancingPrompt ? 'Enhancing...' : 'Enhance with Gemini'}</span>
                </button>
              </div>
              <textarea
                className="input-glass"
                rows={3}
                placeholder="Describe the subject, lighting, composition, camera lens, aesthetic, and mood..."
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
              />
            </div>

            {/* Style Presets */}
            <div style={{ marginBottom: '18px' }}>
              <label className="subheading-label">Style Preset</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {STYLE_PRESETS.map((p) => (
                  <div
                    key={p.id}
                    className={`style-chip ${imageStylePreset === p.id ? 'active' : ''}`}
                    onClick={() => setImageStylePreset(p.id)}
                  >
                    {p.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Negative Prompt & Controls Grid */}
            <div className="grid-2" style={{ marginBottom: '18px' }}>
              <div>
                <label className="subheading-label">Negative Prompt (Elements to Exclude)</label>
                <input
                  type="text"
                  className="input-glass"
                  placeholder="e.g. blurry, cartoon, low resolution, bad anatomy, text watermarks"
                  value={imageNegativePrompt}
                  onChange={(e) => setImageNegativePrompt(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="subheading-label">Aspect Ratio</label>
                  <select
                    className="select-glass"
                    value={imageAspectRatio}
                    onChange={(e) => setImageAspectRatio(e.target.value)}
                  >
                    <option value="1:1">1:1 Square (Feed)</option>
                    <option value="16:9">16:9 Landscape</option>
                    <option value="9:16">9:16 Vertical (Stories/Reels)</option>
                    <option value="4:3">4:3 Standard</option>
                    <option value="3:4">3:4 Portrait</option>
                  </select>
                </div>
                <div>
                  <label className="subheading-label">Image Count</label>
                  <select
                    className="select-glass"
                    value={numImages}
                    onChange={(e) => setNumImages(parseInt(e.target.value))}
                  >
                    <option value={1}>1 Image</option>
                    <option value={2}>2 Images</option>
                    <option value={4}>4 Images</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Submit Bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
              <button
                className="btn-primary"
                style={{ padding: '10px 24px', fontSize: '0.9rem' }}
                onClick={handleGenerateImages}
                disabled={isGeneratingImages || !imagePrompt.trim()}
              >
                <IconSparkles size={16} />
                <span>{isGeneratingImages ? 'Synthesizing Image...' : 'Generate with Gemini 3.1'}</span>
              </button>
            </div>
          </div>

          {/* Results Gallery */}
          {generatedImages.length > 0 && (
            <div className="glass-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: 600, margin: 0 }}>
                  Generated Assets ({generatedImages.length})
                </h3>
                <span className="badge badge-emerald">Model: {imageModelUsed}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                {generatedImages.map((img, i) => (
                  <div 
                    key={img.id || i}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      boxShadow: 'var(--shadow-sm)'
                    }}
                  >
                    <div style={{ background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img
                        src={`data:image/png;base64,${img.image_base64}`}
                        alt={img.enhanced_prompt || 'Generated Asset'}
                        style={{ width: '100%', height: 'auto', maxHeight: '420px', objectFit: 'contain' }}
                      />
                    </div>

                    <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <button
                        className="btn-primary"
                        style={{ fontSize: '0.82rem', padding: '6px 14px' }}
                        onClick={() => handleTransferToEditor(img.image_base64)}
                      >
                        <IconBrush size={14} />
                        <span>Send to Smart Editor</span>
                      </button>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        <a
                          href={`data:image/png;base64,${img.image_base64}`}
                          download={`gemini_asset_${img.id.slice(0, 6)}.png`}
                          className="btn-outline"
                          style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                        >
                          <IconDownload size={14} />
                          <span>PNG</span>
                        </a>
                        <button
                          className="btn-outline"
                          style={{ padding: '6px 10px', fontSize: '0.82rem' }}
                          onClick={() => copyToClipboard(img.enhanced_prompt || imagePrompt, 'Prompt')}
                          title="Copy generation prompt"
                        >
                          <IconCopy size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: VIDEO STUDIO (Google Veo)                               */}
      {/* ============================================================== */}
      {activeTab === 'videos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="glass-card">
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 600, margin: 0 }}>
                  Google Veo Video Studio
                </h3>
                <span className="badge badge-amber">veo-2.0-generate-001</span>
              </div>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0 }}>
                High-definition, continuous video generation powered by Google's state-of-the-art Veo models.
              </p>
            </div>

            {/* Video Prompt */}
            <div style={{ marginBottom: '16px' }}>
              <label className="subheading-label">Action &amp; Scene Prompt</label>
              <textarea
                className="input-glass"
                rows={3}
                placeholder="Describe characters, movement, camera movement, scene dynamics, lighting, and pacing..."
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
              />
            </div>

            {/* Cinematography Presets */}
            <div style={{ marginBottom: '18px' }}>
              <label className="subheading-label">Cinematography Style Directives</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {VIDEO_CINEMATOGRAPHY_PRESETS.map((preset, idx) => (
                  <div
                    key={idx}
                    className="prompt-tag"
                    onClick={() => {
                      setVideoPrompt(prev => prev ? `${prev}, ${preset}` : preset);
                      notify('Appended camera direction!', 'info');
                    }}
                  >
                    + {preset.split(',')[0]}
                  </div>
                ))}
              </div>
            </div>

            {/* Video Negative Prompt */}
            <div style={{ marginBottom: '18px' }}>
              <label className="subheading-label">Negative Prompt (Elements to Avoid)</label>
              <input
                type="text"
                className="input-glass"
                placeholder="e.g. static camera, jump cuts, distortion, low resolution, shaky footage"
                value={videoNegativePrompt}
                onChange={(e) => setVideoNegativePrompt(e.target.value)}
              />
            </div>

            {/* Video Controls Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '18px' }}>
              <div>
                <label className="subheading-label">Aspect Ratio</label>
                <select
                  className="select-glass"
                  value={videoAspectRatio}
                  onChange={(e) => setVideoAspectRatio(e.target.value)}
                >
                  <option value="16:9">16:9 Landscape (YouTube/Desktop)</option>
                  <option value="9:16">9:16 Vertical (Shorts/Reels/TikTok)</option>
                  <option value="1:1">1:1 Square (Feed)</option>
                </select>
              </div>

              <div>
                <label className="subheading-label">Duration</label>
                <select
                  className="select-glass"
                  value={videoDuration}
                  onChange={(e) => setVideoDuration(parseInt(e.target.value))}
                >
                  <option value={5}>5 Seconds</option>
                  <option value={8}>8 Seconds (Extended)</option>
                </select>
              </div>

              <div>
                <label className="subheading-label">Frame Rate</label>
                <select
                  className="select-glass"
                  value={videoFps}
                  onChange={(e) => setVideoFps(parseInt(e.target.value))}
                >
                  <option value={24}>24 fps (Cinematic)</option>
                  <option value={30}>30 fps (Broadcast)</option>
                </select>
              </div>

              <div>
                <label className="subheading-label">Optional Image Seed</label>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  id="video-seed-file"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const res = ev.target?.result;
                        if (typeof res === 'string') {
                          const b64 = res.split(',')[1] || '';
                          setVideoStartImageBase64(b64);
                          notify('Loaded seed image for Image-to-Video generation!', 'success');
                        }
                      };
                      reader.readAsDataURL(e.target.files[0]);
                    }
                  }}
                />
                <button
                  className="btn-outline"
                  style={{ width: '100%', height: '42px', fontSize: '0.82rem' }}
                  onClick={() => document.getElementById('video-seed-file')?.click()}
                >
                  <IconImage size={14} />
                  <span>{videoStartImageBase64 ? 'Image Loaded ✓' : 'Upload Seed Image'}</span>
                </button>
              </div>
            </div>

            {/* Submit */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
              <button
                className="btn-primary"
                style={{ padding: '10px 24px', fontSize: '0.9rem' }}
                onClick={handleGenerateVideo}
                disabled={isGeneratingVideo || !videoPrompt.trim()}
              >
                <IconVideo size={16} />
                <span>{isGeneratingVideo ? 'Generating Video with Veo...' : 'Generate with Google Veo'}</span>
              </button>
            </div>
          </div>

          {/* Video Result Card */}
          {generatedVideo && (
            <div className="glass-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: 600, margin: 0 }}>
                    Veo Cinematic Generation Result
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Duration: {generatedVideo.duration_seconds}s | Aspect Ratio: {generatedVideo.aspect_ratio} | FPS: {generatedVideo.fps}
                  </span>
                </div>
                <span className="badge badge-amber">{generatedVideo.model_used}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                <div style={{ maxWidth: '820px', width: '100%', borderRadius: '10px', overflow: 'hidden', background: '#000000', boxShadow: 'var(--shadow-card)' }}>
                  <video
                    src={generatedVideo.video_url}
                    controls
                    autoPlay
                    loop
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <a
                    href={generatedVideo.video_url}
                    download={`veo_video_${generatedVideo.id.slice(0, 6)}.mp4`}
                    className="btn-primary"
                    style={{ padding: '8px 20px', fontSize: '0.88rem' }}
                  >
                    <IconDownload size={16} />
                    <span>Download MP4</span>
                  </a>
                  <button
                    className="btn-outline"
                    style={{ padding: '8px 16px', fontSize: '0.88rem' }}
                    onClick={() => copyToClipboard(generatedVideo.prompt, 'Prompt')}
                  >
                    <IconCopy size={16} />
                    <span>Copy Prompt</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 4: SMART EDITOR & TYPOGRAPHY                               */}
      {/* ============================================================== */}
      {activeTab === 'editor' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 600, margin: 0 }}>
                  Smart Editor &amp; Precision Typography Engine
                </h3>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Multimodal inpainting, background modification with Gemini, and professional typography overlays.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  id="editor-image-upload"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleEditorImageUpload(e.target.files[0]);
                    }
                  }}
                />
                <button
                  className="btn-outline"
                  style={{ fontSize: '0.82rem', padding: '6px 12px' }}
                  onClick={() => document.getElementById('editor-image-upload')?.click()}
                >
                  <IconUpload size={14} />
                  <span>Upload Image</span>
                </button>
              </div>
            </div>

            {/* Mode Selector Tabs */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px', marginBottom: '18px', overflowX: 'auto' }}>
              <button
                className={`tab-btn ${editorMode === 'replace_background' ? 'active' : ''}`}
                style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                onClick={() => setEditorMode('replace_background')}
              >
                🌄 Replace Background
              </button>
              <button
                className={`tab-btn ${editorMode === 'modify_object' ? 'active' : ''}`}
                style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                onClick={() => setEditorMode('modify_object')}
              >
                🎯 Modify Object
              </button>
              <button
                className={`tab-btn ${editorMode === 'style_transfer' ? 'active' : ''}`}
                style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                onClick={() => setEditorMode('style_transfer')}
              >
                🎨 Style Transfer
              </button>
              <button
                className={`tab-btn ${editorMode === 'typography' ? 'active' : ''}`}
                style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                onClick={() => setEditorMode('typography')}
              >
                <IconType size={14} />
                <span>Precision Typography</span>
              </button>
            </div>

            {/* Mode-Specific Controls */}
            {editorMode === 'typography' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '18px' }}>
                <div>
                  <label className="subheading-label">Headline Text</label>
                  <input
                    type="text"
                    className="input-glass"
                    value={typoHeadline}
                    onChange={(e) => setTypoHeadline(e.target.value)}
                  />
                </div>
                <div>
                  <label className="subheading-label">Subtext / Attribution</label>
                  <input
                    type="text"
                    className="input-glass"
                    value={typoSubtext}
                    onChange={(e) => setTypoSubtext(e.target.value)}
                  />
                </div>
                <div>
                  <label className="subheading-label">Placement</label>
                  <select
                    className="select-glass"
                    value={typoPosition}
                    onChange={(e) => setTypoPosition(e.target.value)}
                  >
                    <option value="bottom-banner">Bottom Banner</option>
                    <option value="top-banner">Top Banner</option>
                    <option value="center">Center Stamp</option>
                    <option value="lower-third">Lower-Third</option>
                  </select>
                </div>
                <div>
                  <label className="subheading-label">Font Size</label>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    value={typoFontSize}
                    onChange={(e) => setTypoFontSize(parseInt(e.target.value))}
                    style={{ width: '100%', marginTop: '10px' }}
                  />
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                    {typoFontSize}px
                  </div>
                </div>
                <div>
                  <label className="subheading-label">Text Color</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="color"
                      value={typoFontColor}
                      onChange={(e) => setTypoFontColor(e.target.value)}
                      style={{ width: '42px', height: '36px', border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
                    />
                    <span style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                      {typoFontColor}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '20px' }}>
                  <input
                    type="checkbox"
                    id="typo-bg-box"
                    checked={typoBackgroundBox}
                    onChange={(e) => setTypoBackgroundBox(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label htmlFor="typo-bg-box" style={{ fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    Semi-transparent badge backdrop
                  </label>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '18px' }}>
                <div>
                  <label className="subheading-label">Edit Prompt / Instruction</label>
                  <input
                    type="text"
                    className="input-glass"
                    placeholder={
                      editorMode === 'replace_background' 
                        ? 'Describe the new background (e.g. futuristic glass studio overlooking sunrise skyline)' 
                        : editorMode === 'modify_object' 
                          ? 'Describe how the object should be changed' 
                          : 'Describe the target artistic style'
                    }
                    value={editorPrompt}
                    onChange={(e) => setEditorPrompt(e.target.value)}
                  />
                </div>

                {editorMode === 'modify_object' && (
                  <div className="grid-2">
                    <div>
                      <label className="subheading-label">Target Object to Change</label>
                      <input
                        type="text"
                        className="input-glass"
                        placeholder="e.g. coffee mug on table"
                        value={editorTargetObject}
                        onChange={(e) => setEditorTargetObject(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="subheading-label">Replacement Object</label>
                      <input
                        type="text"
                        className="input-glass"
                        placeholder="e.g. sleek matte-black thermos"
                        value={editorReplacement}
                        onChange={(e) => setEditorReplacement(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Inpainting Brush Controls (When an image is loaded) */}
            {editorSourceImage && editorMode !== 'typography' && (
              <div style={{ background: '#F8FAFC', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px 16px', marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <IconBrush size={16} style={{ color: 'var(--action-primary)' }} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Inpainting Brush:
                  </span>
                  <input
                    type="range"
                    min="10"
                    max="80"
                    value={brushSize}
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                    style={{ width: '120px' }}
                  />
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{brushSize}px</span>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {hasDrawnMask && (
                    <button
                      className="btn-outline"
                      style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                      onClick={handleClearMask}
                    >
                      Clear Mask
                    </button>
                  )}
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Paint over image to mark modification zone
                  </span>
                </div>
              </div>
            )}

            {/* Image Canvas / Work Area */}
            {editorSourceImage ? (
              <div className="grid-2" style={{ gap: '20px', marginBottom: '20px' }}>
                {/* Source / Drawing Canvas */}
                <div>
                  <div className="subheading-label">Base Canvas (Draw Mask to Inpaint)</div>
                  <div style={{ background: '#0F172A', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-subtle)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <canvas
                      ref={canvasRef}
                      onMouseDown={startDrawing}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onMouseMove={drawOnCanvas}
                      style={{ maxWidth: '100%', height: 'auto', display: 'block', cursor: 'crosshair' }}
                    />
                  </div>
                </div>

                {/* Result Area */}
                <div>
                  <div className="subheading-label">Edited Result Preview</div>
                  <div style={{ background: '#0F172A', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-subtle)', minHeight: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {editorResultImage ? (
                      <img
                        src={`data:image/png;base64,${editorResultImage}`}
                        alt="Edited Result"
                        style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
                      />
                    ) : (
                      <div style={{ textAlign: 'center', color: '#64748B', padding: '20px', fontSize: '0.85rem' }}>
                        <div>Execute an operation to preview the modified image here.</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div 
                className="studio-dropzone" 
                style={{ marginBottom: '20px', padding: '48px 24px' }}
                onClick={() => document.getElementById('editor-image-upload')?.click()}
              >
                <IconImage size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                  No Image Loaded in Smart Editor
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', margin: '6px 0 14px' }}>
                  Generate an image in Image Studio and click <strong>"Send to Smart Editor"</strong>, or upload a custom image.
                </p>
                <button
                  className="btn-primary"
                  style={{ fontSize: '0.84rem', padding: '8px 18px' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    document.getElementById('editor-image-upload')?.click();
                  }}
                >
                  <IconUpload size={14} />
                  <span>Upload Local File</span>
                </button>
              </div>
            )}

            {/* Execute Button Bar */}
            {editorSourceImage && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  {editorResultImage && (
                    <button
                      className="btn-emerald"
                      style={{ fontSize: '0.85rem', padding: '8px 16px' }}
                      onClick={handleAdoptEditedImage}
                    >
                      <IconCheck size={14} />
                      <span>Adopt as New Base Image</span>
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  {editorResultImage && (
                    <a
                      href={`data:image/png;base64,${editorResultImage}`}
                      download="edited_content_asset.png"
                      className="btn-outline"
                      style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                    >
                      <IconDownload size={14} />
                      <span>Download Result</span>
                    </a>
                  )}

                  <button
                    className="btn-primary"
                    style={{ padding: '8px 20px', fontSize: '0.88rem' }}
                    onClick={handleExecuteEdit}
                    disabled={isEditing}
                  >
                    <IconSparkles size={16} />
                    <span>
                      {isEditing 
                        ? 'Applying Edits...' 
                        : editorMode === 'typography' 
                          ? 'Render Typography Overlay' 
                          : 'Execute Edit with Gemini'
                      }
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
