import AppRoutes from "./routes/AppRoutes.jsx";

// App is a thin router host. All routing lives in src/routes/AppRoutes.jsx.
// The legacy ~2,500-line prototype was retired in Day 4 commit 2 alongside
// the deletion of the legacy scoring / labels / regulations modules.
export default function App() {
  return <AppRoutes />;
}
