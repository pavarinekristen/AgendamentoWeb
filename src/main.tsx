import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Fontes auto-hospedadas (variaveis = 1 arquivo cada, todos os pesos; servidas
// da propria origem para respeitar a CSP default-src 'self' e funcionar offline).
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/inter";
import "./index.css";
import App from "./App";
import { ToastProvider } from "./components/Toast";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
