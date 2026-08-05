import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/fredoka/wght.css";
import "@fontsource-variable/lexend/wght.css";
import "@fontsource-variable/source-sans-3/wght.css";
import { App } from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { TooltipProvider } from "./components/StudyUI";
import "./styles.css";
// After styles.css so motion can layer on top of the base rules.
import "./motion.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("The application root element was not found.");
}

createRoot(root).render(
  <React.StrictMode>
    <TooltipProvider>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </TooltipProvider>
  </React.StrictMode>,
);
