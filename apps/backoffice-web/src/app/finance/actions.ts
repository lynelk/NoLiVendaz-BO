"use server";
import { revalidatePath } from "next/cache";
import { apiPost } from "../../lib/api";
const text=(f:FormData,k:string)=>String(f.get(k)??"").trim();
function kampalaLocalToIso(value:string){if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value))throw new Error("INVALID_SETTLEMENT_TIME");const local=value.length===16?`${value}:00`:value;const date=new Date(`${local}+03:00`);if(!Number.isFinite(date.getTime()))throw new Error("INVALID_SETTLEMENT_TIME");return date.toISOString();}
export async function syncSettlementsAction(f:FormData){const providerId=text(f,"providerId"),from=text(f,"from"),to=text(f,"to");if(!providerId||!from||!to)throw new Error("SETTLEMENT_SYNC_FIELDS_REQUIRED");const fromIso=kampalaLocalToIso(from),toIso=kampalaLocalToIso(to);if(Date.parse(toIso)<=Date.parse(fromIso))throw new Error("SETTLEMENT_RANGE_INVALID");await apiPost(`/api/v1/providers/${providerId}/settlements/sync?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`);revalidatePath("/finance");revalidatePath("/reconciliation");}
export async function approveRefundAction(refundId:string){await apiPost(`/api/v1/refunds/${refundId}/approve`);revalidatePath("/finance");revalidatePath("/");}
