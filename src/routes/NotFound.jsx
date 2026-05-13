import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] text-center flex-col font-sans text-[#0B1F2A]">
      <h1 className="text-5xl font-bold mb-4">404</h1>
      <p className="mb-6 text-[#5C6B5C]">Page not found.</p>
      <Link to="/" className="text-[#1B6B4A] underline">
        Back to home
      </Link>
    </div>
  );
}
