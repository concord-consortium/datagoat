import type { User } from "firebase/auth";
import { Logout } from "./Logout";
import common from "./common.module.css";
import css from "./Authed.module.css";

interface AuthedProps {
  user: User;
  registeredDisplayName?: string;
}

export function Authed({ user, registeredDisplayName }: AuthedProps) {
  const displayName = user.displayName || registeredDisplayName || user.email;

  return (
    <div className={common.centered}>
      <h1 className={common.title}>DataGOAT</h1>
      <p className={css.displayName}>{displayName}</p>
      {displayName !== user.email && <p className={css.email}>{user.email}</p>}
      <Logout />
    </div>
  );
}
