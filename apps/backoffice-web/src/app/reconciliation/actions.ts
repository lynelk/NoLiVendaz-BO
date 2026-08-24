"use server";
import { revalidatePath } from "next/cache";
import { apiPost } from "../../lib/api";
export async function runReconciliationAction(formData:FormData){const graceMinutes=Number(String(formData.get("graceMinutes")??"30"));if(!Number.isInteger(graceMinutes)||graceMinutes<1||graceMinutes>10080)throw new Error("INVALID_RECONCILIATION_GRACE");await apiPost('/api/v1/reconciliation/run',{graceMinutes});revalidatePath('/reconciliation');revalidatePath('/');}
