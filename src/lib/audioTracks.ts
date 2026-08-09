export interface AudioTrackDescriptor {
  language?: string;
  label?: string;
  kind?: string;
}

const ENGLISH_LABEL = /\b(?:english|eng)\b/i;
const NON_ENGLISH_LABEL = /\b(?:spanish|espa(?:ñ|n)ol|french|fran(?:ç|c)ais|german|deutsch|italian|portuguese|russian|japanese|korean|chinese|mandarin|cantonese|hindi|tamil|telugu|arabic|turkish|polish|dutch|ukrainian|czech|thai|vietnamese|indonesian)\b/i;

function normalizedLanguage(value?: string): string {
  return (value || "").trim().toLowerCase().replace(/_/g, "-");
}

export function isEnglishAudioTrack(track: AudioTrackDescriptor): boolean {
  const language = normalizedLanguage(track.language);
  return language === "en" || language === "eng" || language.startsWith("en-") ||
    ENGLISH_LABEL.test(`${track.label || ""} ${track.language || ""}`);
}

export function findEnglishAudioTrackIndex(tracks: AudioTrackDescriptor[]): number {
  let bestIndex = -1;
  let bestScore = Number.NEGATIVE_INFINITY;

  tracks.forEach((track, index) => {
    if (!isEnglishAudioTrack(track)) return;
    const text = `${track.label || ""} ${track.kind || ""}`;
    let score = 10;
    if (/\b(?:main|default|original)\b/i.test(text)) score += 4;
    if (/\b(?:description|descriptive|visually impaired|commentary)\b/i.test(text)) score -= 8;
    if (/\b(?:eac3|e-ac-3|ac3|ac-3|aac|he-aac|heaac|dolby digital(?: plus)?)\b/i.test(text)) score += 6;
    if (/\b(?:truehd|dts(?:-hd)?|flac)\b/i.test(text)) score -= 12;
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });

  return bestIndex;
}

export function hasOnlyKnownNonEnglishTracks(tracks: AudioTrackDescriptor[]): boolean {
  if (tracks.length === 0 || tracks.some(isEnglishAudioTrack)) return false;

  return tracks.every(track => {
    const language = normalizedLanguage(track.language);
    if (language && language !== "und" && language !== "mul" && language !== "zxx") return true;
    return NON_ENGLISH_LABEL.test(track.label || "");
  });
}
