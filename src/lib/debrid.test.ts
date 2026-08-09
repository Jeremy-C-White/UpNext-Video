import { expect, test, describe } from 'vitest';
import { 
  getBrowserCompatibility, 
  getStreamMediaMetadata,
  isHardRejectTrailer, 
  getTrailerPenalty,
  getStreamCacheState,
  calculateStreamScore,
  getStreamAudioLanguage,
  StreamOption
} from './debrid';

const MOVIE = 'movie';

describe('Real-Debrid Cache State', () => {
  test('[RD+] cached classification', () => {
    const stream = { name: "[RD+] Torrentio", title: "Video" };
    expect(getStreamCacheState(stream)).toBe("cached");
  });

  test('[RD download] uncached classification', () => {
    const stream = { name: "[RD download] Torrentio", title: "Video" };
    expect(getStreamCacheState(stream)).toBe("uncached");
  });

  test('Unknown cache state', () => {
    const stream = { name: "[XYZ] Torrentio", title: "Video" };
    expect(getStreamCacheState(stream)).toBe("unknown");
  });
});

describe('English audio preference', () => {
  test('recognizes explicit English and multilingual releases', () => {
    expect(getStreamAudioLanguage({ title: 'Show.S01E01.English.1080p.mkv' })).toBe('english');
    expect(getStreamAudioLanguage({ title: 'Show.S01E01.MULTI.Audio.1080p.mkv' })).toBe('multi');
  });

  test('recognizes clearly foreign-only releases', () => {
    expect(getStreamAudioLanguage({ title: 'Show.S01E01.Japanese.Audio.1080p.mkv' })).toBe('non-english');
    expect(getStreamAudioLanguage({ title: 'Show.S01E01.Japanese.English.Subs.1080p.mkv' })).toBe('non-english');
  });

  test('does not mistake a language word in a show title for audio metadata', () => {
    expect(getStreamAudioLanguage({ title: 'The.Spanish.Princess.S01E01.1080p.mkv' })).toBe('unknown');
  });

  test('strongly prefers an English source over an otherwise equal foreign source', () => {
    const english = calculateStreamScore({ title: 'Show.S01E01.English.1080p.mkv' }, 0, 2, false, 'series', 1, 1);
    const spanish = calculateStreamScore({ title: 'Show.S01E01.Spanish.Audio.1080p.mkv' }, 0, 2, false, 'series', 1, 1);
    expect(english).toBeGreaterThan(spanish);
  });
});

describe('Browser compatibility metadata', () => {
  test('x265 HEVC mp4 is deferred to a runtime capability check', () => {
    const stream = { url: "http://test.com/Video.x265.mp4", title: "Video.x265.mp4" };
    expect(getBrowserCompatibility(stream)).toBe("unknown");
  });

  test('DTS audio mp4 is deferred to a runtime capability check', () => {
    const stream = { url: "http://test.com/Video.DTS.mp4", title: "Video.DTS.mp4" };
    expect(getBrowserCompatibility(stream)).toBe("unknown");
  });

  test('mkv is exposed for adaptive desktop probing', () => {
    const stream = { url: "http://test.com/Video.mkv", title: "Video.mkv" };
    expect(getBrowserCompatibility(stream)).toBe("unknown");
    expect(getStreamMediaMetadata(stream).container).toBe("mkv");
  });

  test('standard mp4 is compatible', () => {
    const stream = { url: "http://test.com/Video.mp4", title: "Video.mp4" };
    expect(getBrowserCompatibility(stream)).toBe("compatible");
  });

  test('custom provider headers remain external-only', () => {
    const stream = {
      url: "https://test.com/video.mp4",
      behaviorHints: { proxyHeaders: { request: { Authorization: "secret" } } },
    };
    expect(getBrowserCompatibility(stream)).toBe("external");
  });

  test('extracts provider codec metadata for adaptive playback', () => {
    const stream = {
      url: "https://test.com/video",
      title: "Movie.2160p.HEVC.TrueHD.mkv",
      streamData: {
        parsedFile: { container: "mkv", encode: "hevc", audio: ["truehd"] },
      },
    };
    expect(getStreamMediaMetadata(stream)).toEqual({
      container: "mkv",
      videoCodec: "hevc",
      audioCodec: "truehd",
    });
  });
});

describe('Trailer tests', () => {
  const trailerStream1: StreamOption = {
    title: "Movie.2023.1080p.Official.Trailer.mp4"
  };

  const trailerStream2: StreamOption = {
    title: "Cyrillic.Movie.трейлер.mp4"
  };

  test('isHardRejectTrailer identifies english trailer', () => {
    expect(isHardRejectTrailer(trailerStream1, MOVIE)).toBe(true);
  });

  test('isHardRejectTrailer identifies russian cyrillic trailer', () => {
    expect(isHardRejectTrailer(trailerStream2, MOVIE)).toBe(true);
  });

  test('getTrailerPenalty applies massive penalty to trap', () => {
    expect(getTrailerPenalty(trailerStream1, MOVIE)).toBeGreaterThan(10000);
  });

  test('Non-trailer controls are unaffected', () => {
    const safeStream = { title: "Normal.Movie.1080p.mp4" };
    expect(isHardRejectTrailer(safeStream, MOVIE)).toBe(false);
    expect(getTrailerPenalty(safeStream, MOVIE)).toBe(0);
  });
});
