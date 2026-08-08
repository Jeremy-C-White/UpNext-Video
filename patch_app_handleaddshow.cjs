const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const target = `  const toggleWatched = async (showId: string, tvmazeId: number, epId: string, watched: boolean) => {`;
const replacement = `  const handleAddShow = async (show: Show, caughtUp: boolean = false) => {
    if (!user) return false;
    setAddingShowId(show.id);
    setAppError(null);
    try {
      await addShowToLibrary(show, caughtUp);
      setAddingShowId(null);
      return true;
    } catch (err: any) {
      console.error("Failed to add show:", err);
      setAppError(err.message || "Failed to add show. Please try again.");
      setAddingShowId(null);
      return false;
    }
  };

  const toggleWatched = async (showId: string, tvmazeId: number, epId: string, watched: boolean) => {`;

code = code.replace(target, replacement);
fs.writeFileSync('src/App.tsx', code);
