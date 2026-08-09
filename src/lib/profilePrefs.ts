export const PROFILE_PREFS_KEY = 'lurz_profile_prefs_v1';
export const PROFILE_PREFS_EVENT = 'lurz-profile-prefs';

export type ProfileLocalPrefs = {
  emailSignals: boolean;
  compactHeader: boolean;
};

export const DEFAULT_PROFILE_PREFS: ProfileLocalPrefs = {
  emailSignals: true,
  compactHeader: false,
};

export function loadProfilePrefs(): ProfileLocalPrefs {
  try {
    const raw = localStorage.getItem(PROFILE_PREFS_KEY);
    if (!raw) return DEFAULT_PROFILE_PREFS;
    return { ...DEFAULT_PROFILE_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PROFILE_PREFS;
  }
}

export function saveProfilePrefs(prefs: ProfileLocalPrefs) {
  try {
    localStorage.setItem(PROFILE_PREFS_KEY, JSON.stringify(prefs));
    window.dispatchEvent(new Event(PROFILE_PREFS_EVENT));
  } catch {
    // ignore
  }
}
