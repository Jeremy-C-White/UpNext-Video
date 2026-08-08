const fs = require('fs');
let code = fs.readFileSync('src/components/SearchModal.tsx', 'utf8');
code = code.replace(
  "if (s.name.toLowerCase() === show.name.toLowerCase()",
  "if (s.name && show.name && s.name.toLowerCase() === show.name.toLowerCase()"
);
fs.writeFileSync('src/components/SearchModal.tsx', code);
