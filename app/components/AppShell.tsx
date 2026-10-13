import React from "react";
import { Link, NavLink } from "react-router-dom";
import { LayoutDashboard, ListChecks, FilePlus2, ScrollText, Workflow, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "../helpers/useAuth";
import { ThemeModeSwitch } from "./ThemeModeSwitch";
import { Button } from "./Button";
import styles from "./AppShell.module.css";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/claims", label: "Claims", icon: ListChecks, end: true },
  { to: "/claims/new", label: "New claim", icon: FilePlus2, end: true },
  { to: "/rules", label: "Payer rules", icon: ScrollText, end: true },
  { to: "/how-it-works", label: "How it works", icon: Workflow, end: true },
];

export const AppShell = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  const { authState, logout } = useAuth();
  const user = authState.type === "authenticated" ? authState.user : null;
  return (
    <div className={`${styles.shell} ${className ?? ""}`}>
      <aside className={styles.sidebar}>
        <Link to="/" className={styles.brand}>
          <span className={styles.mark}>S</span>
          <span>
            <span className={styles.brandName}>Saqient</span>
            <span className={styles.brandSub}>Revenue cycle engine</span>
          </span>
        </Link>
        <nav className={styles.nav}>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ""}`}>
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.safety}>
          <ShieldCheck size={15} />
          <span>Demo workspace. Use synthetic or de-identified notes only.</span>
        </div>
        {user && (
          <div className={styles.user}>
            <div className={styles.avatar}>{user.displayName.slice(0, 1).toUpperCase()}</div>
            <div className={styles.userText}>
              <span className={styles.userName}>{user.displayName}</span>
              <span className={styles.userRole}>{user.role === "admin" ? "Admin" : "Coder"}</span>
            </div>
            <Button variant="ghost" size="icon-sm" className={styles.logout} onClick={() => logout()} aria-label="Sign out">
              <LogOut size={15} />
            </Button>
          </div>
        )}
      </aside>
      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topbarSpacer} />
          <ThemeModeSwitch />
        </header>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
};