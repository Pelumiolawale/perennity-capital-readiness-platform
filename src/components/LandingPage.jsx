import { Link } from "react-router-dom";

// Landing page = workspace entry point. The marketing site
// (perennitybridge.com) does the positioning lift; this page is honest,
// plain, single-purpose. Single primary CTA to /assessment/snapshot.
export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F8F6F2] text-[#0B1F2A] font-sans">
      {/* Header */}
      <header className="border-b border-[#DDD5CA]">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="text-lg font-bold tracking-wide">
            PERENNITY BRIDGE
          </div>
          <div className="text-xs text-[#5C6B5C] uppercase tracking-wider">
            Capital Readiness Platform
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-16 pb-12 text-center">
        <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-6">
          Capital readiness, assessed against the rules that move capital.
        </h1>
        <p className="text-lg text-[#5C6B5C] mb-10 max-w-2xl mx-auto">
          Perennity Bridge assesses data centre projects against EU Taxonomy
          Activity 8.1 substantial contribution and do-no-significant-harm
          criteria, and produces investor-grade readiness reports.
        </p>
        <Link
          to="/assessment/snapshot"
          className="inline-block bg-[#4ECDA4] text-[#0B1F2A] px-8 py-4 rounded-lg text-base font-semibold hover:bg-[#3AB58D] no-underline"
        >
          Start a Capital Alignment Review
        </Link>
        <p className="mt-6 text-xs text-[#8A957F] max-w-2xl mx-auto">
          Activity 8.1 coverage is live today. Broader framework coverage
          &mdash; SFDR Article 8/9, UK SDR, EU Green Bond Standard &mdash; is
          in active development.
        </p>
      </section>

      {/* Three-column "what you'll get" */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <h2 className="text-lg font-semibold text-center mb-10 text-[#0B1F2A]">
          What you&rsquo;ll get from the Snapshot
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          <Column
            glyph="◆"
            heading="Indicative score"
            body="A deterministic score against EU Taxonomy Activity 8.1 technical screening criteria."
          />
          <Column
            glyph="◆"
            heading="Framework heatmap"
            body="Pass/fail/partial verdicts on substantial contribution and do-no-significant-harm criteria."
          />
          <Column
            glyph="◆"
            heading="Gap list"
            body="The specific items you&rsquo;d need to resolve to meet investor-grade thresholds."
          />
        </div>
      </section>

      {/* Honest framing */}
      <section className="max-w-3xl mx-auto px-6 py-10 text-center">
        <p className="text-sm text-[#5C6B5C] leading-relaxed">
          The Snapshot is a free diagnostic. The Report tier &mdash; signed,
          investor-grade, with full minimum safeguards assessment and an IC
          defence pack &mdash; is a separate engagement. Contact us when
          you&rsquo;re ready.
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#DDD5CA] mt-8">
        <div className="max-w-5xl mx-auto px-6 py-6 text-xs text-[#8A957F] flex justify-between">
          <span>hello@perennitybridge.com</span>
          <span>perennitybridge.com</span>
        </div>
      </footer>
    </div>
  );
}

function Column({ glyph, heading, body }) {
  return (
    <div className="text-center md:text-left">
      <div className="text-2xl text-[#4ECDA4] mb-2" aria-hidden="true">
        {glyph}
      </div>
      <h3 className="text-base font-semibold mb-2 text-[#0B1F2A]">{heading}</h3>
      <p className="text-sm text-[#5C6B5C] leading-relaxed">{body}</p>
    </div>
  );
}
