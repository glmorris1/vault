export function Card({ children, className = "", as: Component = "div", ...props }) {
  return (
    <Component
      className={`rounded-[1.75rem] border border-white/80 bg-white/90 p-5 shadow-soft backdrop-blur ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
}
