import { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import css from "./Logout.module.css";

export function Logout() {
  const [error, setError] = useState("");

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch {
      setError("Sign out failed. Please try again.");
    }
  };

  return (
    <div>
      <button onClick={handleSignOut} className={css.button}>
        Sign out
      </button>
      {error && <p className={css.error}>{error}</p>}
    </div>
  );
}
