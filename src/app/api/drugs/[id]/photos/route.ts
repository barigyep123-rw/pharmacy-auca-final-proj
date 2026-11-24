import { requireUser } from "@/lib/auth";
import { fail, json, readJson, takeId } from "@/lib/http";
import { addDrugPhoto, listDrugPhotos } from "@/lib/pharmacy";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    await requireUser();
    const { id } = await context.params;
    return json({ photos: await listDrugPhotos(takeId(id)) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = await readJson(request) as { photo?: string };
    if (!body.photo) return json({ error: "Choose a photo." }, 400);
    const result = await addDrugPhoto(user, takeId(id), body.photo);
    return json(result, 201);
  } catch (error) {
    return fail(error);
  }
}
