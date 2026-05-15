import { Children, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AI_FREE_USE_LIMIT, AI_USAGE_STORAGE_KEY } from "../services/firebase.js";

export function Button({ children, className = "", variant = "primary", onClick, ...props }) {
  const navigate = useNavigate();
  const [aiUses, setAiUses] = useState(() => Number(window.localStorage.getItem(AI_USAGE_STORAGE_KEY) || 0));
  const variants = {
    primary: "bg-vault-ink text-white shadow-soft",
    secondary: "bg-white text-vault-ink border border-rose-100 shadow-sm",
    soft: "bg-pink-100 text-vault-ink",
    danger: "bg-red-50 text-red-700 border border-red-100",
    pin: "bg-vault-blue text-white shadow-lg shadow-blue-200/60",
  };
  const isAiUseButton = useMemo(() => buttonText(children).includes("Use AI"), [children]);
  const aiLimitReached = isAiUseButton && aiUses >= AI_FREE_USE_LIMIT;

  useEffect(() => {
    function refreshAIUses(event) {
      setAiUses(Number(event.detail?.uses ?? window.localStorage.getItem(AI_USAGE_STORAGE_KEY) ?? 0));
    }

    function refreshFromStorage(event) {
      if (event.key === AI_USAGE_STORAGE_KEY) {
        setAiUses(Number(event.newValue || 0));
      }
    }

    window.addEventListener("vault-ai-usage-changed", refreshAIUses);
    window.addEventListener("storage", refreshFromStorage);
    return () => {
      window.removeEventListener("vault-ai-usage-changed", refreshAIUses);
      window.removeEventListener("storage", refreshFromStorage);
    };
  }, []);

  function handleClick(event) {
    if (aiLimitReached) {
      event.preventDefault();
      navigate("/upgrade");
      return;
    }
    onClick?.(event);
  }

  return (
    <button
      className={`tap-highlight inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      onClick={handleClick}
      {...props}
    >
      {aiLimitReached ? replaceAIButtonText(children) : children}
    </button>
  );
}

function buttonText(children) {
  return Children.toArray(children)
    .map((child) => (typeof child === "string" ? child : ""))
    .join(" ");
}

function replaceAIButtonText(children) {
  return Children.map(children, (child) => (typeof child === "string" && child.includes("Use AI") ? "Upgrade to keep using AI" : child));
}
