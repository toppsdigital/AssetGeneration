// Hardcoded color mapping for consistent color selection - one entry per RGB value
// Based on source of truth provided by user
export const HARDCODED_COLORS = [
  { name: 'Aqua', rgb: 'R0G255B255' },
  { name: 'Black', rgb: 'R51G51B51' },
  { name: 'Blue', rgb: 'R0G102B204' },
  { name: 'Brown', rgb: 'R102G51B51' },
  { name: 'Gold', rgb: 'R204G153B0' },
  { name: 'Green', rgb: 'R0G204B51' },
  { name: 'Magenta', rgb: 'R255G0B204' },
  { name: 'Orange', rgb: 'R255G102B0' },
  { name: 'Peach', rgb: 'R255G204B204' },
  { name: 'Pink', rgb: 'R255G102B153' }, // Covers Pink/Papradischa per source of truth
  { name: 'Purple', rgb: 'R153G51B255' },
  { name: 'Red', rgb: 'R255G0B0' },
  { name: 'Rose Gold', rgb: 'R255G102B102' },
  { name: 'Silver', rgb: 'R153G153B153' }, // Covers Silver/Refractor per source of truth
  { name: 'Tan', rgb: 'R204G204B153' },
  { name: 'White', rgb: 'R255G255B204' },
  { name: 'Yellow', rgb: 'R255G255B0' }
];

// Helper functions for color conversion
export const getColorRgbByName = (colorName: string): string => {
  const color = HARDCODED_COLORS.find(c => 
    c.name.toLowerCase() === colorName.toLowerCase()
  );
  return color?.rgb || 'R153G153B153'; // Default gray for unknown colors
};

export const getColorNameByRgb = (rgbValue: string): string => {
  const color = HARDCODED_COLORS.find(c => c.rgb === rgbValue);
  return color?.name || 'Unknown';
};

export const getColorHexByRgb = (rgbValue: string): string => {
  // Convert RGB string to hex for display
  const rgbMatch = rgbValue.match(/R(\d+)G(\d+)B(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
    const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
    const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  return '#999999'; // Default gray for unknown colors
};

export const getColorHexByName = (colorName: string): string => {
  const color = HARDCODED_COLORS.find(c => 
    c.name.toLowerCase() === colorName.toLowerCase()
  );
  // Convert RGB to hex for display
  if (color?.rgb) {
    return getColorHexByRgb(color.rgb);
  }
  return '#999999'; // Default gray for unknown colors
};

export const getColorDisplayNameByRgb = (rgbValue: string): string => {
  const color = HARDCODED_COLORS.find(c => c.rgb === rgbValue);
  return color?.name || rgbValue;
};
