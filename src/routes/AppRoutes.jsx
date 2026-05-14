import { Routes, Route } from "react-router-dom";
import { LandingPage } from "../components/LandingPage.jsx";
import { SnapshotRoute } from "./SnapshotRoute";
import { ReportRoute } from "./ReportRoute";
import { NotFound } from "./NotFound";

// Day 4 commit 2: / now renders the new LandingPage. The legacy prototype
// has been retired — App.jsx collapsed to a thin router host.
//   /                       → LandingPage (CTA → /assessment/snapshot)
//   /assessment/snapshot    → IntakeWizard → SnapshotResults (engine-driven)
//   /assessment/report      → Day 5 placeholder (gated route)
//   *                       → 404
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/assessment/snapshot" element={<SnapshotRoute />} />
      <Route path="/assessment/report" element={<ReportRoute />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
