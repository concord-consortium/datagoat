import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

navigator.serviceWorker?.ready.then(async (reg) => {
  const cache = await caches.open("pages");
  if (!(await cache.match(window.location.href))) {
    await cache.add(window.location.href);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      reg.update();
    }
  });
});

const hadController = !!navigator.serviceWorker?.controller;
navigator.serviceWorker?.addEventListener("controllerchange", () => {
  if (hadController) {
    window.location.reload();
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
