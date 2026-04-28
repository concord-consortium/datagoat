import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// NavMenuContext exposes the hamburger-menu open/close state so non-menu
// components can react to it. The dashboard header carousel pauses while
// the menu is open (per requirements "Ambient-animation coordination") -
// without context, AppShell would have to prop-drill this down through
// the route Outlet.
//
// Provider mounts in AppShell. Consumers: HamburgerMenu (calls setIsOpen
// on open/close) and DashboardHeaderSlide (clears its timer when isOpen
// is true; restarts on false).

export interface NavMenuContextValue {
  isOpen: boolean;
  setIsOpen: (next: boolean) => void;
}

const NavMenuContext = createContext<NavMenuContextValue | null>(null);

export function NavMenuProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const value = useMemo(() => ({ isOpen, setIsOpen }), [isOpen]);
  return (
    <NavMenuContext.Provider value={value}>{children}</NavMenuContext.Provider>
  );
}

export function useNavMenu(): NavMenuContextValue {
  const ctx = useContext(NavMenuContext);
  if (!ctx) throw new Error("useNavMenu must be used within NavMenuProvider");
  return ctx;
}
