"use server";

import { revalidatePath } from "next/cache";
import { apiPost } from "../../lib/api.js";

export async function queryOriginalProvider(formData: FormData) {
  const transactionId = formData.get("transactionId");
  if (typeof transactionId !== "string" || !/^[0-9a-f-]{36}$/i.test(transactionId)) {
    throw new Error("INVALID_TRANSACTION_ID");
  }
  await apiPost(`/api/v1/transactions/${transactionId}/query-provider`);
  revalidatePath(`/transactions/${transactionId}`);
  revalidatePath("/");
}
