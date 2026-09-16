import { continueRender, delayRender, staticFile } from "remotion";

/** The app's two faces, from the same files the app ships. */
export const DISPLAY = '"Archivo Black", "Arial Black", sans-serif';
export const FLAT = '"Space Grotesk", "Segoe UI", sans-serif';

// Hold every frame until both faces are in, so no frame renders in a fallback.
const handle = delayRender("Loading the app's fonts");
const faces = [
  new FontFace("Archivo Black", `url(${staticFile("fonts/archivo-black-latin-400-normal.woff2")})`, {
    weight: "400",
  }),
  new FontFace("Space Grotesk", `url(${staticFile("fonts/space-grotesk-latin-wght-normal.woff2")})`, {
    weight: "300 700",
  }),
];

Promise.all(faces.map((face) => face.load()))
  .then((loaded) => {
    // This TypeScript version leaves FontFaceSet.add out of its DOM types.
    const fontSet = document.fonts as FontFaceSet & { add: (font: FontFace) => void };
    for (const face of loaded) fontSet.add(face);
    continueRender(handle);
  })
  .catch((error: unknown) => {
    throw new Error(`Fonts failed to load: ${String(error)}`);
  });
