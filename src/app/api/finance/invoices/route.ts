import { assertAccess } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { createInvoice, listInvoices } from "@/lib/finance";
import { fail, json, readJson } from "@/lib/http";
import { invoiceSchema, parseBody } from "@/lib/validators";

export async function GET() {
  try {
    const user = await requireUser();
    assertAccess(user.role, "finance");
    return json({ invoices: await listInvoices() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    assertAccess(user.role, "finance");
    const invoice = await createInvoice(user, parseBody(invoiceSchema, await readJson(request)));
    return json({ invoice }, 201);
  } catch (error) {
    return fail(error);
  }
}
