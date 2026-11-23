import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border border-line bg-paper-2 px-3 text-sm text-ink outline-none placeholder:text-muted/80 focus:border-pine focus:ring-2 focus:ring-pine/20",
        className,
      )}
      {...props}
    />
  );
}
