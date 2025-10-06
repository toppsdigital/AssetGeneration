import { getAppIcon } from './fileOperations';

// Mapping from canonical app codes to display names (mirrors New Job form selections)
export const APP_DISPLAY_NAME_MAP: Record<string, string> = {
  BASEBALL: 'BUNT',
  BASKETBALL: 'NBA',
  WWE: 'SLAM',
  DISNEY: 'DISNEY',
  STARWARS: 'STARWARS',
  MARVEL: 'MARVEL',
  HUDDLE: 'HUDDLE'
};

export const getAppDisplayNameFromAppName = (appName: string | undefined): string => {
  if (!appName) return 'Unknown App';
  const key = appName.trim().toUpperCase();
  return APP_DISPLAY_NAME_MAP[key] || appName;
};

export const getLabeledAppName = (appName: string | undefined): string => {
  const display = getAppDisplayNameFromAppName(appName);
  return `${getAppIcon(appName)} ${display}`;
};


