import { expect, test, describe } from 'vitest';
import { 
  getBrowserCompatibility, 
  isHardRejectTrailer, 
  getTrailerPenalty,
  getStreamCacheState,
  calculateStreamScore,
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

describe('Browser Compatibility & MKV external routing', () => {
  test('x265 HEVC mp4 routes external', () => {
    const stream = { url: "http://test.com/Video.x265.mp4", title: "Video.x265.mp4" };
    expect(getBrowserCompatibility(stream)).toBe("external");
  });

  test('DTS audio mp4 routes external', () => {
    const stream = { url: "http://test.com/Video.DTS.mp4", title: "Video.DTS.mp4" };
    expect(getBrowserCompatibility(stream)).toBe("external");
  });

  test('mkv routes external', () => {
    const stream = { url: "http://test.com/Video.mkv", title: "Video.mkv" };
    expect(getBrowserCompatibility(stream)).toBe("external");
  });

  test('standard mp4 is compatible', () => {
    const stream = { url: "http://test.com/Video.mp4", title: "Video.mp4" };
    expect(getBrowserCompatibility(stream)).toBe("compatible");
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

