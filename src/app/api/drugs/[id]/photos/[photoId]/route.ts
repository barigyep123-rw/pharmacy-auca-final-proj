import { requireUser } from "@/lib/auth";
import { fail, json, takeId } from "@/lib/http";
import { getDrugPhotoById, removeDrugPhoto } from "@/lib/pharmacy";

type Context = { params: Promise<{ id: string; photoId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    await requireUser();
    const { id, photoId } = await context.params;
    const photo = await getDrugPhotoById(takeId(id), takeId(photoId));
    if (!photo) return new Response(null, { status: 404 });
    return new Response(Buffer.from(photo.bytes), {
      headers: { "content-type": photo.type, "cache-control": "private, no-cache" },
    });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id, photoId } = await context.params;
    return json({ photos: await removeDrugPhoto(user, takeId(id), takeId(photoId)) });
  } catch (error) {
    return fail(error);
  }
}
