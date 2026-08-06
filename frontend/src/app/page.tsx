import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import TelemetryStrip from "@/components/landing/TelemetryStrip";
import BentoGrid from "@/components/landing/BentoGrid";
import PipelineSection from "@/components/landing/PipelineSection";
import CTASection from "@/components/landing/CTASection";
import WordmarkSection from "@/components/landing/WordmarkSection";
import Footer from "@/components/landing/Footer";
import ForceDark from "@/components/landing/ForceDark";


/**
 * Marketing landing page — the front door.
 *
 * `landing-root` scopes the Fraunces/Inter/JetBrains type stack to this tree
 * only (see globals.css), so the product pages keep their Geist stack.
 *
 * This is a server component; every child carries its own "use client" because
 * they all animate or draw to canvas.
 *
 * Deliberately dark-only — <ForceDark> pins it regardless of the user's theme
 * preference, and no theme toggle is rendered here. The hero cube is an opaque
 * video masked against a black page and cannot survive a light background;
 * see components/landing/ForceDark.tsx for the full reasoning.
 */
export default function HomePage() {
  return (
    <div className="landing-root min-h-screen bg-neutral-950">
      <ForceDark />
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
