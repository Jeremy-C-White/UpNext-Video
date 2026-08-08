const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const target = `  if (loading) {`;
const replacement = `  const fetchDiscover = async () => {
    if (discoverFetchedRef.current || discoverRequestRef.current) return;
    
    setIsDiscoverLoading(true);
    setDiscoverError(null);
    
    try {
      const p = (async () => {
        const [
          trending,
          movies,
          premiering,
          gems,
          forYouData,
          networksData
        ] = await Promise.all([
          getTrendingTMDB(),
          getTrendingMoviesTMDB(),
          getPremieringSoon(),
          getHiddenGemsTMDB(),
          getForYouTMDB(),
          Promise.all(STREAMING_NETWORKS.map(async n => {
            const shows = await getTopShowsByNetwork(n.id);
            return { id: n.id, shows };
          }))
        ]);
        
        setTrendingShows(trending);
        setTrendingMovies(movies);
        setPremieringSoon(premiering);
        setHiddenGems(gems);
        setForYou(forYouData);
        
        const networksMap: Record<number, Show[]> = {};
        for (const n of networksData) {
          networksMap[n.id] = n.shows;
        }
        setNetworkShows(networksMap);
        discoverFetchedRef.current = true;
      })();
      
      discoverRequestRef.current = p;
      await p;
    } catch (err: any) {
      console.error("Failed to fetch discover data:", err);
      setDiscoverError(err.message || "Failed to load discover content");
    } finally {
      setIsDiscoverLoading(false);
      discoverRequestRef.current = null;
    }
  };

  useEffect(() => {
    if (activeTab === "discover") {
      fetchDiscover();
    }
  }, [activeTab]);

  if (loading) {`;

code = code.replace(target, replacement);
fs.writeFileSync('src/App.tsx', code);
