import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Helmet } from "react-helmet";
import { ShieldCheck, FileSearch, Gauge } from "lucide-react";
import { PasswordLoginForm } from "../components/PasswordLoginForm";
import { PasswordRegisterForm } from "../components/PasswordRegisterForm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/Tabs";
import { useAuth } from "../helpers/useAuth";
import styles from "./login.module.css";

export default function LoginPage() {
  const { authState } = useAuth();
  const [tab, setTab] = useState("signin");
  if (authState.type === "authenticated") return <Navigate to="/" replace />;
  return (
    <div className={styles.page}>
      <Helmet>
        <title>Sign in · Saqient</title>
      </Helmet>
      <section className={styles.story}>
        <div className={styles.brand}>
          <span className={styles.mark}>S</span> Saqient
        </div>
        <h1 className={styles.headline}>Clean claims before they leave the building.</h1>
        <p className={styles.lede}>
          Saqient reads the physician note, codes it, checks payer rules and predicts denials for DHA, DoH and NPHIES
          claims. Every suggestion comes with its evidence, and a coder approves every claim.
        </p>
        <ul className={styles.points}>
          <li>
            <FileSearch size={18} /> Codes linked to the exact sentence in the note
          </li>
          <li>
            <Gauge size={18} /> Denial risk and fixes before submission
          </li>
          <li>
            <ShieldCheck size={18} /> Identifiers removed before any AI sees the note
          </li>
        </ul>
      </section>
      <section className={styles.formSide}>
        <div className={styles.card}>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className={styles.tabs}>
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="register">Create account</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <PasswordLoginForm />
            </TabsContent>
            <TabsContent value="register">
              <PasswordRegisterForm />
            </TabsContent>
          </Tabs>
        </div>
      </section>
    </div>
  );
}