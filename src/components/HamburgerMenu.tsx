import { NavLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/track/body", label: "My Body" },
  { to: "/track/outcomes", label: "My Sports" },
  { to: "/profile", label: "Profile" },
];

interface HamburgerMenuProps {
  onClose: () => void;
}

export function HamburgerMenu({ onClose }: HamburgerMenuProps) {
  const { logout, isAdmin } = useAuth();

  async function handleLogout() {
    onClose();
    await logout();
  }

  return (
    <ul className="menu bg-base-100 min-h-full w-64 p-4 text-base-content">
      <li className="menu-title text-secondary font-bold text-lg mb-2">
        DataGOAT
      </li>

      {navItems.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            onClick={onClose}
            className={({ isActive }) =>
              isActive ? "active font-bold" : ""
            }
          >
            {item.label}
          </NavLink>
        </li>
      ))}

      {isAdmin && (
        <li>
          <NavLink
            to="/admin"
            onClick={onClose}
            className={({ isActive }) =>
              isActive ? "active font-bold" : ""
            }
          >
            Admin
          </NavLink>
        </li>
      )}

      <div className="divider" />

      <li>
        <button onClick={handleLogout} className="text-error">
          Logout
        </button>
      </li>
    </ul>
  );
}
