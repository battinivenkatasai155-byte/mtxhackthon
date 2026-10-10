import React, { useCallback, useEffect, useState } from "react";
import Header from "./components/Header.jsx";
import Footer from "./components/Footer.jsx";
import LandingPage from "./components/LandingPage.jsx";
import PortalSelection from "./components/PortalSelection.jsx";
import LoginPage from "./components/LoginPage.jsx";
import CitizenDashboard from "./components/CitizenDashboard.jsx";
import AdminDashboard from "./components/AdminDashboard.jsx";
import VoiceAssistant from "./components/VoiceAssistant.jsx";
import CentralDashboard from "./components/CentralDashboard.jsx";
import { ToastContainer } from "./components/Toast.jsx";
import { api } from "./api.js";

const EMPTY_DATA = { complaints: [], citizens: [], notifications: [], departments: [] };

export default function App() {
  // view: landing | portals | login | dashboard
  const [view, setView] = useState("landing");
  const [portalMode, setPortalMode] = useState("login");
  const [portal, setPortal] = useState("citizen");
  const [session, setSession] = useState(null);
  const [data, setData] = useState(EMPTY_DATA);
  const [toasts, setToasts] = useState([]);
  const [booting, setBooting] = useState(true);

  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const notify = useCallback(
    (message, type = "info") => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((t) => [...t, { id, message, type }]);
      setTimeout(() => dismissToast(id), 4500);
    },
    [dismissToast]
  );

  const reload = useCallback(async () => {
    const next = await api.bootstrap();
    setData(next);
  }, []);

  const startSession = useCallback(
    async (s) => {
      await reload();
      setSession(s);
      setView("dashboard");
    },
    [reload]
  );

  // Restore an existing server session on page load
  useEffect(() => {
    api
      .me()
      .then(startSession)
      .catch(() => {})
      .finally(() => setBooting(false));
  }, [startSession]);

  // Keep the dashboard fresh (new complaints, status changes)
  useEffect(() => {
    if (!session) return undefined;
    const timer = setInterval(() => reload().catch((e) => e.status === 401 && endSession()), 30000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, reload]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view, portal]);

  function endSession() {
    setSession(null);
    setData(EMPTY_DATA);
    setView("landing");
  }

  async function handleLogin(s) {
    try {
      await startSession(s);
      notify(`Signed in as ${s.user.name}.`, "success");
    } catch (err) {
      notify(err.message, "error");
    }
  }

  async function handleLogout() {
    await api.logout().catch(() => {});
    endSession();
    notify("You have been logged out.", "info");
  }

  async function handleSubmitComplaint(form, file) {
    const created = await api.submitComplaint(form);
    let complaints = created.complaints;
    if (file) {
      try {
        complaints = (await api.uploadAttachment(created.id, file)).complaints;
      } catch (err) {
        notify(`Complaint saved, but the attachment failed: ${err.message}`, "error");
      }
    }
    setData((d) => ({ ...d, complaints }));
    return created.id;
  }

  async function handleUpdateComplaint(id, changes) {
    const result = await api.updateComplaint(id, changes);
    setData((d) => ({ ...d, complaints: result.complaints }));
    return { changed: result.changed };
  }

  async function handleAddDepartment(dept) {
    const result = await api.addDepartment(dept);
    setData((d) => ({ ...d, departments: result.departments }));
  }

  async function handleMarkAllRead() {
    const result = await api.markRead();
    setData((d) => ({ ...d, notifications: result.notifications }));
  }

  async function handleUpdateUser(changes) {
    const result = await api.updateProfile(changes);
    setSession((s) => ({ ...s, user: result.user }));
  }

  const openPortal = (key, mode = "login") => {
    setPortal(key);
    setPortalMode(mode);
    setView("login");
  };

  const scrollToSection = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  let content;
  if (booting) {
    content = (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted" role="status">
        Loading GrievanceIQ…
      </div>
    );
  } else if (view === "dashboard" && session?.role === "citizen") {
    content = (
      <CitizenDashboard
        user={session.user}
        complaints={data.complaints}
        notifications={data.notifications}
        departments={data.departments}
        onSubmit={handleSubmitComplaint}
        onMarkAllRead={handleMarkAllRead}
        onUpdateUser={handleUpdateUser}
        onLogout={handleLogout}
        notify={notify}
      />
    );
  } else if (view === "dashboard" && session?.role === "admin") {
    content = (
      <AdminDashboard
        user={session.user}
        complaints={data.complaints}
        citizens={data.citizens}
        notifications={data.notifications}
        departments={data.departments}
        onUpdateComplaint={handleUpdateComplaint}
        onAddDepartment={handleAddDepartment}
        onMarkAllRead={handleMarkAllRead}
        onLogout={handleLogout}
        notify={notify}
      />
    );
  } else if (view === "dashboard" && session?.role === "central") {
    content = <CentralDashboard user={session.user} complaints={data.complaints} citizens={data.citizens} departments={data.departments} onLogout={handleLogout} />;
  } else if (view === "login") {
    content = (
      <>
        <Header minimal onHome={() => setView("landing")} />
        <LoginPage key={portal + portalMode} portal={portal} initialMode={portalMode} onLogin={handleLogin} onBack={() => setView("portals")} />
      </>
    );
  } else if (view === "portals") {
    content = (
      <>
        <Header minimal onHome={() => setView("landing")} />
        <main id="main" className="min-h-[70vh]">
          <PortalSelection standalone onSelect={openPortal} />
        </main>
        <Footer />
      </>
    );
  } else {
    content = (
      <>
        <Header onHome={() => scrollToSection("home")} onSignIn={() => setView("portals")} onSignUp={() => openPortal("citizen", "register")} onNavigate={scrollToSection} />
        <main id="main">
          <LandingPage onGetStarted={() => openPortal("citizen", "register")} onSelectPortal={openPortal} />
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <a
        href="#main"
        className="sr-only z-[70] rounded-lg bg-white px-4 py-2 font-semibold text-navy focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      {content}
      <VoiceAssistant role={session?.role} user={session?.user} complaints={data.complaints} />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
