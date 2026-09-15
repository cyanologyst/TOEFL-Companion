import React from "react";
import { createRoot } from "react-dom/client";
// Two faces, both of them used. Fredoka, Lexend, and Source Sans went out with
// the old design and were still being downloaded to render nothing.
import "@fontsource/archivo-black/400.css";
import "@fontsource-variable/space-grotesk/wght.css";
import { App } from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { TooltipProvider } from "./components/StudyUI";
import { appearanceRepository, applyTheme } from "./services/appearance";
import "./styles.css";
// Every colour role, per theme. After styles.css, so its roles win over the
// legacy tokens of the same name, and before every rule that reads them.
import "./themes.css";
// Base layer for the brutalist surfaces. Loaded here, before any feature
// stylesheet, so a feature rule always wins over a shared primitive.
import "./brutal.css";
// The rail's folding and its rubber-band spring, layered over brutal.css.
import "./rail.css";
// Anything that scrolls fades at the edges where more content is hidden.
import "./scroll-fade.css";
// After styles.css so motion can layer on top of the base rules.
import "./motion.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("The application root element was not found.");
}

// Before the first paint, so the saved theme never flashes the default one.
applyTheme(appearanceRepository.get().theme);

createRoot(root).render(
  <React.StrictMode>
    <TooltipProvider>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </TooltipProvider>
  </React.StrictMode>,
);
