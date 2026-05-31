import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import App from "./App.jsx";
import "./styles.css";

const routerBaseName = Capacitor.isNativePlatform() ? "/" : import.meta.env.BASE_URL;

if (Capacitor.isNativePlatform()) {
  document.documentElement.dataset.nativePlatform = Capacitor.getPlatform();
}

function routeNativeLink(url) {
  try {
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname.replace(/^\/vault\/?/, "/");
    const routePath = path === "" ? "/" : path;
    window.history.pushState({}, "", `${routePath}${parsedUrl.search}${parsedUrl.hash}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  } catch (error) {
    console.warn("Unable to route native app link", error);
  }
}

if (Capacitor.isNativePlatform()) {
  CapacitorApp.addListener("appUrlOpen", ({ url }) => routeNativeLink(url));
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBaseName}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
