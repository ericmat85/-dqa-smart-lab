import {CASE_RESET_KEY} from './resetCases.mjs';
import React, { useCallback, useEffect, useState } from "react";
import RequestApp from "./RequestApp.jsx";
import LmsApp from "./LmsApp.jsx";
import LabApp from "./LabApp.jsx";
import "./App.css";

function getPath() {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

export default function App() {
  const [path, setPath] = useState(getPath());
  useEffect(()=>{
    const refresh=event=>{if(event.key!==CASE_RESET_KEY)return;try{if(JSON.parse(event.newValue||'{}').phase==='done')window.location.reload();}catch{/* Ignore unrelated malformed reset notices. */}};
    window.addEventListener('storage',refresh);return()=>window.removeEventListener('storage',refresh);
  },[]);

  useEffect(() => {
    const onPopState = () => setPath(getPath());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((nextPath, replace = false) => {
    window.history[replace ? "replaceState" : "pushState"]({}, "", nextPath);
    setPath(getPath());
    window.scrollTo(0, 0);
  }, []);

  // Each system keeps its own route and login page.
  if (path.startsWith("/request/") || path === "/request") {
    return <RequestApp />;
  }

  // /lms 根路徑導向 LMS 入口；根路徑 / 顯示四大系統入口。
  if (path === "/lms") {
    return <LmsApp key="lms-home" />;
  }
  if (path.startsWith("/lms/")) {
    return <LmsApp key="lms" />;
  }

  // These routes are reserved for the other two systems.
  // Their dedicated apps/components can be connected here when available.
  if (path.startsWith("/lab/") || path === "/lab") {
    return <LabApp path={path} navigate={navigate} />;
  }
  if (path.startsWith("/validation/") || path === "/validation") {
    return (
      <PlaceholderPage
        title="驗證計畫"
        message="此入口網址已設定為 /validation/login，但目前 App.jsx 尚未連接專屬系統元件。"
        onBack={() => navigate("/")}
      />
    );
  }

  return <PortalHome navigate={navigate} />;
}

function PlaceholderPage({ title, message, onBack }) {
  return (
    <main style={{
      minHeight: "100vh", display: "grid", placeItems: "center",
      padding: 24, background: "#f4f7fc", color: "#17253b",
      fontFamily: '"DM Sans", "Noto Sans TC", sans-serif'
    }}>
      <section style={{
        width: "min(520px, 100%)", background: "#fff", padding: 32,
        border: "1px solid #e0e8f2", borderRadius: 14, textAlign: "center"
      }}>
        <h1 style={{ marginTop: 0 }}>{title}</h1>
        <p style={{ color: "#718096", lineHeight: 1.8 }}>{message}</p>
        <button onClick={onBack} style={{
          border: 0, borderRadius: 8, padding: "11px 18px",
          background: "#2867c7", color: "#fff", cursor: "pointer"
        }}>返回四大入口</button>
      </section>
    </main>
  );
}

function PortalHome({ navigate }) {
  return (
    <div className="portal-shell">
      <header className="portal-header">
        <a
          className="portal-brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
        >
          <span className="portal-mark"><i /><i /><i /></span>
          <span>
            DQA <b>SMART LAB</b>
            <small>Digital Quality Assurance Workspace</small>
          </span>
        </a>
        <span className="portal-tag"><i /> DEMO ENVIRONMENT</span>
      </header>

      <main className="portal-main">
        <section className="portal-intro">
          <span className="portal-eyebrow">DQA DIGITAL WORKSPACE</span>
          <h1>可靠度試驗<br /><em>數位工作平台</em></h1>
          <p>
            請依照您的工作角色，選擇要進入的系統。各系統目前使用示範資料，尚未連接公司正式資料。
          </p>
        </section>

        <section className="portal-choices" aria-label="選擇系統">
          <button className="portal-card request-card" onClick={() => navigate("/request/login")}>
            <span className="portal-card-icon">↗</span>
            <span className="portal-card-kicker">FOR REQUESTERS</span>
            <strong>電子委託單系統</strong>
            <span className="portal-card-desc">建立試驗需求、送出簽核、查詢委託進度與報告交付。</span>
            <span className="portal-card-bottom">進入委託系統 <b>→</b></span>
          </button>

          <button className="portal-card lab-card" onClick={() => navigate("/lms/login")}>
            <span className="portal-card-icon">⌘</span>
            <span className="portal-card-kicker">FOR LAB ENGINEERS</span>
            <strong>DQA LMS 實驗室管理系統</strong>
            <span className="portal-card-desc">管理試驗案件、樣品、設備、排程及試驗執行進度。</span>
            <span className="portal-card-bottom">進入 LMS <b>→</b></span>
          </button>

          <button className="portal-card lab-card" onClick={() => navigate("/lab/login")}>
            <span className="portal-card-icon">⚙</span>
            <span className="portal-card-kicker">FOR LAB OPERATIONS</span>
            <strong>造隆實驗室系統</strong>
            <span className="portal-card-desc">進入造隆實驗室作業與管理系統。</span>
            <span className="portal-card-bottom">進入實驗室系統 <b>→</b></span>
          </button>

          <button className="portal-card request-card" onClick={() => navigate("/validation/login")}>
            <span className="portal-card-icon">✓</span>
            <span className="portal-card-kicker">FOR VALIDATION PLANNING</span>
            <strong>驗證計畫</strong>
            <span className="portal-card-desc">建立與追蹤產品驗證計畫及試驗進度。</span>
            <span className="portal-card-bottom">進入驗證計畫 <b>→</b></span>
          </button>
        </section>

        <section className="portal-note">
          <span>i</span>
          <p>
            <b>原型測試提醒</b><br />
            此入口負責系統導向。登入、資料保存與角色權限尚未連接正式後端，請勿輸入公司機密資料。
          </p>
        </section>
      </main>

      <footer className="portal-footer">
        <span>© 2026 DQA Smart Lab</span>
        <span>Prototype · Fake data only</span>
      </footer>
    </div>
  );
}
