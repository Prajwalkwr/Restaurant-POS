import { Link } from 'react-router-dom';
import { ArrowLeft, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f2f7f2] px-6 py-16 text-center text-[#163026]">
      <div className="max-w-lg">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">404 · Page not found</p>
        <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">This table is empty.</h1>
        <p className="mb-8 text-base leading-7 text-slate-600">
          The page may have moved, or the link may be out of date. Head back to the home page and find your way from there.
        </p>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-emerald-800 px-6 py-3 font-semibold text-white transition-colors hover:bg-emerald-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
        >
          <Home size={17} aria-hidden="true" />
          Back to home
          <ArrowLeft className="rotate-180" size={16} aria-hidden="true" />
        </Link>
      </div>
    </main>
  );
}
