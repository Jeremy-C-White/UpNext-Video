const fs = require('fs');
let code = fs.readFileSync('src/lib/debrid.ts', 'utf8');

let isMovieMismatchOld = `  // TV show patterns in a movie request indicate misindexed stream
  if (
    /\\b[sS]\\d{1,2}[\\s._-]*[eE]\\d{1,3}\\b/i.test(text) ||
    /\\b\\d{1,2}[xX]\\d{1,3}\\b/i.test(text)
  ) {`;

let isMovieMismatchNew = `  // TV show patterns in a movie request indicate misindexed stream
  if (
    /\\b[sS]\\d{1,2}[\\s._-]*[eE]\\d{1,3}\\b/i.test(text) ||
    /\\b\\d{1,2}[xX]\\d{1,3}\\b/i.test(text) ||
    /(?:720p|1080p|480p|1440p|2160p)_(\\d{1,2}\\d{2})_/i.test(text)
  ) {`;
  
code = code.replace(isMovieMismatchOld, isMovieMismatchNew);

let calculateStreamScoreOld = `  score -= getTrailerPenalty(stream, type);`;

let calculateStreamScoreNew = `  score -= getTrailerPenalty(stream, type);

  // Penalize dubs and foreign language/spam groups unless the user prefers it
  if (
    /\\b(latino|castellano|spanish|french|german|italian|russian|hindi|tamil|telugu|korean|dubbed|multi|español|ita|rus|ger|fre|truefrench)\\b/i.test(text) ||
    /(newpct|mejortorrent)/i.test(text)
  ) {
    score -= 20_000;
  }`;

code = code.replace(calculateStreamScoreOld, calculateStreamScoreNew);

fs.writeFileSync('src/lib/debrid.ts', code);
