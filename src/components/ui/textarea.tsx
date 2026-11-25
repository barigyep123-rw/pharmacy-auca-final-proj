import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-20 w-full rounded-md border border-line bg-paper-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-muted/80 focus:border-pine focus:ring-2 focus:ring-pine/15",
        className,
      )}
      {...props}
    />
  );
}
