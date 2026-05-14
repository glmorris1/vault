export function Button({ children, className = "", variant = "primary", ...props }) {
  const variants = {
    primary: "bg-vault-ink text-white shadow-soft",
    secondary: "bg-white text-vault-ink border border-rose-100 shadow-sm",
    soft: "bg-pink-100 text-vault-ink",
    danger: "bg-red-50 text-red-700 border border-red-100",
    pin: "bg-vault-blue text-white shadow-lg shadow-blue-200/60",
  };

  return (
    <button
      className={`tap-highlight inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
