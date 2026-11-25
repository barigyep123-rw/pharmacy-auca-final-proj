import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-paper text-muted",
  pine: "bg-pine-soft text-pine",
  brass: "bg-brass-soft text-brass",
  clay: "bg-clay-soft text-clay",
  amber: "bg-amber-soft text-amber",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
