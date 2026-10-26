import type { User } from "@patchsmith/auth";
import type { ReactNode } from "react";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export const themes = ["system", "light", "dark"] as const;

export type AppTheme = (typeof themes)[number];

export const fallbackTheme = "system" satisfies AppTheme;

// Mintlify uses this key for light, dark, and system preferences on /docs.
export const themeStorageKey = "isDarkMode";

export const isAppTheme = <TValue>(value: TValue): value is TValue & AppTheme =>
  value === "system" || value === "light" || value === "dark";

export const getUserTheme = (
  user: User | null | undefined
): AppTheme | undefined => {
  if (!user) {
    return undefined;
  }

  const { theme } = user;

  return isAppTheme(theme) ? theme : undefined;
};

const prefersDark = () =>
  window.matchMedia("(prefers-color-scheme: dark)").matches;

export const resolveTheme = (theme: AppTheme): "light" | "dark" => {
  if (theme === "system") {
    return prefersDark() ? "dark" : "light";
  }

  return theme;
};

export const getStoredTheme = (): AppTheme => {
  if (typeof window === "undefined") {
    return fallbackTheme;
  }

  const storedTheme = localStorage.getItem(themeStorageKey);

  return isAppTheme(storedTheme) ? storedTheme : fallbackTheme;
};

const disableTransitionOnChange = () => {
  const style = document.createElement("style");
  style.append(
    document.createTextNode(
      "*{transition:none!important;animation:none!important}"
    )
  );
  document.head.append(style);

  return () => {
    window.getComputedStyle(document.body);
    requestAnimationFrame(() => {
      style.remove();
    });
  };
};

export const applyTheme = (
  theme: AppTheme,
  options: { disableTransitions?: boolean } = {}
) => {
  if (typeof document === "undefined") {
    return;
  }

  const enableTransitions =
    options.disableTransitions === true
      ? disableTransitionOnChange()
      : undefined;

  const resolvedTheme = resolveTheme(theme);

  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  document.documentElement.style.colorScheme = resolvedTheme;
  enableTransitions?.();
};

export const getCachedThemeScript = () =>
  `(()=>{try{let e=localStorage.getItem("${themeStorageKey}");e="light"===e||"dark"===e||"system"===e?e:"${fallbackTheme}";let t="system"===e?matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light":e,d=document.documentElement;d.classList.toggle("dark","dark"===t);d.style.colorScheme=t}catch(e){}})();`;

interface ThemeContextValue {
  resolvedTheme: "light" | "dark";
  setTheme: (theme: AppTheme) => void;
  theme: AppTheme;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<AppTheme>(fallbackTheme);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  const updateTheme = useCallback((nextTheme: AppTheme) => {
    localStorage.setItem(themeStorageKey, nextTheme);
    setTheme(nextTheme);
    const nextResolvedTheme = resolveTheme(nextTheme);
    setResolvedTheme(nextResolvedTheme);
    applyTheme(nextTheme, { disableTransitions: true });
  }, []);

  useEffect(() => {
    const storedTheme = getStoredTheme();
    // oxlint-disable-next-line react/set-state-in-effect -- Restore the persisted browser theme after hydration to preserve the server-rendered initial state.
    setTheme(storedTheme);
    setResolvedTheme(resolveTheme(storedTheme));
    applyTheme(storedTheme);
  }, []);

  useEffect((): (() => void) | undefined => {
    if (theme !== "system") {
      return undefined;
    }

    const query = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = () => {
      const nextResolvedTheme = resolveTheme("system");
      setResolvedTheme(nextResolvedTheme);
      applyTheme("system", { disableTransitions: true });
    };

    query.addEventListener("change", handleChange);

    return () => {
      query.removeEventListener("change", handleChange);
    };
  }, [theme]);

  const value = useMemo(
    () => ({ resolvedTheme, setTheme: updateTheme, theme }),
    [resolvedTheme, updateTheme, theme]
  );

  return createElement(ThemeContext.Provider, { value }, children);
};

export const useTheme = () => {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
};
