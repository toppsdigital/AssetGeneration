import { create } from 'zustand';

export interface Layer {
  id: number;
  name: string;
  type: string;
  preview?: string;
  preview_status: string;
  layer_properties: any;
  image_analysis?: any;
  children?: Layer[];
}

export interface TemplateLayerData {
  json_file: string;
  summary: any;
  layers: Layer[];
  tempDir?: string;
}

export interface Edits {
  visibility: Record<number, boolean>;
  text: Record<number, string>;
  smartObjects: Record<number, File | null>;
}

interface Originals {
  visibility: Record<number, boolean>;
  text: Record<number, string>;
  smartObjects: Record<number, string | undefined>;
}

export interface PsdStoreState {
  data: TemplateLayerData | null;
  psdFile: File | null;
  edits: Edits;
  originals: Originals;
  lastLoadedTemplate: string | null;
  setData: (data: TemplateLayerData) => void;
  setPsdFile: (file: File | null) => void;
  setEdits: (edits: Edits) => void;
  setOriginals: (originals: Originals) => void;
  updateVisibility: (id: number, visible: boolean) => void;
  updateText: (id: number, text: string) => void;
  updateSmartObject: (id: number, file: File | null) => void;
  reset: () => void;
  setLastLoadedTemplate: (template: string | null) => void;
}

export const usePsdStore = create<PsdStoreState>((set, get) => ({
  data: null,
  psdFile: null,
  edits: { visibility: {}, text: {}, smartObjects: {} },
  originals: { visibility: {}, text: {}, smartObjects: {} },
  lastLoadedTemplate: null,
  setData: (data) => set({ data }),
  setPsdFile: (file) => set({ psdFile: file }),
  setEdits: (edits) => set({ edits }),
  setOriginals: (originals) => set({ originals }),
  updateVisibility: (id, visible) => set(state => {
    const orig = state.originals.visibility[id];
    const newEdits = { ...state.edits.visibility };
    if (orig === undefined || visible !== orig) {
      newEdits[id] = visible;
    } else {
      delete newEdits[id];
    }
    return { edits: { ...state.edits, visibility: newEdits } };
  }),
  updateText: (id, text) => set(state => {
    const orig = state.originals.text[id];
    const newEdits = { ...state.edits.text };
    if (orig === undefined || text !== orig) {
      newEdits[id] = text;
    } else {
      delete newEdits[id];
    }
    return { edits: { ...state.edits, text: newEdits } };
  }),
  updateSmartObject: (id, file) => set(state => {
    // Only track if file name is different from original
    const orig = state.originals.smartObjects[id];
    const newEdits = { ...state.edits.smartObjects };
    if (file && file.name !== orig) {
      newEdits[id] = file;
    } else {
      delete newEdits[id];
    }
    return { edits: { ...state.edits, smartObjects: newEdits } };
  }),
  reset: () => set({ data: null, psdFile: null, edits: { visibility: {}, text: {}, smartObjects: {} }, originals: { visibility: {}, text: {}, smartObjects: {} }, lastLoadedTemplate: null }),
  setLastLoadedTemplate: (template) => set({ lastLoadedTemplate: template }),
})); 