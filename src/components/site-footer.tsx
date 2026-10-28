import HalftoneWordmarkFooter from "@/components/ui/halftone-wordmark-footer";

export function SiteFooter() {
  return (
    <HalftoneWordmarkFooter
      wordmark="agents"
      label="Agent Caller"
      meta={`©${new Date().getFullYear()} · Built for the people who keep things running`}
      preset="night"
      palette={{ background: "#07131c", ink: "#d8e8e9", warm: "#c39355" }}
      height="560px"
      dotGap={6}
      radius={86}
      crop={0.2}
      grain={0.48}
    />
  );
}
