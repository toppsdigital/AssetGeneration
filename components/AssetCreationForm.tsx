'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HARDCODED_COLORS, getColorNameByRgb } from '../utils/colors';

// For multiple spot/color selections in parallel mode
interface SpotColorPair {
  spot: string;
  color?: string;
}

interface AssetConfig {
  id: string;
  name: string; // User-editable name for the asset
  type: 'wp' | 'back' | 'base' | 'parallel' | 'multi-parallel' | 'wp-1of1' | 'front';
  layer: string;
  seq?: string; // e.g. "1/1" for 1-of-1 assets
  spot?: string;
  color?: string;
  spot_color_pairs?: SpotColorPair[]; // For PARALLEL cards with multiple combinations
  vfx?: string;
  chrome: string | boolean;
  wp_inv_layer?: string; // For chrome effects
  wp?: string; // For VFX effects (wp layer, v20+)
  foil?: {
    foil_layer?: string;
    foil_color?: 'silver' | 'gold';
  };
  coldfoil?: {
    coldfoil_layer?: string;
    coldfoil_color?: 'silver' | 'gold';
  };
  foilfractor?: boolean;
}

interface AssetCreationFormProps {
  isOpen: boolean;
  onClose: () => void;
  jsonData: any;
  getExtractedLayers: () => string[];
  getConfiguredAssets: () => AssetConfig[];
  generateAssetName: (type: string, config: Partial<AssetConfig>, existingNames?: string[]) => string;
  savingAsset: boolean;
  editingAssetId: string | null;
  editingAsset: AssetConfig | null;
  onAddAsset: (config: AssetConfig, spot_color_pairs: SpotColorPair[]) => Promise<void>;
  onResetConfig: () => void;
  isToppsNow?: boolean;
}



export const AssetCreationForm = ({
  isOpen,
  onClose,
  jsonData,
  getExtractedLayers,
  getConfiguredAssets,
  generateAssetName,
  savingAsset,
  editingAssetId,
  editingAsset,
  onAddAsset,
  onResetConfig,
  isToppsNow = false
}: AssetCreationFormProps) => {
  // State management
  const [currentCardType, setCurrentCardType] = useState<'wp' | 'back' | 'base' | 'parallel' | 'multi-parallel' | 'wp-1of1' | 'front' | null>(null);
  const [currentConfig, setCurrentConfig] = useState<Partial<AssetConfig>>({
    chrome: false,
    name: '',
    wp_inv_layer: '',
    wp: ''
  });
  const [spot_color_pairs, setSpot_color_pairs] = useState<SpotColorPair[]>([{ spot: '', color: undefined }]);

  type CardSide = 'front' | 'back';

  // Effect to populate form when editing an existing asset
  useEffect(() => {
    if (editingAsset && editingAssetId) {
      console.log('🔄 Populating form for editing asset:', editingAsset);
      
      // Set the card type - map actual types back to 'front' if needed
      const cardTypeForUI = editingAsset.type === 'base' || editingAsset.type === 'parallel' || editingAsset.type === 'multi-parallel' 
        ? 'front' 
        : editingAsset.type;
      
      console.log('🔄 Setting form data for editing:', {
        originalType: editingAsset.type,
        cardTypeForUI,
        layer: editingAsset.layer,
        availableLayers: getLayersByType(cardTypeForUI)
      });
      
      setCurrentCardType(cardTypeForUI);
      
      // Build normalized foil/coldfoil layers to match available options
      const foilOptions = cardTypeForUI === 'back' ? getFoilLayersForSide('back') : getFoilLayers();
      const coldfoilOptions = getColdfoilLayers();
      const normalizedFoilLayer =
        cardTypeForUI === 'back'
          ? normalizeEffectLayerSelectionForSide(
              typeof editingAsset.foil === 'object' ? editingAsset.foil?.foil_layer : undefined,
              foilOptions,
              'foil',
              'back'
            )
          : normalizeEffectLayerSelection(
              typeof editingAsset.foil === 'object' ? editingAsset.foil?.foil_layer : undefined,
              foilOptions,
              'foil'
            );
      const normalizedColdfoilLayer = normalizeEffectLayerSelection(
        editingAsset.coldfoil?.coldfoil_layer,
        coldfoilOptions,
        'coldfoil'
      );

      // Set the configuration
      setCurrentConfig({
        id: editingAsset.id,
        name: editingAsset.name,
        layer: editingAsset.layer,
        seq: (editingAsset as any).seq || undefined,
        vfx: editingAsset.vfx || '',
        chrome: editingAsset.chrome || false,
        wp_inv_layer: editingAsset.wp_inv_layer || '',
        wp: editingAsset.wp || '',
        foil: typeof editingAsset.foil === 'object'
          ? {
              foil_layer: normalizedFoilLayer || editingAsset.foil?.foil_layer,
              foil_color: (editingAsset.foil?.foil_color as 'silver' | 'gold') || 'silver'
            }
          : undefined,
        coldfoil: editingAsset.coldfoil
          ? {
              coldfoil_layer: normalizedColdfoilLayer || editingAsset.coldfoil?.coldfoil_layer,
              coldfoil_color: (editingAsset.coldfoil?.coldfoil_color as 'silver' | 'gold') || 'silver'
            }
          : undefined,
        foilfractor: editingAsset.foilfractor || undefined,
        type: editingAsset.type
      });
      
      // Set spot color pairs for parallel/multi-parallel assets
      if (editingAsset.spot_color_pairs && editingAsset.spot_color_pairs.length > 0) {
        // Convert RGB values back to color names for the UI
        const convertedPairs = editingAsset.spot_color_pairs.map(pair => ({
          spot: cardTypeForUI === 'back' ? normalizeSpotSelectionForSide(pair.spot, 'back') : pair.spot,
          color: pair.color?.startsWith('R') ? getColorNameByRgb(pair.color) : pair.color
        }));
        setSpot_color_pairs(convertedPairs);
      } else if (editingAsset.spot && editingAsset.color) {
        // Handle legacy single spot/color format
        const colorName = editingAsset.color.startsWith('R') ? getColorNameByRgb(editingAsset.color) : editingAsset.color;
        setSpot_color_pairs([{ spot: cardTypeForUI === 'back' ? normalizeSpotSelectionForSide(editingAsset.spot, 'back') : editingAsset.spot, color: colorName }]);
      } else {
        // No spot colors - start with empty array for 'front' type
        setSpot_color_pairs([]);
      }
    } else {
      // Reset form when not editing
      setCurrentCardType(null);
      setCurrentConfig({
        chrome: false,
        name: '',
        wp_inv_layer: '',
        wp: ''
      });
      setSpot_color_pairs([]);
    }
  }, [editingAsset, editingAssetId]);



  // Helper functions
  const getLayersByType = (type: 'wp' | 'back' | 'base' | 'parallel' | 'multi-parallel' | 'wp-1of1' | 'front') => {
    const extractedLayers = getExtractedLayers();
    console.log('🔍 All extracted layers:', extractedLayers);
    
    const filtered = extractedLayers.filter(layer => {
      const lowerLayer = layer.toLowerCase();
      const tokens = lowerLayer.split(/[^a-z0-9]+/).filter(Boolean);
      switch(type) {
        case 'wp':
        case 'wp-1of1':
          // Include any 'wp' but exclude 'wp_inv'
          return (tokens.includes('wp') || lowerLayer.includes('wp')) && !lowerLayer.includes('inv');
        case 'back': 
          // Accept 'bk' or 'back' appearing as tokens anywhere in the name
          return tokens.includes('bk') || tokens.includes('back');
        case 'base':
        case 'front':
          // Accept any CMYK base regardless of 'fr' prefix
          return tokens.includes('cmyk') || lowerLayer.includes('fr_cmyk');
        case 'parallel':
        case 'multi-parallel':
          // Accept any spot layers regardless of 'fr' prefix
          return tokens.includes('spot') || lowerLayer.includes('spot');
        default:
          return false;
      }
    });
    
    console.log(`🎯 Filtered ${type} layers:`, filtered);
    return filtered;
  };

  const getSpotLayers = () => {
    const extractedLayers = getExtractedLayers();
    // Return unique canonical spot labels: spot, spot1, spot2, spot3...
    const spotSet = new Set<string>();
    extractedLayers.forEach(layer => {
      const lower = layer.toLowerCase();
      if (lower.includes('spot')) {
        const match = lower.match(/spot(\d+)/);
        if (match && match[1]) {
          spotSet.add(`spot${match[1]}`);
        } else {
          spotSet.add('spot');
        }
      }
    });
    return Array.from(spotSet).sort();
  };

  const getFrontSpotLayers = () => {
    const extractedLayers = getExtractedLayers();
    const frontSet = new Set<string>();

    extractedLayers.forEach((layer) => {
      const lower = (layer || '').toLowerCase();
      if (!lower.includes('spot')) return;

      const tokens = lower.split(/[^a-z0-9]+/).filter(Boolean);
      const isFrontQualified = tokens.includes('fr') || tokens.includes('front');
      if (!isFrontQualified) return;

      // Prefer extracting "spotuv", "spot1", etc from "fr_spotuv"
      const frMatch = lower.match(/(?:^|[^a-z0-9])fr_(spot[a-z0-9]*)/);
      if (frMatch && frMatch[1]) {
        frontSet.add(frMatch[1]);
        return;
      }

      // Fallback: keep legacy canonicalization for numeric spots
      const match = lower.match(/spot(\d+)/);
      if (match && match[1]) frontSet.add(`spot${match[1]}`);
      else frontSet.add('spot');
    });

    const frontOnly = Array.from(frontSet).sort();
    // If we have any front-qualified spot layers, use those; otherwise fall back to legacy behavior.
    return frontOnly.length > 0 ? frontOnly : getSpotLayers();
  };

  const getSpotLayersForSide = (side: CardSide) => {
    const extractedLayers = getExtractedLayers();
    const spotSet = new Set<string>();

    extractedLayers.forEach((layer) => {
      const lower = (layer || '').toLowerCase();
      if (!lower.includes('spot')) return;

      const tokens = lower.split(/[^a-z0-9]+/).filter(Boolean);
      const isBackQualified = tokens.includes('bk') || tokens.includes('back');
      const isFrontQualified = tokens.includes('fr') || tokens.includes('front');

      if (side === 'back' && !isBackQualified) return;
      if (side === 'front' && !isFrontQualified) return;

      // Prefer preserving the full qualified token (bk_spot1, fr_spotuv, etc)
      const qualifiedMatch = lower.match(/(?:^|[^a-z0-9])((?:bk|fr)_spot[a-z0-9]*)/);
      if (qualifiedMatch && qualifiedMatch[1]) {
        spotSet.add(qualifiedMatch[1]);
        return;
      }

      // Back-only: if not explicitly bk_spot..., synthesize bk_spot... for differentiation
      if (side === 'back') {
        const match = lower.match(/spot([a-z0-9]*)/);
        const suffix = match?.[1] || '';
        spotSet.add(`bk_spot${suffix}`);
        return;
      }

      // Front fallback (legacy): canonicalize to spot/spot1/spot2...
      const match = lower.match(/spot(\d+)/);
      if (match && match[1]) spotSet.add(`spot${match[1]}`);
      else spotSet.add('spot');
    });

    const sideQualified = Array.from(spotSet).sort();

    // Back-compat: if no side-qualified spots exist, fall back to legacy detection.
    if (sideQualified.length === 0) {
      return getSpotLayers();
    }

    return sideQualified;
  };

  // Build unique canonical options per type for dropdowns
  const getCanonicalOptionsForType = (type: 'wp' | 'back' | 'base' | 'parallel' | 'multi-parallel' | 'wp-1of1' | 'front'): string[] => {
    const extractedLayers = getExtractedLayers();
    const options = new Set<string>();

    extractedLayers.forEach(layer => {
      const lower = layer.toLowerCase();
      const tokens = lower.split(/[^a-z0-9]+/).filter(Boolean);
      switch (type) {
        case 'back': {
          if (tokens.includes('bk') || tokens.includes('back')) {
            options.add('bk');
          }
          break;
        }
        case 'base':
        case 'front': {
          if (tokens.includes('cmyk') || lower.includes('fr_cmyk')) {
            options.add('cmyk');
          }
          break;
        }
        case 'parallel':
        case 'multi-parallel': {
          if (lower.includes('spot')) {
            const match = lower.match(/spot(\d+)/);
            if (match && match[1]) {
              options.add(`spot${match[1]}`);
            } else {
              options.add('spot');
            }
          }
          break;
        }
        case 'wp':
        case 'wp-1of1': {
          if ((tokens.includes('wp') || lower.includes('wp')) && !lower.includes('inv')) {
            options.add('wp');
          }
          break;
        }
        default:
          break;
      }
    });

    return Array.from(options).sort();
  };

  const getVfxTextures = () => {
    // Get VFX textures from JSON data under "VFX textures" group
    const vfxGroup = jsonData?.layers?.find((layer: any) => 
      layer.name?.toLowerCase().includes('vfx') || layer.name?.toLowerCase().includes('texture')
    );
    
    if (vfxGroup && vfxGroup.children) {
      return vfxGroup.children
        .map((child: any) => child.name || 'Unnamed Texture')
        .filter((textureName: string) => {
          const lower = (textureName || '').toLowerCase();
          // Filter out "wpcv" and items that start with "spot texture"
          return !lower.includes('wpcv') && !lower.startsWith('spot texture');
        });
    }
    return [];
  };

  const getWpInvLayers = () => {
    const extractedLayers = getExtractedLayers();
    return extractedLayers.filter(layer =>
      layer.toLowerCase().includes('wp') && layer.toLowerCase().includes('inv')
    );
  };

  const getWpLayers = () => {
    const extractedLayers = getExtractedLayers();
    return extractedLayers.filter(layer => {
      const lower = layer.toLowerCase();
      return lower.includes('wp') && !lower.includes('inv');
    });
  };

  const getColorVariants = () => {
    // Return a single color group with all hardcoded colors
    return [{
      groupName: 'COLORS',
      colors: HARDCODED_COLORS
    }];
  };

  const getFoilLayers = () => {
    const extractedLayers = getExtractedLayers();
    const foilSet = new Set<string>();
    extractedLayers.forEach(layer => {
      const lower = layer.toLowerCase();
      // Exclude coldfoil from plain foil detection
      if (lower.includes('coldfoil')) return;
      if (lower.includes('foil')) {
        const match = lower.match(/foil(\d+)/);
        if (match && match[1]) {
          foilSet.add(`foil${match[1]}`);
        } else {
          foilSet.add('foil');
        }
      }
    });
    return Array.from(foilSet).sort();
  };

  const getFrontFoilLayers = () => {
    const extractedLayers = getExtractedLayers();
    const frontSet = new Set<string>();

    extractedLayers.forEach((layer) => {
      const lower = (layer || '').toLowerCase();
      if (lower.includes('coldfoil')) return;
      if (!lower.includes('foil')) return;

      const tokens = lower.split(/[^a-z0-9]+/).filter(Boolean);
      const isFrontQualified = tokens.includes('fr') || tokens.includes('front');
      if (!isFrontQualified) return;

      const frMatch = lower.match(/(?:^|[^a-z0-9])fr_(foil\d*)/);
      if (frMatch && frMatch[1]) {
        // keep unprefixed label for front UI
        frontSet.add(frMatch[1]);
        return;
      }

      const match = lower.match(/foil(\d+)/);
      if (match && match[1]) frontSet.add(`foil${match[1]}`);
      else frontSet.add('foil');
    });

    const frontOnly = Array.from(frontSet).sort();
    // If we have any front-qualified foil layers, use those; otherwise fall back to legacy behavior.
    return frontOnly.length > 0 ? frontOnly : getFoilLayers();
  };

  const getFoilLayersForSide = (side: CardSide) => {
    const extractedLayers = getExtractedLayers();
    const foilSet = new Set<string>();

    extractedLayers.forEach((layer) => {
      const lower = (layer || '').toLowerCase();
      if (lower.includes('coldfoil')) return;
      if (!lower.includes('foil')) return;

      // Prefer side-qualified foil layers (e.g. fr_foil1, bk_foil1)
      const tokens = lower.split(/[^a-z0-9]+/).filter(Boolean);
      const isBackQualified = tokens.includes('bk') || tokens.includes('back');
      const isFrontQualified = tokens.includes('fr') || tokens.includes('front');

      if (side === 'back' && !isBackQualified) return;
      if (side === 'front' && !isFrontQualified) return;

      // Prefer preserving full qualified token (bk_foil1 / fr_foil1)
      const qualifiedMatch = lower.match(/(?:^|[^a-z0-9])((?:bk|fr)_foil\d*)/);
      if (qualifiedMatch && qualifiedMatch[1]) {
        foilSet.add(qualifiedMatch[1]);
        return;
      }

      // Back-only: if not explicitly bk_foil..., synthesize bk_foil... for differentiation
      if (side === 'back') {
        const match = lower.match(/foil(\d*)/);
        const suffix = match?.[1] || '';
        foilSet.add(`bk_foil${suffix}`);
        return;
      }

      // Front fallback (legacy): canonicalize to foil/foil1...
      const match = lower.match(/foil(\d+)/);
      if (match && match[1]) foilSet.add(`foil${match[1]}`);
      else foilSet.add('foil');
    });

    const sideQualified = Array.from(foilSet).sort();

    // Back-compat: only fall back for front; back should stay bk_* (or empty).
    if (sideQualified.length === 0 && side !== 'back') return getFoilLayers();

    return sideQualified;
  };

  const normalizeEffectLayerSelectionForSide = (
    desiredLayer: string | undefined,
    availableOptions: string[],
    baseToken: 'foil' | 'coldfoil',
    side: CardSide
  ): string | undefined => {
    if (!desiredLayer) return undefined;

    const normalized = normalizeEffectLayerSelection(desiredLayer, availableOptions, baseToken);
    if (!normalized) return normalized;

    // Back-only: map legacy "foil1" -> "bk_foil1" when options exist.
    if (side === 'back' && !normalized.includes('_') && baseToken === 'foil') {
      const candidate = `bk_${normalized}`;
      if (availableOptions.includes(candidate)) return candidate;
    }

    return normalized;
  };

  const normalizeSpotSelectionForSide = (spot: string, side: CardSide): string => {
    const desired = (spot || '').toLowerCase();
    const options = getSpotLayersForSide(side);
    if (options.includes(desired)) return desired;

    // Map legacy "spot1" -> "bk_spot1" (or "fr_spot1") when those exist.
    if (!desired.includes('_')) {
      const prefix = side === 'back' ? 'bk_' : 'fr_';
      const candidate = `${prefix}${desired}`;
      if (options.includes(candidate)) return candidate;
    }

    return spot;
  };

  const getColdfoilLayers = () => {
    const extractedLayers = getExtractedLayers();
    const cfSet = new Set<string>();
    extractedLayers.forEach(layer => {
      const lower = layer.toLowerCase();
      if (lower.includes('coldfoil')) {
        const match = lower.match(/coldfoil(\d+)/);
        if (match && match[1]) {
          cfSet.add(`coldfoil${match[1]}`);
        } else {
          cfSet.add('coldfoil');
        }
      }
    });
    return Array.from(cfSet).sort();
  };

  // Normalize foil/coldfoil layer to match available options (e.g., 'coldfoil1' -> 'coldfoil' if only base exists)
  const normalizeEffectLayerSelection = (
    desiredLayer: string | undefined,
    availableOptions: string[],
    baseToken: 'foil' | 'coldfoil'
  ): string | undefined => {
    if (!desiredLayer) return undefined;
    const desired = desiredLayer.toLowerCase();
    if (availableOptions.includes(desired)) return desired;
    // Try base token (strip trailing digits)
    const base = desired.replace(new RegExp(`^(${baseToken})(\\d+)$`), '$1');
    if (availableOptions.includes(base)) return base;
    // Try first option that starts with base token
    const firstCandidate = availableOptions.find(opt => opt.startsWith(baseToken));
    return firstCandidate || desiredLayer;
  };

  // Function to determine the actual asset type based on configuration
  const determineActualAssetType = (cardType: string, config: Partial<AssetConfig>, spotPairs: SpotColorPair[]): 'base' | 'parallel' | 'multi-parallel' => {
    if (cardType !== 'front') {
      return cardType as 'base' | 'parallel' | 'multi-parallel';
    }

    // For 'front' type, determine based on configuration:
    // Base: CMYK only (non-superfractor)
    // Parallel: CMYK + superfractor OR CMYK + 1 spot
    // Multi-parallel: CMYK + more than 1 spot

    const validSpotPairs = spotPairs.filter(pair => pair.spot && pair.color);
    const hasSuperfractor = config.chrome === 'superfractor';

    if (validSpotPairs.length === 0 && !hasSuperfractor) {
      return 'base'; // CMYK only (non-superfractor)
    } else if (validSpotPairs.length === 1 || hasSuperfractor) {
      return 'parallel'; // CMYK + 1 spot OR CMYK + superfractor
    } else {
      return 'multi-parallel'; // CMYK + more than 1 spot
    }
  };

  // Auto-update asset name when configuration changes
  useEffect(() => {
    if (currentCardType && !editingAssetId) {
      // Only auto-update if not editing an existing asset
      const existingNames = getConfiguredAssets().map(asset => asset.name);
      const configForName = {
        ...currentConfig,
        spot_color_pairs: currentCardType === 'parallel' || currentCardType === 'multi-parallel' 
          ? spot_color_pairs 
          : undefined
      };
      console.log('🔍 Name generation config:', { 
        cardType: currentCardType, 
        vfx: configForName.vfx, 
        chrome: configForName.chrome,
        spot_color_pairs: configForName.spot_color_pairs
      });
      // For 'front' type, determine name type (special handling for base + superfractor)
      let typeForNaming = currentCardType;
      if (currentCardType === 'front') {
        const actualType = determineActualAssetType(currentCardType, configForName, spot_color_pairs);
        const validSpotPairs = spot_color_pairs.filter(pair => pair.spot && pair.color);
        
        // If it becomes parallel due to superfractor (not spot colors), use 'base' for naming
        if (actualType === 'parallel' && configForName.chrome === 'superfractor' && validSpotPairs.length === 0) {
          typeForNaming = 'base';
        } else {
          typeForNaming = actualType;
        }
      }
      const newName = generateAssetName(typeForNaming, configForName, existingNames);
      
      // Only update if the name is empty or appears to be auto-generated (to preserve user edits)
      const basicPattern = generateAssetName(typeForNaming, { type: typeForNaming }, existingNames);
      const currentName = currentConfig.name || '';
      
      // Check if current name appears to be auto-generated by looking for patterns
      const isAutoGenerated = !currentName || 
                              currentName === basicPattern || 
                              currentName.endsWith('_1') || 
                              currentName.endsWith('_2') ||
                              currentName.startsWith(currentCardType === 'parallel' ? '' : currentCardType) ||
                              (currentCardType === 'parallel' && currentName.match(/^[a-z]+\d+$/)) ||  // matches pattern like "black1"
                              (currentCardType === 'multi-parallel' && currentName.match(/^[a-z]+\d+[a-z]+\d+/)); // matches pattern like "black1blue2"
      
      console.log('🔍 Name update check:', { 
        currentName, 
        newName, 
        basicPattern, 
        isAutoGenerated,
        shouldUpdate: isAutoGenerated 
      });
      
      if (isAutoGenerated) {
        console.log('🔄 Updating name from', currentName, 'to', newName);
        setCurrentConfig(prev => ({ ...prev, name: newName }));
      } else {
        console.log('🚫 Not updating name - appears to be user-edited');
      }
    }
  }, [currentCardType, currentConfig.layer, currentConfig.vfx, currentConfig.chrome, spot_color_pairs, editingAssetId, getConfiguredAssets, generateAssetName]);

  // Auto-select wp layer for VFX and wp_inv_layer for chrome/foilfractor
  useEffect(() => {
    if (currentCardType && !editingAssetId) {
      const hasChrome = currentConfig.chrome || currentConfig.foilfractor;
      const hasVfx = !!currentConfig.vfx;
      const wpInvLayers = getWpInvLayers();
      const wpLayers = getWpLayers();

      // Chrome/foilfractor needs wp_inv_layer
      if (!isToppsNow && hasChrome && wpInvLayers.length === 1 && !currentConfig.wp_inv_layer) {
        setCurrentConfig(prev => ({ ...prev, wp_inv_layer: wpInvLayers[0] }));
      } else if (!hasChrome && currentConfig.wp_inv_layer) {
        setCurrentConfig(prev => ({ ...prev, wp_inv_layer: '' }));
      }

      // VFX needs wp layer (v20+)
      if (!isToppsNow && hasVfx && wpLayers.length === 1 && !currentConfig.wp) {
        setCurrentConfig(prev => ({ ...prev, wp: wpLayers[0] }));
      } else if (!hasVfx && currentConfig.wp) {
        setCurrentConfig(prev => ({ ...prev, wp: '' }));
      }
    }
  }, [currentCardType, currentConfig.vfx, currentConfig.chrome, currentConfig.foilfractor, editingAssetId, getWpInvLayers, getWpLayers, isToppsNow]);

  // Auto-enable 1/1 when foilfractor is selected or chrome=superfractor
  useEffect(() => {
    if (!currentCardType) return;
    const shouldBeOneOfOne = !!currentConfig.foilfractor || currentConfig.chrome === 'superfractor';
    if (!shouldBeOneOfOne) return;

    if ((currentConfig as any).seq !== '1/1') {
      setCurrentConfig(prev => ({ ...prev, seq: '1/1' } as any));
    }
  }, [currentCardType, currentConfig.foilfractor, currentConfig.chrome, (currentConfig as any).seq]);

  const handleAddAsset = async () => {
    console.log('🔍 handleAddAsset called:', { 
      currentCardType, 
      currentConfig, 
      spot_color_pairs,
      editingAssetId 
    });
    
    if (!currentCardType) {
      console.log('❌ No currentCardType, aborting');
      return;
    }
    
    // Determine the actual asset type for 'front' cards
    const actualType = currentCardType === 'front' 
      ? determineActualAssetType(currentCardType, currentConfig, spot_color_pairs)
      : currentCardType;

    const assetConfig = {
      ...currentConfig,
      type: actualType,
      id: editingAssetId || '' // Will be generated by backend if empty
    } as AssetConfig;
    
    // Ensure foilfractor key is only present when enabled
    if (!currentConfig.foilfractor) {
      delete (assetConfig as any).foilfractor;
    }
    
    // Ensure seq key is only present when explicitly 1/1
    if ((currentConfig as any).seq !== '1/1') {
      delete (assetConfig as any).seq;
    }

    console.log('🔍 Calling onAddAsset with config:', assetConfig);
    
    try {
      await onAddAsset(assetConfig, spot_color_pairs);
      
      console.log('✅ onAddAsset completed successfully, resetting form');
      // Only reset form if the operation was successful
      setCurrentConfig({ chrome: false, name: '', wp_inv_layer: '', wp: '' });
      setCurrentCardType(null);
      setSpot_color_pairs([]);
      // Close modal on successful add
      onClose();
    } catch (error) {
      console.error('❌ Error in handleAddAsset:', error);
      // Don't reset form on error so user can retry
    }
  };

  // Close modal and reset form when closed
  const handleClose = () => {
    setCurrentConfig({ chrome: false, name: '', wp_inv_layer: '', wp: '' });
    setCurrentCardType(null);
    setSpot_color_pairs([]);
    onClose();
  };

  // Don't render if modal is not open
  if (!isOpen) return null;

  // Use createPortal to render modal at document body level
  const modalElement = (
    <>
      {/* Modal Backdrop */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20,
          overflow: 'auto'
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            handleClose();
          }
        }}
      >
        {/* Modal Content */}
        <div
          style={{
            backgroundColor: '#1f2937',
            borderRadius: 16,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            maxWidth: 500,
            width: '100%',
            maxHeight: '85vh',
            overflow: 'hidden',
            position: 'relative',
            margin: 'auto'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div style={{
            padding: '24px 24px 16px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <h2 style={{
              fontSize: 20,
              fontWeight: 600,
              color: '#f8f8f8',
              margin: 0
            }}>
              {editingAssetId ? 'Edit Asset' : 'Add New Asset'}
            </h2>
            <button
              onClick={handleClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: '1px solid rgba(255, 255, 255, 0.2)',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                color: '#f8f8f8',
                fontSize: 16,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
              }}
            >
              ✕
            </button>
          </div>

          {/* Modal Body */}
          <div style={{ 
            padding: 24, 
            maxHeight: 'calc(85vh - 100px)', 
            overflowY: 'auto' 
          }}>
            <div>
      <h3 style={{
        fontSize: 18,
        fontWeight: 600,
        color: '#f8f8f8',
        margin: '0 0 16px 0'
      }}>
        Select Card Type
      </h3>
      
      {/* Step 1: Card Type Selection */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {(['wp', 'back', 'front'] as const).map(type => (
            <button
              key={type}
              onClick={() => {
                setCurrentCardType(type);
                
                // Get existing asset names to avoid duplicates
                const existingNames = getConfiguredAssets().map(asset => asset.name);
                
                if (type === 'front') {
                  // For front type, initialize with no spot pairs - user can add with + button
                  setSpot_color_pairs([]);
                  const canonicalOptions = getCanonicalOptionsForType(type);
                  const autoSelectedLayer = canonicalOptions.length === 1 ? canonicalOptions[0] : '';
                  const initialConfig = { 
                    chrome: false,
                    type,
                    layer: autoSelectedLayer,
                    name: ''
                  };
                  initialConfig.name = generateAssetName('base', initialConfig, existingNames); // Start with base name
                  setCurrentConfig(initialConfig);
                } else {
                  // For other types (wp, back), clear spot/color pairs
                  setSpot_color_pairs([]);
                  const canonicalOptions = getCanonicalOptionsForType(type);
                  const autoSelectedLayer = canonicalOptions.length === 1 ? canonicalOptions[0] : '';
                  const initialConfig = { 
                    chrome: false,
                    type,
                    layer: autoSelectedLayer,
                    name: ''
                  };
                  initialConfig.name = generateAssetName(type, initialConfig, existingNames);
                  setCurrentConfig(initialConfig);
                }
              }}
              style={{
                padding: '8px 16px',
                background: currentCardType === type ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 8,
                color: '#f8f8f8',
                fontSize: 14,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
                          >
                {type === 'front' ? 'FRONT' : type.toUpperCase()}
              </button>
          ))}
        </div>
      </div>

      {/* Dynamic Configuration based on Card Type */}
      {currentCardType && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Layer Selection - Different layout for front vs others */}
          {currentCardType === 'front' ? (
            <div>


              {/* Base Layer Selection for Front */}
              <div style={{ marginBottom: 12 }}>
                <label style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#f8f8f8',
                  marginBottom: 8
                }}>
                  Select Base Layer
                  {(() => {
                    const canonicalOptions = getCanonicalOptionsForType(currentCardType);
                    return canonicalOptions.length === 1 ? (
                      <span style={{ 
                        fontSize: 12, 
                        color: '#10b981', 
                        fontWeight: 400,
                        marginLeft: 8 
                      }}>
                        (auto-selected)
                      </span>
                    ) : null;
                  })()}
                </label>
                <select
                  value={currentConfig.layer || ''}
                  onChange={(e) => {
                    setCurrentConfig(prev => ({ ...prev, layer: e.target.value }));
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: 8,
                    color: '#f8f8f8',
                    fontSize: 14
                  }}
                >
                  <option value="" style={{ background: '#1f2937' }}>Select base layer...</option>
                  {getCanonicalOptionsForType(currentCardType).map(opt => (
                    <option key={opt} value={opt} style={{ background: '#1f2937' }}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              {/* Add Spot Colors Button - Only show if spot layers exist */}
              {getFrontSpotLayers().length > 0 && spot_color_pairs.length === 0 ? (
                <div style={{ marginBottom: 12 }}>
                  <button
                    onClick={() => {
                      setSpot_color_pairs([{ spot: '', color: undefined }]);
                    }}
                    style={{
                      padding: '10px 18px',
                      background: 'rgba(34, 197, 94, 0.2)',
                      border: '1px solid rgba(34, 197, 94, 0.4)',
                      borderRadius: 8,
                      color: '#86efac',
                      fontSize: 14,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'rgba(34, 197, 94, 0.3)';
                      e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.6)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)';
                      e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.4)';
                    }}
                  >
                    <span style={{ fontSize: 16 }}>+</span>
                    Add Spot Colors
                  </button>
                </div>
              ) : getFrontSpotLayers().length > 0 && spot_color_pairs.length > 0 ? (
                /* Spot Colors Section - Only shown when there are pairs and spot layers exist */
                <div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 8
                  }}>
                    <label style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: '#f8f8f8'
                    }}>
                      Spot Colors
                    </label>
                    <button
                      onClick={() => {
                        const maxSpots = Math.min(3, getFrontSpotLayers().length);
                        if (spot_color_pairs.length < maxSpots) {
                          setSpot_color_pairs(prev => [...prev, { spot: '', color: undefined }]);
                        }
                      }}
                      disabled={spot_color_pairs.length >= Math.min(3, getFrontSpotLayers().length)}
                      style={{
                        width: 24,
                        height: 24,
                        background: spot_color_pairs.length >= Math.min(3, getFrontSpotLayers().length)
                          ? 'rgba(156, 163, 175, 0.3)'
                          : 'rgba(34, 197, 94, 0.2)',
                        border: '1px solid ' + (spot_color_pairs.length >= Math.min(3, getFrontSpotLayers().length)
                          ? 'rgba(156, 163, 175, 0.3)'
                          : 'rgba(34, 197, 94, 0.4)'),
                        borderRadius: 6,
                        color: spot_color_pairs.length >= Math.min(3, getFrontSpotLayers().length) ? '#6b7280' : '#86efac',
                        fontSize: 16,
                        cursor: spot_color_pairs.length >= Math.min(3, getFrontSpotLayers().length) ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s'
                      }}
                      title={
                        spot_color_pairs.length >= Math.min(3, getFrontSpotLayers().length) 
                          ? `Maximum ${Math.min(3, getFrontSpotLayers().length)} spots allowed` 
                          : "Add another spot/color pair"
                      }
                    >
                      +
                    </button>
                  </div>
                  
                  {/* Multiple Spot/Color Rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {spot_color_pairs.map((pair, index) => {
                  const spotGroup = getColorVariants()[0]; // Always use first spot group
                  return (
                    <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {/* Spot Layer Selection */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {index === 0 && (
                          <label style={{
                            display: 'block',
                            fontSize: 12,
                            color: '#9ca3af',
                            marginBottom: 4
                          }}>
                            Spot Layer
                          </label>
                        )}
                        <select
                          value={pair.spot || ''}
                          onChange={(e) => {
                            const newPairs = [...spot_color_pairs];
                            newPairs[index] = { ...newPairs[index], spot: e.target.value };
                            setSpot_color_pairs(newPairs);
                          }}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: 8,
                            color: '#f8f8f8',
                            fontSize: 14
                          }}
                        >
                          <option value="" style={{ background: '#1f2937' }}>Select...</option>
                          {getFrontSpotLayers()
                            .filter(layer => !spot_color_pairs.some((p, i) => i !== index && p.spot === layer))
                            .map(layer => (
                              <option key={layer} value={layer} style={{ background: '#1f2937' }}>
                                {layer}
                              </option>
                          ))}
                        </select>
                      </div>
                      
                      {/* Color Selection */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {index === 0 && (
                          <label style={{
                            display: 'block',
                            fontSize: 12,
                            color: '#9ca3af',
                            marginBottom: 4
                          }}>
                            Color
                          </label>
                        )}
                        <select
                          value={pair.color || ''}
                          onChange={(e) => {
                            if (e.target.value) {
                              const newPairs = [...spot_color_pairs];
                              newPairs[index] = { 
                                ...newPairs[index], 
                                color: e.target.value
                              };
                              setSpot_color_pairs(newPairs);
                            } else {
                              const newPairs = [...spot_color_pairs];
                              newPairs[index] = { ...newPairs[index], color: undefined };
                              setSpot_color_pairs(newPairs);
                            }
                          }}
                          disabled={!pair.spot}
                          style={{
                             width: '100%',
                            padding: '8px 12px',
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            borderRadius: 8,
                            color: '#f8f8f8',
                            fontSize: 14,
                            opacity: !pair.spot ? 0.5 : 1
                          }}
                        >
                          <option value="" style={{ background: '#1f2937' }}>Select...</option>
                          {spotGroup?.colors.map((colorLayer: any, idx: number) => (
                            <option 
                              key={idx} 
                              value={colorLayer.name} 
                              style={{ background: '#1f2937' }}
                            >
                              {colorLayer.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      {/* Remove Button - only render when more than one pair to avoid stealing row width */}
                      <button
                        onClick={() => {
                          setSpot_color_pairs(prev => prev.filter((_, i) => i !== index));
                        }}
                        style={{
                          width: 32,
                          height: 32,
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          borderRadius: 8,
                          color: '#ef4444',
                          fontSize: 16,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                          alignSelf: 'flex-start',
                          marginTop: index === 0 ? 22 : 0
                        }}
                        title={'Remove'}
                      >
                        ×
                      </button>
                    </div>
                    );
                  })
                  }
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            /* Regular Layer Selection for non-parallel types */
            <div>
              <label style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 600,
                color: '#f8f8f8',
                marginBottom: 8
              }}>
                Select Layer
                {(() => {
                  const canonicalOptions = getCanonicalOptionsForType(currentCardType);
                  return canonicalOptions.length === 1 ? (
                    <span style={{ 
                      fontSize: 12, 
                      color: '#10b981', 
                      fontWeight: 400,
                      marginLeft: 8 
                    }}>
                      (auto-selected)
                    </span>
                  ) : null;
                })()}
              </label>
              <select
                value={currentConfig.layer || ''}
                onChange={(e) => {
                  setCurrentConfig(prev => ({ ...prev, layer: e.target.value }));
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 8,
                  color: '#f8f8f8',
                  fontSize: 14
                }}
              >
                <option value="" style={{ background: '#1f2937' }}>Select layer...</option>
                {getCanonicalOptionsForType(currentCardType).map(opt => (
                  <option key={opt} value={opt} style={{ background: '#1f2937' }}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Back: Spot Colors Section (only when bk_spot... layers exist) */}
          {currentCardType === 'back' && getSpotLayersForSide('back').length > 0 && (
            <div>
              {spot_color_pairs.length === 0 ? (
                <div style={{ marginBottom: 12 }}>
                  <button
                    onClick={() => {
                      setSpot_color_pairs([{ spot: '', color: undefined }]);
                    }}
                    style={{
                      padding: '10px 18px',
                      background: 'rgba(34, 197, 94, 0.2)',
                      border: '1px solid rgba(34, 197, 94, 0.4)',
                      borderRadius: 8,
                      color: '#86efac',
                      fontSize: 14,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'rgba(34, 197, 94, 0.3)';
                      e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.6)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)';
                      e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.4)';
                    }}
                  >
                    <span style={{ fontSize: 16 }}>+</span>
                    Add Back Spot Colors
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 8
                  }}>
                    <label style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: '#f8f8f8'
                    }}>
                      Back Spot Colors
                    </label>
                    <button
                      onClick={() => {
                        const maxSpots = Math.min(3, getSpotLayersForSide('back').length);
                        if (spot_color_pairs.length < maxSpots) {
                          setSpot_color_pairs(prev => [...prev, { spot: '', color: undefined }]);
                        }
                      }}
                      disabled={spot_color_pairs.length >= Math.min(3, getSpotLayersForSide('back').length)}
                      style={{
                        width: 24,
                        height: 24,
                        background: spot_color_pairs.length >= Math.min(3, getSpotLayersForSide('back').length)
                          ? 'rgba(156, 163, 175, 0.3)'
                          : 'rgba(34, 197, 94, 0.2)',
                        border: '1px solid ' + (spot_color_pairs.length >= Math.min(3, getSpotLayersForSide('back').length)
                          ? 'rgba(156, 163, 175, 0.3)'
                          : 'rgba(34, 197, 94, 0.4)'),
                        borderRadius: 6,
                        color: spot_color_pairs.length >= Math.min(3, getSpotLayersForSide('back').length) ? '#6b7280' : '#86efac',
                        fontSize: 16,
                        cursor: spot_color_pairs.length >= Math.min(3, getSpotLayersForSide('back').length) ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s'
                      }}
                      title={
                        spot_color_pairs.length >= Math.min(3, getSpotLayersForSide('back').length) 
                          ? `Maximum ${Math.min(3, getSpotLayersForSide('back').length)} spots allowed` 
                          : "Add another spot/color pair"
                      }
                    >
                      +
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {spot_color_pairs.map((pair, index) => {
                      const spotGroup = getColorVariants()[0];
                      return (
                        <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {index === 0 && (
                              <label style={{
                                display: 'block',
                                fontSize: 12,
                                color: '#9ca3af',
                                marginBottom: 4
                              }}>
                                Spot Layer
                              </label>
                            )}
                            <select
                              value={pair.spot || ''}
                              onChange={(e) => {
                                const newPairs = [...spot_color_pairs];
                                newPairs[index] = { ...newPairs[index], spot: e.target.value };
                                setSpot_color_pairs(newPairs);
                              }}
                              style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'rgba(255, 255, 255, 0.08)',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                borderRadius: 8,
                                color: '#f8f8f8',
                                fontSize: 14
                              }}
                            >
                              <option value="" style={{ background: '#1f2937' }}>Select...</option>
                              {getSpotLayersForSide('back')
                                .filter(layer => !spot_color_pairs.some((p, i) => i !== index && p.spot === layer))
                                .map(layer => (
                                  <option key={layer} value={layer} style={{ background: '#1f2937' }}>
                                    {layer}
                                  </option>
                                ))}
                            </select>
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            {index === 0 && (
                              <label style={{
                                display: 'block',
                                fontSize: 12,
                                color: '#9ca3af',
                                marginBottom: 4
                              }}>
                                Color
                              </label>
                            )}
                            <select
                              value={pair.color || ''}
                              onChange={(e) => {
                                if (e.target.value) {
                                  const newPairs = [...spot_color_pairs];
                                  newPairs[index] = { ...newPairs[index], color: e.target.value };
                                  setSpot_color_pairs(newPairs);
                                } else {
                                  const newPairs = [...spot_color_pairs];
                                  newPairs[index] = { ...newPairs[index], color: undefined };
                                  setSpot_color_pairs(newPairs);
                                }
                              }}
                              disabled={!pair.spot}
                              style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'rgba(255, 255, 255, 0.08)',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                borderRadius: 8,
                                color: '#f8f8f8',
                                fontSize: 14,
                                opacity: !pair.spot ? 0.5 : 1
                              }}
                            >
                              <option value="" style={{ background: '#1f2937' }}>Select...</option>
                              {spotGroup?.colors.map((colorLayer: any, idx: number) => (
                                <option key={idx} value={colorLayer.name} style={{ background: '#1f2937' }}>
                                  {colorLayer.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <button
                            onClick={() => {
                              setSpot_color_pairs(prev => prev.filter((_, i) => i !== index));
                            }}
                            style={{
                              width: 32,
                              height: 32,
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.2)',
                              borderRadius: 8,
                              color: '#ef4444',
                              fontSize: 16,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.2s',
                              alignSelf: 'flex-start',
                              marginTop: index === 0 ? 22 : 0
                            }}
                            title={'Remove'}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Foil and Coldfoil Selection */}
          {(currentCardType === 'front' || currentCardType === 'base' || currentCardType === 'back') && (
            <>
              {/* Foil */}
              {(currentCardType === 'back' ? getFoilLayersForSide('back') : getFrontFoilLayers()).length > 0 && (
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#f8f8f8',
                    marginBottom: 8
                  }}>
                    Foil
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      value={currentConfig.foil?.foil_layer || ''}
                      onChange={(e) => {
                        const layerVal = e.target.value;
                        if (!layerVal) {
                          setCurrentConfig(prev => {
                            const { foil, ...rest } = prev;
                            return { ...rest };
                          });
                        } else {
                          setCurrentConfig(prev => ({
                            ...prev,
                            foil: {
                              foil_layer: layerVal,
                              foil_color: prev.foil?.foil_color || 'silver'
                            }
                          }));
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: 8,
                        color: '#f8f8f8',
                        fontSize: 14
                      }}
                    >
                      <option value="" style={{ background: '#1f2937' }}>None</option>
                      {(currentCardType === 'back' ? getFoilLayersForSide('back') : getFrontFoilLayers()).map(foilLayer => (
                        <option key={foilLayer} value={foilLayer} style={{ background: '#1f2937' }}>
                          {foilLayer}
                        </option>
                      ))}
                    </select>
                    <select
                      value={currentConfig.foil?.foil_color || 'silver'}
                      onChange={(e) => {
                        const colorVal = e.target.value as 'silver' | 'gold';
                        setCurrentConfig(prev => {
                          if (!prev.foil?.foil_layer) return prev; // ignore when layer not selected
                          return {
                            ...prev,
                            foil: {
                              foil_layer: prev.foil.foil_layer,
                              foil_color: colorVal
                            }
                          };
                        });
                      }}
                      disabled={!currentConfig.foil?.foil_layer}
                      style={{
                        width: 140,
                        padding: '8px 12px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: 8,
                        color: '#f8f8f8',
                        fontSize: 14,
                        opacity: currentConfig.foil?.foil_layer ? 1 : 0.5
                      }}
                    >
                      <option value="silver" style={{ background: '#1f2937' }}>Silver</option>
                      <option value="gold" style={{ background: '#1f2937' }}>Gold</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Coldfoil */}
              {currentCardType !== 'back' && getColdfoilLayers().length > 0 && (
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#f8f8f8',
                    marginBottom: 8
                  }}>
                    Coldfoil
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      value={currentConfig.coldfoil?.coldfoil_layer || ''}
                      onChange={(e) => {
                        const layerVal = e.target.value;
                        if (!layerVal) {
                          setCurrentConfig(prev => {
                            const { coldfoil, ...rest } = prev;
                            return { ...rest };
                          });
                        } else {
                          setCurrentConfig(prev => ({
                            ...prev,
                            coldfoil: {
                              coldfoil_layer: layerVal,
                              coldfoil_color: prev.coldfoil?.coldfoil_color || 'silver'
                            }
                          }));
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: 8,
                        color: '#f8f8f8',
                        fontSize: 14
                      }}
                    >
                      <option value="" style={{ background: '#1f2937' }}>None</option>
                      {getColdfoilLayers().map(cfLayer => (
                        <option key={cfLayer} value={cfLayer} style={{ background: '#1f2937' }}>
                          {cfLayer}
                        </option>
                      ))}
                    </select>
                    <select
                      value={currentConfig.coldfoil?.coldfoil_color || 'silver'}
                      onChange={(e) => {
                        const colorVal = e.target.value as 'silver' | 'gold';
                        setCurrentConfig(prev => {
                          if (!prev.coldfoil?.coldfoil_layer) return prev; // ignore when layer not selected
                          return {
                            ...prev,
                            coldfoil: {
                              coldfoil_layer: prev.coldfoil.coldfoil_layer,
                              coldfoil_color: colorVal
                            }
                          };
                        });
                      }}
                      disabled={!currentConfig.coldfoil?.coldfoil_layer}
                      style={{
                        width: 140,
                        padding: '8px 12px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: 8,
                        color: '#f8f8f8',
                        fontSize: 14,
                        opacity: currentConfig.coldfoil?.coldfoil_layer ? 1 : 0.5
                      }}
                    >
                      <option value="silver" style={{ background: '#1f2937' }}>Silver</option>
                      <option value="gold" style={{ background: '#1f2937' }}>Gold</option>
                    </select>
                  </div>
                </div>
              )}
            </>
          )}

          {/* VFX Texture Selection */}
          {(currentCardType === 'front' || currentCardType === 'base') && (isToppsNow || getWpLayers().length > 0) && (
            <div>
              <label style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 600,
                color: '#f8f8f8',
                marginBottom: 8
              }}>
                Select VFX Texture
              {!isToppsNow && getWpLayers().length === 1 && (
                  <span style={{
                    fontSize: 12,
                    color: '#9ca3af',
                    fontWeight: 400,
                    marginLeft: 8
                  }}>
                    - using {getWpLayers()[0]}
                  </span>
                )}
              </label>
              <select
                value={currentConfig.vfx || ''}
                onChange={(e) => setCurrentConfig(prev => ({ ...prev, vfx: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 8,
                  color: '#f8f8f8',
                  fontSize: 14
                }}
              >
                <option value="" style={{ background: '#1f2937' }}>Select VFX texture...</option>
                {getVfxTextures().map((texture: string) => (
                  <option key={texture} value={texture} style={{ background: '#1f2937' }}>
                    {texture}
                  </option>
                ))}
              </select>

              {/* WP Layer Selection for VFX - Only show when VFX is enabled and there are multiple wp layers */}
              {!isToppsNow && currentConfig.vfx && getWpLayers().length > 1 && (
                <div style={{ marginTop: 12 }}>
                  <label style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#f8f8f8',
                    marginBottom: 8
                  }}>
                    Select WP Layer (for VFX)
                  </label>
                  <select
                    value={currentConfig.wp || ''}
                    onChange={(e) => setCurrentConfig(prev => ({ ...prev, wp: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: 8,
                      color: '#f8f8f8',
                      fontSize: 14
                    }}
                  >
                    <option value="" style={{ background: '#1f2937' }}>Select WP layer...</option>
                    {getWpLayers().map(wpLayer => (
                      <option key={wpLayer} value={wpLayer} style={{ background: '#1f2937' }}>
                        {wpLayer}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Chrome Effect - Dropdown for front/base */}
          {(currentCardType === 'front' || currentCardType === 'base') && getWpInvLayers().length > 0 && (
            <div>
              {(currentCardType === 'base' || currentCardType === 'front') ? (
                // Dropdown for base/front card types
                <>
                  <label style={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#f8f8f8',
                    marginBottom: 8
                  }}>
                    Chrome Effect
                    {getWpInvLayers().length === 1 && (
                      <span style={{ 
                        fontSize: 12, 
                        color: '#9ca3af', 
                        fontWeight: 400,
                        marginLeft: 8 
                      }}>
                        - using {getWpInvLayers()[0]}
                      </span>
                    )}
                  </label>
                  <select
                    value={typeof currentConfig.chrome === 'string' ? currentConfig.chrome : ''}
                    onChange={(e) => {
                      const newChrome = e.target.value || false;
                      setCurrentConfig(prev => ({ 
                        ...prev, 
                        chrome: newChrome
                      }));
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: 8,
                      color: '#f8f8f8',
                      fontSize: 14
                    }}
                  >
                    <option value="" style={{ background: '#1f2937' }}>None</option>
                    <option value="silver" style={{ background: '#1f2937' }}>Silver</option>
                    <option value="superfractor" style={{ background: '#1f2937' }}>Superfractor</option>
                  </select>

                  {/* WP_INV Layer Selection for Chrome - Only show when chrome/foilfractor is enabled and multiple wp_inv layers */}
                  {!isToppsNow && (currentConfig.chrome || currentConfig.foilfractor) && getWpInvLayers().length > 1 && (
                    <div style={{ marginTop: 12 }}>
                      <label style={{
                        display: 'block',
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#f8f8f8',
                        marginBottom: 8
                      }}>
                        Select WP_INV Layer (for Chrome)
                      </label>
                      <select
                        value={currentConfig.wp_inv_layer || ''}
                        onChange={(e) => setCurrentConfig(prev => ({ ...prev, wp_inv_layer: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          borderRadius: 8,
                          color: '#f8f8f8',
                          fontSize: 14
                        }}
                      >
                        <option value="" style={{ background: '#1f2937' }}>Select wp_inv layer...</option>
                        {getWpInvLayers().map(wpInvLayer => (
                          <option key={wpInvLayer} value={wpInvLayer} style={{ background: '#1f2937' }}>
                            {wpInvLayer}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}

          {/* Asset Name Input */}
          {currentCardType && (
            <div>
              <label style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 600,
                color: '#f8f8f8',
                marginBottom: 8
              }}>
                Asset Name
              </label>
              <input
                type="text"
                value={currentConfig.name || ''}
                onChange={(e) => setCurrentConfig(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter asset name..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 8,
                  color: '#f8f8f8',
                  fontSize: 14,
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(59, 130, 246, 0.5)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                }}
              />
            </div>
          )}

          {/* Foilfractor Checkbox */}
          {currentCardType && (
            <div style={{ marginTop: 12 }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                fontWeight: 600,
                color: '#f8f8f8',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={!!currentConfig.foilfractor}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setCurrentConfig(prev => {
                      if (checked) {
                        return { ...prev, foilfractor: true };
                      } else {
                        const { foilfractor, ...rest } = prev as any;
                        return { ...rest };
                      }
                    });
                  }}
                  style={{ width: 16, height: 16 }}
                />
                Foilfractor
              </label>
            </div>
          )}

          {/* Seq 1/1 Checkbox */}
          {currentCardType && (
            <div style={{ marginTop: 10 }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                fontWeight: 600,
                color: '#f8f8f8',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={(currentConfig as any).seq === '1/1'}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setCurrentConfig(prev => {
                      if (checked) {
                        return { ...prev, seq: '1/1' } as any;
                      } else {
                        const { seq, ...rest } = prev as any;
                        return { ...rest };
                      }
                    });
                  }}
                  style={{ width: 16, height: 16 }}
                />
                1/1
              </label>
            </div>
          )}

          {/* Add Asset Button */}
          <div>
            {(() => {
              // Validation logic for different card types
              let canAdd = false;
              let validationMessage = '';

              // For front type, determine what it will become
              const actualType: string = currentCardType === 'front' 
                ? determineActualAssetType(currentCardType, currentConfig, spot_color_pairs)
                : currentCardType || '';

              // Use actualType for validation (handles front -> base/parallel/multi-parallel conversion)
              const typeToValidate = currentCardType === 'front' ? actualType : currentCardType;

              console.log('🔍 Validation check:', { 
                currentCardType, 
                actualType,
                typeToValidate,
                currentConfigName: currentConfig.name, 
                currentConfigLayer: currentConfig.layer,
                currentConfigWpInvLayer: currentConfig.wp_inv_layer,
                currentConfigVfx: currentConfig.vfx,
                currentConfigChrome: currentConfig.chrome,
                spot_color_pairs: spot_color_pairs,
                validSpotPairs: spot_color_pairs.filter(pair => pair.spot && pair.color),
                wpInvLayersLength: getWpInvLayers().length,
                hasSuperfractor: currentConfig.chrome === 'superfractor'
              });

              if (!currentCardType) {
                validationMessage = 'Select card type';
              } else if (!currentConfig.name?.trim()) {
                validationMessage = 'Enter asset name';
              } else {
                switch (typeToValidate) {
                  case 'wp':
                  case 'back':
                    if (!currentConfig.layer) {
                      validationMessage = 'Select layer';
                    } else {
                      canAdd = true;
                    }
                    break;
                  case 'base':
                  case 'wp-1of1':
                    if (!currentConfig.layer) {
                      validationMessage = currentCardType === 'front' ? 'Select base layer' : 'Select layer';
                  } else if (!isToppsNow && (currentConfig.vfx || currentConfig.chrome || currentConfig.foilfractor) && getWpInvLayers().length > 1 && !currentConfig.wp_inv_layer) {
                      // Only require wp_inv layer selection if VFX/chrome is enabled and there are multiple layers
                      validationMessage = 'Select wp_inv layer';
                    } else {
                      canAdd = true; // Base layer is required, spot colors are optional
                    }
                    break;
                  case 'parallel':
                  case 'multi-parallel':
                    if (!currentConfig.layer) {
                      validationMessage = currentCardType === 'front' ? 'Select base layer' : 'Select layer';
                    } else {
                      const validPairs = spot_color_pairs.filter(pair => pair.spot && pair.color);
                      console.log('🔍 Parallel validation:', { 
                        spot_color_pairs, 
                        validPairs, 
                        validPairsLength: validPairs.length,
                        wpInvLayersLength: getWpInvLayers().length,
                        currentConfigLayer: currentConfig.layer,
                        currentCardType,
                        actualType 
                      });
                      
                      // For front cards, spot colors are optional (they determine type)
                      // For original parallel/multi-parallel cards, always require spot colors
                      if (validPairs.length === 0 && currentCardType !== 'front') {
                        validationMessage = 'Select at least one spot layer and color';
                      } else if (!isToppsNow && (currentConfig.vfx || currentConfig.chrome || currentConfig.foilfractor) && getWpInvLayers().length > 1 && !currentConfig.wp_inv_layer) {
                        // Only require wp_inv layer selection if VFX/chrome is enabled and there are multiple layers
                        validationMessage = 'Select wp_inv layer';
                      } else {
                        canAdd = true; // Have at least one valid spot/color pair
                      }
                    }
                    break;
                  case 'front':
                    // This shouldn't happen since we convert front to actual type above
                    if (!currentConfig.layer) {
                      validationMessage = 'Select base layer';
                    } else {
                      canAdd = true;
                    }
                    break;
                }
              }

              console.log('🔍 Validation result:', { canAdd, validationMessage });

              return (
                <>
                  <button
                    onClick={handleAddAsset}
                    disabled={!canAdd || savingAsset}
                    style={{
                      padding: '14px 28px',
                      background: (!canAdd || savingAsset) ? 'rgba(156, 163, 175, 0.3)' : 'linear-gradient(135deg, #10b981, #059669)',
                      border: 'none',
                      borderRadius: 12,
                      color: 'white',
                      fontSize: 16,
                      fontWeight: 600,
                      cursor: (!canAdd || savingAsset) ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      opacity: (!canAdd || savingAsset) ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    {savingAsset && (
                      <div style={{
                        width: 14,
                        height: 14,
                        border: '2px solid rgba(255, 255, 255, 0.3)',
                        borderTop: '2px solid white',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                      }} />
                    )}
                    {savingAsset ? 'Saving...' : (editingAssetId ? 'Update Asset' : 'Add Asset')}
                  </button>
                  {editingAssetId && (
                    <button
                      onClick={() => {
                        onResetConfig(); // Reset the form state
                        onClose(); // Close the modal
                      }}
                      style={{
                        padding: '12px 24px',
                        background: 'rgba(156, 163, 175, 0.3)',
                        border: 'none',
                        borderRadius: 12,
                        color: 'white',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                        marginLeft: 8
                      }}
                    >
                      Cancel
                    </button>
                  )}
                  {validationMessage && (
                    <div style={{
                      fontSize: 12,
                      color: '#9ca3af',
                      marginTop: 8
                    }}>
                      {validationMessage}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  // Render modal at document body level using portal
  return typeof document !== 'undefined' 
    ? createPortal(modalElement, document.body)
    : null;
};
