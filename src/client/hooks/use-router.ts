import { useState, useEffect, useCallback } from "preact/hooks";

function readHashPath(): string {
  const hash = window.location.hash;
  if (!hash || hash === "#" || hash === "#/") return "/";
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return "/";
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return path || "/";
}

export function useRouter() {
  const [path, setPath] = useState(readHashPath);

  const navigate = useCallback((to: string) => {
    const target = to.startsWith("/") ? to : `/${to}`;
    const nextHash = target === "/" ? "#/" : `#${target}`;
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
    setPath(target);
  }, []);

  useEffect(() => {
    const handler = () => setPath(readHashPath());
    window.addEventListener("hashchange", handler);
    window.addEventListener("popstate", handler);
    return () => {
      window.removeEventListener("hashchange", handler);
      window.removeEventListener("popstate", handler);
    };
  }, []);

  // Parse /design/:id
  const match = path.match(/^\/design\/([^/]+)$/);
  const designId = match ? match[1] : null;

  return { path, navigate, designId };
}
