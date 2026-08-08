const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const target = `    });
  };`;

const replacement = `    });
  };

  useEffect(() => {
    if (user) {
      const unsubscribe = fetchLibrary();
      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, [user]);`;

code = code.replace(target, replacement);
fs.writeFileSync('src/App.tsx', code);
