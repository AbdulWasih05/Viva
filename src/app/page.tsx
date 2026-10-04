import { VivaApp } from "@/components/VivaApp";
import { getModelName, getProvider } from "@/lib/llm/provider";
import { SAMPLES, isLocalMode } from "@/lib/server/sources";

// Read the mode and model from the environment on each request, not once at build time.
export const dynamic = "force-dynamic";

export default function Home() {
  const modelLabel = `${getProvider() === "hosted" ? "Hosted" : "Local"} Gemma: ${getModelName()}`;
  return <VivaApp localMode={isLocalMode()} modelLabel={modelLabel} samples={SAMPLES} />;
}
