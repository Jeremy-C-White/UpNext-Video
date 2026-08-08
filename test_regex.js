const text = "Supergirl720p_304_NEWPCT.mkv";
console.log(/(?:720p|1080p|480p|1440p|2160p)_(\d{1,2}\d{2})_/i.test(text));
console.log(/NEWPCT/i.test(text));
