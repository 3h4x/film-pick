export type MoodKey =
  | "light_funny"
  | "mind_bender"
  | "comfort_rewatch"
  | "date_night"
  | "dark_heavy"
  | "short"
  | "foreign"
  | "feel_good";

export interface MoodPreset {
  label: string;
  icon: string;
  reason: string;
  genreIds?: number[];
  minRating?: number;
  minVotes?: number;
  maxRuntime?: number;
  languages?: string[];
  comfortRewatch?: boolean;
}

export const MOOD_PRESETS: Record<MoodKey, MoodPreset> = {
  light_funny: {
    label: "Light & Funny",
    icon: "😄",
    reason: "Light & funny tonight",
    genreIds: [35, 10751],
    minRating: 6.5,
    minVotes: 200,
  },
  mind_bender: {
    label: "Mind-bender",
    icon: "🤯",
    reason: "Something to mess with your head",
    genreIds: [878, 9648, 53],
    minRating: 7.5,
    minVotes: 300,
  },
  comfort_rewatch: {
    label: "Comfort Rewatch",
    icon: "🛋️",
    reason: "Comfort picks from your library",
    comfortRewatch: true,
  },
  date_night: {
    label: "Date Night",
    icon: "🌹",
    reason: "Perfect for date night",
    genreIds: [10749, 35],
    minRating: 7,
    minVotes: 300,
  },
  dark_heavy: {
    label: "Dark & Heavy",
    icon: "🌑",
    reason: "Dark and intense",
    genreIds: [18, 80, 10752],
    minRating: 7.5,
    minVotes: 500,
  },
  short: {
    label: "Short (<100min)",
    icon: "⚡",
    reason: "Short films under 100 minutes",
    genreIds: [35, 28, 16],
    minRating: 7,
    minVotes: 200,
    maxRuntime: 100,
  },
  foreign: {
    label: "Foreign",
    icon: "🌍",
    reason: "World cinema picks",
    languages: ["fr", "ja", "ko", "es", "it"],
    minRating: 7.5,
    minVotes: 300,
  },
  feel_good: {
    label: "Feel-good",
    icon: "🌟",
    reason: "Movies that leave you smiling",
    genreIds: [16, 10751, 35],
    minRating: 7,
    minVotes: 300,
  },
};

export const MOOD_KEYS = Object.keys(MOOD_PRESETS) as MoodKey[];
