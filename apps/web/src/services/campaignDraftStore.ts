import { API_BASE } from '../apiConfig';
import type { CampaignDraft, CampaignDraftSummary, ListCampaignDraftsResponse } from '../types';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'unsaved';

type StatusListener = (status: SaveStatus, lastSavedAt?: Date) => void;

class CampaignDraftStore {
  private inMemoryDrafts: Map<string, CampaignDraft> = new Map();
  private activeCampaignId: string | null = null;
  private saveDebounceTimer: any = null;
  private pendingDraftToSave: CampaignDraft | null = null;
  private currentSaveStatus: SaveStatus = 'idle';
  private lastSavedTime: Date | null = null;
  private statusListeners: Set<StatusListener> = new Set();
  private saveRequestId = 0;

  constructor() {
    // Restore active campaign ID from sessionStorage if available
    try {
      this.activeCampaignId = sessionStorage.getItem('active_campaign_id');
    } catch {
      this.activeCampaignId = null;
    }

    // Warn user if leaving while an autosave is in flight
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', (e) => {
        if (this.currentSaveStatus === 'saving' || this.pendingDraftToSave) {
          e.preventDefault();
          e.returnValue = 'You have unsaved campaign changes. Are you sure you want to leave?';
        }
      });
    }
  }

  public subscribeStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.currentSaveStatus, this.lastSavedTime || undefined);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private setStatus(status: SaveStatus, savedAt?: Date) {
    this.currentSaveStatus = status;
    if (savedAt) this.lastSavedTime = savedAt;
    for (const listener of this.statusListeners) {
      listener(status, this.lastSavedTime || undefined);
    }
  }

  public getActiveCampaignId(): string | null {
    return this.activeCampaignId;
  }

  public setActiveCampaignId(id: string | null) {
    this.activeCampaignId = id;
    try {
      if (id) {
        sessionStorage.setItem('active_campaign_id', id);
      } else {
        sessionStorage.removeItem('active_campaign_id');
      }
    } catch {
      // Ignore sessionStorage exceptions in private browsing
    }
  }

  /**
   * Sanitizes a draft before sending upstream.
   * Strips out raw base64 data payloads (keeps clean durable media URLs).
   */
  private sanitizeDraftForStorage(draft: CampaignDraft): CampaignDraft {
    const cleanArtwork = { ...(draft.artwork_data || {}) };
    if (cleanArtwork.generatedImages && Array.isArray(cleanArtwork.generatedImages)) {
      cleanArtwork.generatedImages = cleanArtwork.generatedImages.map((img: any) => ({
        id: img.id,
        url: img.url,
        image_base64: undefined,
        prompt: img.prompt || '',
        aspect_ratio: img.aspect_ratio,
        style_preset: img.style_preset,
        mime_type: img.mime_type,
        created_at: img.created_at,
      }));
    }

    const cleanActiveArtwork = draft.active_artwork ? {
      url: draft.active_artwork.url,
      title: draft.active_artwork.title,
      // Omit base64
    } : null;

    return {
      ...draft,
      artwork_data: cleanArtwork,
      active_artwork: cleanActiveArtwork,
      brief_data: {
        ...(draft.brief_data || {}),
        // Omit giant binary uploaded brief files from JSONB (metadata preserved)
        briefFileName: draft.brief_data?.briefFileName,
        briefFileMime: draft.brief_data?.briefFileMime,
      }
    };
  }

  /**
   * In-memory update and debounced durable autosave to PostgreSQL.
   */
  public saveDraft(draft: CampaignDraft, debounceMs = 1000): void {
    this.inMemoryDrafts.set(draft.campaign_id, draft);
    this.setActiveCampaignId(draft.campaign_id);
    this.pendingDraftToSave = draft;

    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(() => {
      this.executeAutosave();
    }, debounceMs);
  }

  /**
   * Immediately persists any pending changes without waiting for debounce.
   */
  public async flushSave(): Promise<boolean> {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    return this.executeAutosave();
  }

  private async executeAutosave(): Promise<boolean> {
    const draft = this.pendingDraftToSave;
    if (!draft) return true;

    this.saveRequestId++;
    const thisRequestId = this.saveRequestId;
    this.setStatus('saving');

    try {
      const sanitized = this.sanitizeDraftForStorage(draft);

      const res = await fetch(`${API_BASE}/content-studio/drafts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitized),
      });

      // Avoid older responses overwriting newer saves
      if (thisRequestId !== this.saveRequestId) {
        return true;
      }

      if (res.ok) {
        const saved: CampaignDraft = await res.json();
        this.inMemoryDrafts.set(saved.campaign_id, {
          ...draft,
          updated_at: saved.updated_at,
          created_at: saved.created_at,
        });
        this.pendingDraftToSave = null;
        this.setStatus('saved', new Date());
        return true;
      } else {
        console.warn('Draft autosave failed with status', res.status);
        this.setStatus('error');
        return false;
      }
    } catch (err) {
      console.error('Failed to autosave campaign draft:', err);
      if (thisRequestId === this.saveRequestId) {
        this.setStatus('error');
      }
      return false;
    }
  }

  /**
   * Loads a draft by ID. Checks in-memory cache first, then PostgreSQL.
   */
  public async loadDraft(campaignId: string): Promise<CampaignDraft | null> {
    if (this.inMemoryDrafts.has(campaignId)) {
      const cached = this.inMemoryDrafts.get(campaignId)!;
      this.setActiveCampaignId(campaignId);
      return cached;
    }

    try {
      const res = await fetch(`${API_BASE}/content-studio/drafts/${encodeURIComponent(campaignId)}`);
      if (res.ok) {
        const draft: CampaignDraft = await res.json();
        this.inMemoryDrafts.set(draft.campaign_id, draft);
        this.setActiveCampaignId(draft.campaign_id);
        return draft;
      }
    } catch (err) {
      console.warn(`Could not load draft ${campaignId}:`, err);
    }
    return null;
  }

  /**
   * Loads the most recently updated draft from PostgreSQL.
   */
  public async loadLatestDraft(): Promise<CampaignDraft | null> {
    try {
      const res = await fetch(`${API_BASE}/content-studio/drafts/latest`);
      if (res.ok) {
        const draft: CampaignDraft | null = await res.json();
        if (draft && draft.campaign_id) {
          this.inMemoryDrafts.set(draft.campaign_id, draft);
          this.setActiveCampaignId(draft.campaign_id);
          return draft;
        }
      }
    } catch (err) {
      console.warn('Could not load latest draft:', err);
    }
    return null;
  }

  /**
   * Lists all saved drafts for campaign switcher.
   */
  public async listDrafts(): Promise<CampaignDraftSummary[]> {
    try {
      const res = await fetch(`${API_BASE}/content-studio/drafts`);
      if (res.ok) {
        const data: ListCampaignDraftsResponse = await res.json();
        return data.drafts || [];
      }
    } catch (err) {
      console.warn('Could not list campaign drafts:', err);
    }
    return [];
  }

  /**
   * Deletes a draft from memory and PostgreSQL.
   */
  public async deleteDraft(campaignId: string): Promise<boolean> {
    this.inMemoryDrafts.delete(campaignId);
    if (this.activeCampaignId === campaignId) {
      this.setActiveCampaignId(null);
    }

    try {
      const res = await fetch(`${API_BASE}/content-studio/drafts/${encodeURIComponent(campaignId)}`, {
        method: 'DELETE',
      });
      return res.ok;
    } catch (err) {
      console.warn(`Could not delete draft ${campaignId}:`, err);
      return false;
    }
  }

  /**
   * Gets in-memory cached draft without network request.
   */
  public getCachedDraft(campaignId: string): CampaignDraft | undefined {
    return this.inMemoryDrafts.get(campaignId);
  }
}

export const campaignDraftStore = new CampaignDraftStore();
