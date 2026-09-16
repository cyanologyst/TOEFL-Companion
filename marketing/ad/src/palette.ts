/**
 * The app's own theme roles, copied from src/themes.css in the app, so the ad
 * is drawn in exactly the colours the learner sees.
 */
export interface Palette {
  id: string;
  name: string;
  ground: string;
  groundDeep: string;
  paper: string;
  ink: string;
  line: string;
  shade: string;
  onPop: string;
  lime: string;
  sun: string;
  sky: string;
  mint: string;
  rose: string;
  grape: string;
}

export const INDIGO: Palette = {
  id: "indigo",
  name: "TOEFL Indigo",
  ground: "#eaebfb",
  groundDeep: "#d8daf6",
  paper: "#ffffff",
  ink: "#25265c",
  line: "#343579",
  shade: "#343579",
  onPop: "#25265c",
  lime: "#e6f77e",
  sun: "#d3d4ff",
  sky: "#86defd",
  mint: "#a3e7c3",
  rose: "#ffbcd6",
  grape: "#bdb5ff",
};

export const NIGHT: Palette = {
  id: "night",
  name: "Night",
  ground: "#121331",
  groundDeep: "#1d1f48",
  paper: "#1e2049",
  ink: "#ecebf7",
  line: "#a5a7e8",
  shade: "#4b4d98",
  onPop: "#15163a",
  lime: "#cde37a",
  sun: "#aeb0f0",
  sky: "#72cff4",
  mint: "#84d6ab",
  rose: "#e9a3c3",
  grape: "#a99af2",
};

export const TEAL: Palette = {
  id: "teal",
  name: "Deep Teal",
  ground: "#d9eaec",
  groundDeep: "#c4dde0",
  paper: "#fbfaf4",
  ink: "#103d4b",
  line: "#103d4b",
  shade: "#103d4b",
  onPop: "#103d4b",
  lime: "#ecfb8f",
  sun: "#ffe3a1",
  sky: "#86defd",
  mint: "#a2e3c5",
  rose: "#f6bccb",
  grape: "#c4bbff",
};

export const SUNSHINE: Palette = {
  id: "sunshine",
  name: "Sunshine",
  ground: "#ffe01b",
  groundDeep: "#f5c800",
  paper: "#fffdf3",
  ink: "#12100c",
  line: "#12100c",
  shade: "#12100c",
  onPop: "#12100c",
  lime: "#c6f24e",
  sun: "#ffd93d",
  sky: "#7cc6fe",
  mint: "#7be495",
  rose: "#ff9bd2",
  grape: "#b197fc",
};

export const PAPER: Palette = {
  id: "paper",
  name: "Paper",
  ground: "#f2e9d8",
  groundDeep: "#e5d8c0",
  paper: "#fffaf0",
  ink: "#2b2c66",
  line: "#343579",
  shade: "#343579",
  onPop: "#2b2c66",
  lime: "#e6f28c",
  sun: "#f5d993",
  sky: "#a8dcef",
  mint: "#aedcbe",
  rose: "#f1bfcd",
  grape: "#c7bdf1",
};

export const THEMES: readonly Palette[] = [INDIGO, NIGHT, TEAL, SUNSHINE, PAPER];
