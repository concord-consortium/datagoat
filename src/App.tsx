import { useState, useEffect } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./firebase";
import { Loading } from "./components/Loading";
import { Login } from "./components/Login";
import { Authed } from "./components/Authed";
import css from "./App.module.css";

const APP_VERSION = "v0.0.2";
const APP_VERSION_DESC = "Wireframed auth";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // onAuthStateChanged fires before updateProfile completes during registration,
  // so the user object arrives without a displayName. This fallback bridges the gap.
  const [registeredDisplayName, setRegisteredDisplayName] = useState("");

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  return (
    <main className={css.app} tabIndex={0}>
      {loading ? <Loading /> : user ? <Authed user={user} registeredDisplayName={registeredDisplayName} /> : <Login onRegistered={setRegisteredDisplayName} />}
      <footer className={css.footer}>{APP_VERSION} - {APP_VERSION_DESC}</footer>
    </main>
  );
}
