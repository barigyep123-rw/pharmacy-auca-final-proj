import { requireUser } from "@/lib/auth";
import { fail, json, readJson } from "@/lib/http";
import { assertQuoteAccess, previewLineTotals, quoteCoverage } from "@/lib/insurance";
import { coverageQuoteSchema, parseBody } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    assertQuoteAccess(user);
    const body = parseBody(coverageQuoteSchema, await readJson(request));
    if (!body.memberNumber.trim()) return json({ quote: null });
    const quote = await quoteCoverage({
      memberNumber: body.memberNumber,
      lines: await previewLineTotals(body.lines),
      acknowledgeRisks: body.acknowledgeRisks,
    });
    return json({ quote });
  } catch (error) {
    return fail(error);
  }
}
