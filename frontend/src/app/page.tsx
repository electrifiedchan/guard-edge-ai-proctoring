import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import TelemetryStrip from "@/components/landing/TelemetryStrip";
import BentoGrid from "@/components/landing/BentoGrid";
import PipelineSection from "@/components/landing/PipelineSection";
import CTASection from "@/components/landing/CTASection";
import WordmarkSection from "@/components/landing/WordmarkSection";
import Footer from "@/components/landing/Footer";

/**
 * Marketing landing page — the front door.
 *
 * `landing-root` scopes the Fraunces/Inter/JetBrains type stack to this tree
 * only (see globals.css), so the product pages keep their Geist stack.
 *
 * This is a server component; every child carries its own "use client" because
 * they all animate or draw to canvas.
 */
export default function HomePage() {
  return (
    <div className="landing-root min-h-screen bg-neutral-950">
      <Navbar />
      <Hero />
      <TelemetryStrip />
      <BentoGrid />
      <PipelineSection />
      <CTASection />
      <WordmarkSection />
      <Footer />
    </div>
  );
}
