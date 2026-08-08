const text = "Supergirl720p_304_NEWPCT.mkv";
console.log(/(?:720p|1080p|480p|1440p|2160p)_(\d{1,2}\d{2})_/i.test(text));
console.log(/(latino|castellano|spanish|french|german|italian|russian|hindi|tamil|telugu|korean|dubbed|multi|español|ita|rus|ger|fre|truefrench)/i.test(text));
console.log(/(newpct|mejortorrent)/i.test(text));
