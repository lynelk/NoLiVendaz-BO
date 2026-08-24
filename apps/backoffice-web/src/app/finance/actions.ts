"use server";
import { revalidatePath } from "next/cache";
import { apiPost } from "../../lib/api.js";
const text=(f:FormData,k:string)=>String(f.get(k)??"").trim();
export async function syncSettlementsAction(f:FormData){const providerId=text(f,"providerId"),from=text(f,"from"),to=text(f,"to");if(!providerId||!from||!to)throw new Error("SETTLEMENT_SYNC_FIELDS_REQUIRED");await apiPost(`/api/v1/providers/${providerId}/settlements/sync?from=${encodeURIComponent(new Date(from).toISOString())}&to=${encodeURIComponent(new Date(to).toISOString())}`);revalidatePath("/finance");revalidatePath("/reconciliation");}
export async function approveRefundAction(refundId:string){await apiPost(`/api/v1/refunds/${refundId}/approve`);revalidatePath("/finance");revalidatePath("/");}
