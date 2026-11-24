import { requireUser } from "@/lib/auth";
import { fail, takeId } from "@/lib/http";
import { getPrescriptionPhoto } from "@/lib/pharmacy";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    await requireUser();
    const { id } = await context.params;
    const photo = await getPrescriptionPhoto(takeId(id));
    if (!photo) return new Response(null, { status: 404 });
    return new Response(Buffer.from(photo.bytes), {
      headers: {
        "content-type": photo.type,
        "cache-control": "private, no-cache",
      },
    });
  } catch (error) {
    return fail(error);
  }
}
