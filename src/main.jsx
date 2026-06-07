import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import App from "./App.jsx";
import "./styles.css";

const routerBaseName = Capacitor.isNativePlatform() ? "/" : import.meta.env.BASE_URL;

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBaseName}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
